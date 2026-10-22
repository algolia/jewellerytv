import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  type UIEvent,
} from 'react';
import { useChat } from 'react-instantsearch';
import type {
  ChatOnErrorCallback,
  ChatOnFinishCallback,
  UIMessage,
} from 'instantsearch.js/es/lib/ai-lite';
import Markdown from 'markdown-to-jsx';
import { X } from 'lucide-react';
import { ShoppingWorkspace } from '../ShoppingWorkspace';
import { ConciergeWorkspaceLayout } from './ConciergeWorkspaceLayout';
import { ResponsiveAnswerTable } from './ResponsiveAnswerTable';
import { ConnectedShoppingBrief } from './ConnectedShoppingBrief';
import { ConnectedWelcome, composerSendText, shouldShowEntryGuidance } from './EntryGuidance';
import { STARTER_QUESTION_POOL, selectStarterSet, type StarterQuestion } from './starterQuestions';
import { createConciergeWorkspaceSession } from './ConciergeWorkspaceProvider';
import { extractNativePresentation, stripTrailingNote } from './nativeResults';
import { buildClientTools } from './clientTools';
import type { WorkspaceGroup } from '../workspaceResults';
import { getFailedToolDetails, hasFailedTool, isCompletedAssistantTurn, turnHasUsableResult } from './turnCompletion';
import { applyBriefOperationsV3, undoBriefV3 } from '../../shared/briefState.js';
import { buildTurnContext } from './turnContext.js';
import { canonicalBlogUrlsFromMessages, verifiedBlogHref } from './verifiedBlogLinks.js';
import { recordTurnOutcome } from '../telemetry';

type TurnFinish = {
  messages: UIMessage[];
  isAbort: boolean;
  isError: boolean;
};
type PendingTurn = { sourceMessageId: string; turnId: string };
type ResetOutcome = { ok: true } | { ok: false; reason: string };
type TurnOutcome = Pick<TurnFinish, 'isAbort' | 'isError'> | null;

/** Resetting closes the send gate before its async persistence work begins. */
export function canSubmitConnectedTurn(
  text: string,
  pending: boolean,
  resetting: boolean,
  blocked?: string,
) {
  return !!text.trim() && !pending && !resetting && !blocked;
}

/** Show only current-turn SDK activity; elapsed time is displayed separately. */
export function connectedProgressLabel(
  chatStatus: string,
  messages: readonly UIMessage[],
  sourceMessageId: string,
) {
  if (chatStatus === 'submitted') return 'Sending to Concierge';
  const sourceIndex = messages.findIndex(
    (message) => message.role === 'user' && message.id === sourceMessageId,
  );
  if (sourceIndex < 0) return 'Concierge is working';
  const parts = messages
    .slice(sourceIndex + 1)
    .filter((message) => message.role === 'assistant')
    .flatMap((message) => message.parts) as Array<{ type: string; state?: string; text?: string }>;
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (part.type === 'text' && part.text?.trim()) return 'Concierge is replying';
    if (!part.type.startsWith('tool-')) continue;
    if (part.state === 'output-available' || part.state === 'output-error')
      return 'Continuing your request';
    if (part.state !== 'input-streaming' && part.state !== 'input-available') continue;
    if (part.type === 'tool-update_shopping_state') return 'Updating preferences';
    if (part.type === 'tool-retrieve_evidence') return 'Checking JTV information';
    if (part.type === 'tool-present_choices') return 'Preparing product choices';
    return 'Working with JTV information';
  }
  return 'Concierge is working';
}

/**
 * Keep the synchronous reset lock until the SDK transcript has actually been
 * cleared and the prompt has been restored. This is deliberately callback
 * based so the race is testable without reaching into SDK internals.
 */
export async function resetConnectedConversation(
  resettingRef: { current: boolean },
  resetMission: () => Promise<ResetOutcome>,
  clearMessages: () => void,
  setInput: (value: string) => void,
  focusInput: () => void,
): Promise<ResetOutcome> {
  if (resettingRef.current) return { ok: false, reason: 'reset_in_progress' };
  resettingRef.current = true;
  try {
    const result = await resetMission();
    if (!result.ok) return result;
    clearMessages();
    setInput('');
    focusInput();
    return result;
  } finally {
    resettingRef.current = false;
  }
}

function newId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${random ?? Math.random().toString(36).slice(2)}`;
}

function safeStorage(): Storage {
  if (typeof window !== 'undefined') {
    try {
      return window.sessionStorage;
    } catch {
      // Private browsing and blocked storage still get an in-memory session.
    }
  }
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

function displayTextParts(message: UIMessage) {
  if (message.role === 'user') {
    const text = messageText(message);
    return text ? [text] : [];
  }
  const segments: string[] = [];
  let current = '';
  for (const part of message.parts) {
    if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
      current += part.text;
    } else if (current.trim()) {
      segments.push(current);
      current = '';
    } else {
      current = '';
    }
  }
  if (current.trim()) segments.push(current);
  /* F1: the agent's trailing NOTE line is bookkeeping, never shopper copy.
   * Only the display drops it; the conversation state above keeps the raw
   * text. Echoing the note back stays behind NOTE_ECHO_ENABLED (default OFF)
   * while Arijit decides whether the NOTE stays. */
  if (segments.length) {
    const stripped = stripTrailingNote(segments[segments.length - 1]);
    if (stripped.note !== null) {
      if (stripped.display.trim()) segments[segments.length - 1] = stripped.display;
      else segments.pop();
    }
  }
  return segments;
}

/** Persisted turns are shown after reload only when their final response is complete. */
export function isRestoredAssistantMessage(message: UIMessage) {
  if (message.role !== 'assistant') return false;
  let hasFinalText = false;
  for (const part of message.parts) {
    if (part.type === 'text') {
      if (part.state === 'streaming') return false;
      if (typeof part.text === 'string' && part.text.trim()) hasFinalText = true;
      continue;
    }
    if (
      'state' in part &&
      typeof part.type === 'string' &&
      part.type.startsWith('tool-') &&
      part.state !== 'output-available'
    )
      return false;
  }
  return hasFinalText && !messageText(message).startsWith('[System notice]');
}

export function getConnectedChatPersistenceOptions(missionId: string) {
  return { id: missionId, persistence: true as const };
}

/**
 * Reveal persisted completed answers after a reload. The SDK fills messages from
 * storage during widget init, which can land after this reconciliation's first
 * run, so the reconciliation reveals whatever eligible answers are already
 * present on each run and stays armed (without consuming itself) until every
 * receipt id has arrived — a stale receipt id that never arrives must not
 * suppress the valid answers that did.
 */
export function reconcileRestoredReveal(
  hydratedId: string | null,
  messages: readonly UIMessage[],
  storage: Storage,
): { hydratedId: string | null; revealed: string[] } {
  if (hydratedId === RECEIPT_RECONCILED) return { hydratedId, revealed: [] };
  migrateLegacyCompletionReceipts(storage, messages);
  const completedIds = readCompletedAssistantMessageIds(storage);
  const revealed = messages
    .filter((message) => completedIds.has(message.id) && isRestoredAssistantMessage(message))
    .map((message) => message.id);
  // Legacy keys only matter while the transcript may still be empty because
  // hydration has not landed: settling on an empty transcript would delete
  // them before their ids could ever be migrated.
  const waitingForHydration =
    messages.length === 0 && legacyCompletionReceiptKeys(storage).length > 0;
  const allArrived =
    !waitingForHydration &&
    [...completedIds].every((id) => messages.some((message) => message.id === id));
  if (!allArrived) return { hydratedId, revealed };
  removeLegacyCompletionReceipts(storage);
  return { hydratedId: RECEIPT_RECONCILED, revealed };
}

type CompletionReceipt = { version: 1; assistantMessageIds: string[] };

/**
 * The completion receipt is session-scoped, deliberately not keyed by the mission
 * id: the workspace session and the shopping snapshot hold different mission ids,
 * and the snapshot's id can be replaced mid-turn, so a mission-keyed receipt is
 * written under an id that no longer exists after a reload.
 */
const COMPLETION_RECEIPT_KEY = 'jtv-concierge-completed-assistants';
const RECEIPT_RECONCILED = 'reconciled';

function completionReceiptKey() {
  return COMPLETION_RECEIPT_KEY;
}

export function readCompletedAssistantMessageIds(storage: Storage) {
  try {
    const parsed = JSON.parse(
      storage.getItem(completionReceiptKey()) ?? 'null',
    ) as Partial<CompletionReceipt> | null;
    return parsed?.version === 1 && Array.isArray(parsed.assistantMessageIds)
      ? new Set(parsed.assistantMessageIds.filter((id): id is string => typeof id === 'string'))
      : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

export function recordCompletedAssistantMessage(storage: Storage, assistantMessageId: string) {
  const ids = readCompletedAssistantMessageIds(storage);
  ids.add(assistantMessageId);
  try {
    storage.setItem(
      completionReceiptKey(),
      JSON.stringify({ version: 1, assistantMessageIds: [...ids] } satisfies CompletionReceipt),
    );
  } catch {
    // Transcript persistence remains best effort when browser storage is unavailable.
  }
}

export function clearCompletedAssistantMessages(storage: Storage) {
  try {
    storage.removeItem(completionReceiptKey());
  } catch {
    // Storage failures must not block the mission reset itself.
  }
}

/**
 * Upgrade path from the pre-fix mission-keyed completion receipts. Legacy keys
 * were written under a mission id that the snapshot could replace mid-turn, so
 * their ids are only trustworthy when they match the current SDK transcript AND
 * pass the same completed-answer predicate the session receipt uses. Matching
 * ids are merged into the session receipt; the legacy keys themselves are
 * removed only at the reconciliation's terminal run so a not-yet-hydrated
 * transcript can still migrate on a later pass.
 */
const LEGACY_RECEIPT_PREFIX = 'jtv-concierge-completed-';

export function legacyCompletionReceiptKeys(storage: Storage): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key && key.startsWith(LEGACY_RECEIPT_PREFIX) && key !== completionReceiptKey())
        keys.push(key);
    }
  } catch {
    // Storage unavailable: nothing to migrate.
  }
  return keys;
}

export function migrateLegacyCompletionReceipts(storage: Storage, messages: readonly UIMessage[]) {
  const legacyIds = legacyCompletionReceiptKeys(storage).flatMap((key) => {
    try {
      const parsed = JSON.parse(
        storage.getItem(key) ?? 'null',
      ) as Partial<CompletionReceipt> | null;
      return parsed?.version === 1 && Array.isArray(parsed.assistantMessageIds)
        ? parsed.assistantMessageIds.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  });
  const alreadyRecorded = readCompletedAssistantMessageIds(storage);
  const eligible = new Set(
    messages
      .filter(
        (message) =>
          legacyIds.includes(message.id) &&
          isRestoredAssistantMessage(message) &&
          !alreadyRecorded.has(message.id),
      )
      .map((message) => message.id),
  );
  eligible.forEach((id) => recordCompletedAssistantMessage(storage, id));
  return [...eligible];
}

function removeLegacyCompletionReceipts(storage: Storage) {
  legacyCompletionReceiptKeys(storage).forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
      // Best effort cleanup; leftover keys are harmless and tab-scoped.
    }
  });
}

export function visibleConnectedTranscript(
  messages: UIMessage[],
  resetting: boolean,
  hiddenPriorMessageIds: ReadonlySet<string> = new Set(),
) {
  return resetting ? [] : messages.filter((message) => !hiddenPriorMessageIds.has(message.id));
}

function latestAssistant(messages: readonly UIMessage[]) {
  return [...messages].reverse().find((message) => message.role === 'assistant');
}

export function parseVerifiedProductLink(href: string | undefined, knownIds: ReadonlySet<string>) {
  const match = href?.match(/^\/product\/([^/?#]+)$/);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return knownIds.has(id) ? id : null;
}

/** Fixed UI status, never presented as generated Concierge language. A turn
 * that finished cleanly but committed a failed tool part is not a transport
 * failure: the request went through and a product step did not, so it gets
 * its own honest notice instead of the transport copy. */
export function getConnectedTurnSystemNotice(
  messages: readonly UIMessage[],
  finish: TurnOutcome,
  hasTransportError = false,
) {
  const assistant = latestAssistant(messages);
  const text = assistant ? messageText(assistant) : '';
  if (text.startsWith('[System notice]')) return text;
  if (finish?.isAbort)
    return '[System notice] This request was stopped before a complete response. Existing product choices remain.';
  if (finish?.isError || hasTransportError)
    return '[System notice] That message did not go through. Send it again and the conversation picks up right where it left off. Existing product choices remain.';
  if (hasFailedTool(messages) && !turnHasUsableResult(messages))
    return '[System notice] A product step in this request failed or timed out, so the reply may be incomplete. Ask again and the conversation picks up right where it left off. Existing product choices remain.';
  return '[System notice] This request did not produce a complete response. Existing product choices remain.';
}

export function ConversationMessage({
  message,
  revealed,
  provisional = false,
  verifiedBlogUrls,
  knownProductIds = new Set<string>(),
  onProductLink,
}: {
  message: UIMessage;
  revealed: boolean;
  provisional?: boolean;
  verifiedBlogUrls?: ReadonlySet<string>;
  knownProductIds?: ReadonlySet<string>;
  onProductLink?: (id: string, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const textParts = displayTextParts(message);
  if (!textParts.length) return null;
  if (message.role === 'user')
    return <p className="connected-message connected-user-message">{textParts[0]}</p>;
  if (!revealed && !provisional) return null;
  return (
    <div
      className={`connected-message connected-assistant-message${provisional ? ' connected-provisional' : ' connected-markdown'}`}
      aria-live={provisional ? 'off' : undefined}
    >
      <span className="connected-assistant-label" aria-hidden="true">
        Concierge
      </span>
      {textParts.map((text, index) => (
        <div className="connected-assistant-text-part" key={`${message.id}-text-${index}`}>
          {provisional ? (
            text
          ) : (
            <Markdown
              options={{
                disableParsingRawHTML: true,
                overrides: {
                  table: {
                    component: ResponsiveAnswerTable,
                  },
                  a: {
                    component: ({ href, children }: { href?: string; children?: ReactNode }) => {
                      const productId = href?.match(/^\/product\/[^/?#]+$/)
                        ? parseVerifiedProductLink(href, knownProductIds)
                        : null;
                      const productHref = productId ? href : null;
                      const articleHref = verifiedBlogHref(href, verifiedBlogUrls ?? new Set());
                      const safeHref = productHref ?? articleHref;
                      if (!safeHref) return <span>{children}</span>;
                      return (
                        <a
                          href={safeHref}
                          target={productHref ? undefined : '_blank'}
                          rel={productHref ? undefined : 'noopener noreferrer'}
                          onClick={
                            productId && onProductLink
                              ? (event) => onProductLink(productId, event)
                              : undefined
                          }
                        >
                          {children}
                        </a>
                      );
                    },
                  },
                },
              }}
            >
              {text}
            </Markdown>
          )}
        </div>
      ))}
    </div>
  );
}

export function ConnectedConcierge({
  context,
  blocked,
  onClose,
  open = true,
  prefill = null,
}: {
  context?: () => Record<string, string>;
  blocked?: string;
  onClose: () => void;
  open?: boolean;
  prefill?: { text: string; token: number } | null;
}) {
  const latestTurn = useRef<{ turnId: string; sourceMessageId: string }>({
    turnId: '',
    sourceMessageId: '',
  });
  const finishRef = useRef<TurnFinish | null>(null);
  const resettingRef = useRef(false);
  const manualEditEpoch = useRef(0);
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [resetting, setResetting] = useState(false);
  // Starter set for the current conversation: varied across scenarios and
  // sentence voices, re-selected on each new conversation so consecutive
  // welcome views differ. UI label rotation only; no shopper data, no tracking.
  const [starterSet, setStarterSet] = useState<readonly StarterQuestion[]>(() =>
    selectStarterSet(STARTER_QUESTION_POOL),
  );
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [hiddenPriorMessageIds, setHiddenPriorMessageIds] = useState<Set<string>>(() => new Set());
  const [systemNotices, setSystemNotices] = useState<string[]>([]);
  const [section, setSection] = useState<'conversation' | 'products'>('conversation');
  const [briefControls, setBriefControls] = useState<HTMLDivElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const followTranscriptRef = useRef(true);
  const onMessagesScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget;
    followTranscriptRef.current =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 80;
  }, []);
  const pendingTurnId = pending?.turnId;
  useEffect(() => {
    if (!pendingTurnId) return;
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [pendingTurnId]);
  const session = useMemo(
    () =>
      createConciergeWorkspaceSession({
        storage: safeStorage(),
        initialMissionId: newId('mission'),
      }),
    [],
  );
  const snapshot = useSyncExternalStore(
    session.store.subscribe,
    session.store.getSnapshot,
    session.store.getSnapshot,
  );
  /* F1: cards staged from the native agent's own grouped tool calls. Held in
   * component state (not the persisted session contract) because they carry no
   * evidence ledger; a mission reset clears them with the conversation. */
  const [nativeGroups, setNativeGroups] = useState<WorkspaceGroup[] | null>(null);
  const model = session.getModel(nativeGroups ?? undefined);
  const runtime = session.runtime;
  const brief = snapshot?.brief;
  /* Product link guard, simplified 2026-10-22: a chat link opens the PDP only
   * when the id is a product this session actually holds. Every record in the
   * store passed identity verification when it was staged (its own objectID
   * matched what the agent named), so the known-records set is the guard; the
   * old evidence-ledger distinction retired with the Save and Compare build. */
  const knownProductIds = useMemo(
    () =>
      new Set([
        ...(snapshot?.selectionRecords ?? []).map((item) => item.objectID),
        ...model.discoveries.flatMap((group) => group.items.map((item) => item.product.id)),
      ]),
    [snapshot, model.discoveries],
  );
  const handleProductLink = useCallback(
    (id: string, event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      if (!parseVerifiedProductLink(`/product/${encodeURIComponent(id)}`, knownProductIds))
        event.preventDefault();
      /* A verified link keeps its default navigation to the product page. */
    },
    [knownProductIds],
  );
  const applyBrief = useCallback(
    async (operation: Parameters<typeof applyBriefOperationsV3>[1]['operations'][number]) => {
      if (!brief) throw new Error('The shopping brief is unavailable.');
      const result = await session.store.transact({
        expectedRevision: brief.revision,
        apply: (current) => ({
          ...current,
          brief: applyBriefOperationsV3(current.brief, {
            missionId: current.missionId,
            expectedRevision: current.brief.revision,
            turnId: newId('ui-turn'),
            operations: [operation],
          }),
        }),
      });
      if (!result.ok)
        throw new Error('The preference changed while this edit was being saved. Try again.');
      manualEditEpoch.current++;
      runtime.invalidateTurn();
    },
    [brief, runtime, session],
  );
  const onUndo = useCallback(async () => {
    if (!brief?.events.length) return;
    const result = await session.store.transact({
      expectedRevision: brief.revision,
      apply: (current) => ({
        ...current,
        brief: undoBriefV3(current.brief, current.brief.revision),
      }),
    });
    if (!result.ok) setError('Undo could not be saved. Try again.');
    else {
      manualEditEpoch.current++;
      runtime.invalidateTurn();
    }
  }, [brief, runtime, session]);
  const chatContext = useCallback(() => {
    const currentSession = session.store.getSnapshot();
    const base = context?.() ?? {};
    const latest = latestTurn.current;
    return buildTurnContext(currentSession, base, {
      turnId: latest.turnId,
      sourceMessageId: latest.sourceMessageId,
    });
  }, [context, session]);

  const chatPersistenceOptions = useMemo(
    () => getConnectedChatPersistenceOptions(snapshot?.missionId ?? ''),
    [snapshot?.missionId],
  );

  const onFinish = useCallback<ChatOnFinishCallback<UIMessage>>((value) => {
    finishRef.current = {
      messages: value.messages,
      isAbort: value.isAbort,
      isError: value.isError || value.isDisconnect,
    };
  }, []);
  /**
   * Transport/stream failures never fire onFinish (the SDK's createStream
   * rejection path sets error state and calls onError instead), and the send
   * closure's `chat` snapshot is rendered before the error lands, so the only
   * reliable transport signal is this ref. Read like finishRef.
   */
  const chatErrorRef = useRef<Error | null>(null);
  const onChatError = useCallback<ChatOnErrorCallback>((error) => {
    chatErrorRef.current = error;
  }, []);
  /** Correlates this page's chat requests with the server's request log. Metadata only.
   * crypto.randomUUID needs a secure context; an embed iframe under an insecure
   * host page has none, so fall back like newId() does. */
  const chatRequestId = useRef(globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
  /* Lane 1: the four deterministic client tools execute in this browser over
   * the read-only exact-product proxy; the agent's tool sheet declares them
   * and their descriptions, this only binds the executors. */
  const clientTools = useMemo(
    () =>
      buildClientTools(async (objectID) => {
        const response = await fetch(`/api/products/${encodeURIComponent(objectID)}`);
        if (!response.ok) throw new Error('Product record could not be loaded.');
        return await response.json();
      }),
    [],
  );
  const chat = useChat<UIMessage>({
    ...chatPersistenceOptions,
    transport: {
      api: '/api/chat',
      headers: { 'x-jtv-request-id': chatRequestId.current },
    },
    context: chatContext,
    tools: clientTools,
    onFinish,
    onError: onChatError,
    requiresSearch: false,
  });
  /* The Ask JTV chip hands the search box text over as a draft, never as a
   * sent message: the shopper reads it, edits it and sends it themselves. */
  const prefillToken = prefill?.token ?? 0;
  const prefillText = prefill?.text ?? '';
  useEffect(() => {
    if (!open || !prefillToken) return;
    if (prefillText) chat.setInput(prefillText);
    // The chat handle is stable for the panel's lifetime; only a new token
    // (a fresh chip click) may overwrite the composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillToken]);

  const hydratedTranscriptId = useRef<string | null>(null);
  useEffect(() => {
    const reconciliation = reconcileRestoredReveal(
      hydratedTranscriptId.current,
      chat.messages,
      safeStorage(),
    );
    hydratedTranscriptId.current = reconciliation.hydratedId;
    if (!reconciliation.revealed.length) return;
    setRevealed((previous) => {
      const next = new Set(previous);
      reconciliation.revealed.forEach((id) => next.add(id));
      return next.size === previous.size ? previous : next;
    });
    // chatPersistenceOptions.id stays a dependency on purpose: a mid-turn
    // mission-id swap should re-run the reconciliation even though the body
    // no longer reads the id (the receipt is session-scoped).
  }, [chat.messages, chatPersistenceOptions.id]);
  /* DIAG-11: the SDK answers a data-guardrail-violation by replacing the
   * whole accumulated turn message with the fixed notice text, destroying the
   * successful arrange_groups output that arrived earlier in the same turn
   * (measured: the persisted transcript after a withheld turn holds one
   * assistant message with only the notice). Snapshot the latest turn that
   * still carries one, so the notice path can stage those tool-verified
   * tiles. No text is authored or reworded here. */
  const arrangeSnapshotRef = useRef<readonly UIMessage[] | null>(null);
  useEffect(() => {
    if (!chat.messages.length) return;
    if (extractNativePresentation(chat.messages)) arrangeSnapshotRef.current = chat.messages;
  }, [chat.messages]);


  const onSystemNotice = useCallback((text: string) => {
    setSystemNotices((previous) => (previous.includes(text) ? previous : [...previous, text]));
  }, []);

  const send = useCallback(
    async (event?: FormEvent, explicitText?: string) => {
      event?.preventDefault();
      // Starter chips pass their exact displayed label here; composer submits
      // pass the draft input. One send path owns both, with the same gating
      // and the same post-send input clearing as a typed submit.
      const text = composerSendText(explicitText, chat.input);
      if (!canSubmitConnectedTurn(text, !!pending, resettingRef.current, blocked)) return;
      const sourceMessageId = newId('shopper');
      const turnId = newId('turn');
      const startManualEditEpoch = manualEditEpoch.current;
      latestTurn.current = { turnId, sourceMessageId };
      finishRef.current = null;
      chatErrorRef.current = null;
      runtime.beginTurn(turnId);
      setError('');
      setSystemNotices([]);
      followTranscriptRef.current = true;
      setElapsedSeconds(0);
      setPending({ sourceMessageId, turnId });
      chat.setInput('');
      try {
        // Transparent transport retry. The SDK resolves a failed stream request
        // without onFinish and leaves the shopper's message parked in state,
        // so a resend must first drop that message and clear the error state
        // or the bubble duplicates. One silent retry keeps a transient upstream
        // blip from becoming a visible system error; it never invents content
        // and the last-resort notice stays a fixed, clearly-labelled UI status.
        let retriedTransport = false;
        const prepareTransportRetry = async () => {
          recordTurnOutcome(turnId, chatRequestId.current, {
            finishFired: false,
            isAbort: false,
            isError: true,
            decision: 'transport-retry',
          });
          await new Promise((resolve) => setTimeout(resolve, 1200));
          chat.setMessages((previous) => previous.filter((m) => m.id !== sourceMessageId));
          chat.clearError();
        };
        for (;;) {
          finishRef.current = null;
          chatErrorRef.current = null;
          try {
            await chat.sendMessage({ text, messageId: sourceMessageId });
            await Promise.resolve();
            // The callback is invoked by the SDK while the promise is settling;
            // the assertion keeps TypeScript from treating the mutable ref as its
            // initial null value inside this async closure.
            const finish = finishRef.current as TurnFinish | null;
            const messages = finish?.messages ?? chat.messages;
            // The SDK resolves sendMessage without firing onFinish when the
            // stream request itself fails (abstract-chat.js swallows the
            // rejection into chat.error via onError), so the error ref is the
            // only signal that separates a transport failure from an agent turn
            // that stopped short. Mislabelling the former as the latter sent
            // this defect unclassified for days.
            const transportError = !finish && chatErrorRef.current !== null;
            if (transportError && !retriedTransport) {
              retriedTransport = true;
              await prepareTransportRetry();
              continue;
            }
            const completed =
              !!finish &&
              !finish.isAbort &&
              !finish.isError &&
              !(hasFailedTool(messages) && !turnHasUsableResult(messages)) &&
              manualEditEpoch.current === startManualEditEpoch &&
              isCompletedAssistantTurn(messages, 'ready');
            if (completed) {
              recordTurnOutcome(turnId, chatRequestId.current, {
                finishFired: !!finish,
                isAbort: false,
                isError: false,
                decision: 'completed',
              });
              runtime.endTurn(turnId);
              const assistant = latestAssistant(messages);
              if (assistant) {
                recordCompletedAssistantMessage(safeStorage(), assistant.id);
                setRevealed((previous) => new Set(previous).add(assistant.id));
              }
              /* F1: render the native grouped call's products. Only a fully
               * completed turn stages cards; an interrupted or noticed turn
               * leaves the previous display standing. */
              try {
                const staged = await session.stageNativePresentation(messages);
                if (staged) setNativeGroups(staged);
              } catch (error) {
                if (import.meta.env.DEV)
                  console.warn('JTV native presentation not staged', error);
              }
            } else {
              if (import.meta.env.DEV)
                console.warn('JTV Concierge turn incomplete', {
                  hasFinish: !!finish,
                  isAbort: finish?.isAbort ?? false,
                  isError: finish?.isError ?? false,
                  failedTool: hasFailedTool(messages),
                  failedToolDetails: getFailedToolDetails(messages),
                  messageCount: messages.length,
                });
              recordTurnOutcome(turnId, chatRequestId.current, {
                finishFired: !!finish,
                isAbort: finish?.isAbort ?? false,
                isError: finish?.isError ?? false,
                decision: finish?.isAbort
                  ? 'aborted-notice'
                  : finish?.isError || (hasFailedTool(messages) && !turnHasUsableResult(messages))
                    ? 'failed-notice'
                    : transportError
                      ? 'transport-error'
                      : 'incomplete-notice',
              });
              runtime.endTurn(turnId);
              onSystemNotice(getConnectedTurnSystemNotice(messages, finish, transportError));
              /* DIAG-11: the SDK answers a data-guardrail-violation by writing
               * the fixed notice INTO the latest assistant message (its
               * onToolCall/data branch never reaches onData). When that
               * happened, an earlier assistant message of the same turn may
               * still hold a successful arrange_groups output — tool-verified
               * tiles ready to render. Stage them and keep the existing fixed
               * notice where the withheld text would be; no wording changes,
               * no model calls. Detection is the message shape itself: a
               * message whose whole text is the fixed notice. */
              const withholdAssistant = latestAssistant(messages);
              if (
                withholdAssistant &&
                messageText(withholdAssistant).startsWith('[System notice]') &&
                arrangeSnapshotRef.current
              ) {
                try {
                  const staged = await session.stageNativePresentation(arrangeSnapshotRef.current);
                  if (staged) setNativeGroups(staged);
                } catch (error) {
                  if (import.meta.env.DEV)
                    console.warn('JTV native presentation not staged on withhold', error);
                }
              }
            }
            return;
          } catch (cause) {
            if (!retriedTransport) {
              retriedTransport = true;
              await prepareTransportRetry();
              continue;
            }
            if (import.meta.env.DEV)
              console.warn(
                `JTV Concierge send failed: ${cause instanceof Error ? cause.name : typeof cause}: ${cause instanceof Error ? cause.message.slice(0, 180) : 'unknown'}`,
              );
            recordTurnOutcome(turnId, chatRequestId.current, {
              finishFired: finishRef.current !== null,
              isAbort: false,
              isError: true,
              decision: 'transport-error',
            });
            runtime.endTurn(turnId);
            const failedMessages =
              (finishRef.current as TurnFinish | null)?.messages ?? chat.messages;
            onSystemNotice(
              getConnectedTurnSystemNotice(failedMessages, { isAbort: false, isError: true }),
            );
            return;
          }
        }
      } finally {
        setPending(null);
      }
    },
    [blocked, chat, onSystemNotice, pending, runtime, session],
  );

  const startNewConversation = useCallback(async () => {
    if (resettingRef.current) return;
    setResetting(true);
    const priorMessageIds = chat.messages.map((message) => message.id);
    const result = await resetConnectedConversation(
      resettingRef,
      async () => {
        if (pending) await chat.stop();
        try {
          return await runtime.resetMission(newId('mission'));
        } catch {
          return { ok: false as const, reason: 'reset_failed' };
        }
      },
      chat.clearMessages,
      chat.setInput,
      chat.focusInput,
    );
    if (!result.ok) {
      setResetting(false);
      setError(
        result.reason === 'corrupt_state'
          ? 'The saved session is corrupt, so it was left untouched. New conversation is unavailable.'
          : 'A new conversation could not be saved. Your current session is still here.',
      );
      return;
    }
    clearCompletedAssistantMessages(safeStorage());
    setHiddenPriorMessageIds((previous) => new Set([...previous, ...priorMessageIds]));
    setNativeGroups(null);
    finishRef.current = null;
    latestTurn.current = { turnId: '', sourceMessageId: '' };
    setPending(null);
    setResetting(false);
    setError('');
    setSystemNotices([]);
    setRevealed(new Set());
    setSection('conversation');
    setStarterSet((current) =>
      selectStarterSet(
        STARTER_QUESTION_POOL,
        current.map((question) => question.label),
      ),
    );
  }, [chat, pending, runtime]);

  /** Starter chips send their exact displayed label through the one send path. */
  const handleStarterAsk = useCallback(
    (label: string) => {
      void send(undefined, label);
    },
    [send],
  );
  const visibleMessages = visibleConnectedTranscript(
    chat.messages,
    resetting,
    hiddenPriorMessageIds,
  );
  const pendingSourceIndex = pending
    ? visibleMessages.findIndex(
        (message) => message.role === 'user' && message.id === pending.sourceMessageId,
      )
    : -1;
  const pendingAssistantText =
    pendingSourceIndex < 0
      ? ''
      : visibleMessages
          .slice(pendingSourceIndex + 1)
          .filter((message) => message.role === 'assistant')
          .map(messageText)
          .join('\n');
  useLayoutEffect(() => {
    const viewport = messagesViewportRef.current;
    if (viewport && followTranscriptRef.current) viewport.scrollTop = viewport.scrollHeight;
  }, [pendingAssistantText, visibleMessages.length, revealed, systemNotices.length]);
  const verifiedBlogUrls = useMemo(
    () =>
      canonicalBlogUrlsFromMessages(visibleMessages.filter((message) => revealed.has(message.id))),
    [visibleMessages, revealed],
  );
  const pendingStatus = pending
    ? connectedProgressLabel(chat.status, chat.messages, pending.sourceMessageId)
    : '';
  const status = pending ? '' : blocked || error || '';

  return (
    <ConciergeWorkspaceLayout
      open={open}
      headerActions={
        <>
          <button
            type="button"
            className="connected-new-conversation"
            aria-label="Start a new conversation"
            title="Start a new conversation"
            disabled={resetting}
            onClick={() => void startNewConversation()}
          >
            New
          </button>
          <div ref={setBriefControls} className="brief-header-controls" />
        </>
      }
      closeAction={
        <button type="button" aria-label="Close Concierge" title="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      }
      preferenceContent={
        brief ? (
          <ConnectedShoppingBrief
            brief={brief}
            controlsTarget={briefControls}
            busy={!!pending}
            onAdd={(fact) => applyBrief({ type: 'add', fact })}
            onReplace={(factIds, fact) => applyBrief({ type: 'replace', factIds, fact })}
            onRetract={(factIds) => applyBrief({ type: 'retract', factIds })}
            onUndo={onUndo}
          />
        ) : null
      }
      sectionSwitch={
        <>
          <button
            aria-pressed={section === 'conversation'}
            onClick={() => setSection('conversation')}
          >
            Conversation
          </button>
          <button aria-pressed={section === 'products'} onClick={() => setSection('products')}>
            Products
          </button>
        </>
      }
      section={section === 'products' ? 'shopping' : 'conversation'}
      messagesViewportRef={messagesViewportRef}
      onMessagesScroll={onMessagesScroll}
      messages={
        <>
          {!visibleMessages.length && (
            <ConnectedWelcome
              showStarters={shouldShowEntryGuidance(visibleMessages.length)}
              startersDisabled={!!pending || resetting || !!blocked}
              starters={starterSet}
              onAsk={handleStarterAsk}
            />
          )}
          {visibleMessages.map((message, index) => (
            <ConversationMessage
              key={message.id}
              message={message}
              revealed={revealed.has(message.id)}
              provisional={
                pendingSourceIndex >= 0 &&
                index > pendingSourceIndex &&
                message.role === 'assistant' &&
                !revealed.has(message.id)
              }
              knownProductIds={knownProductIds}
              verifiedBlogUrls={verifiedBlogUrls}
              onProductLink={handleProductLink}
            />
          ))}
          {systemNotices.map((notice) => (
            <p className="connected-system-notice" role="status" key={notice}>
              {notice}
            </p>
          ))}
        </>
      }
      status={
        status ? (
          <p className="connected-status" role="status">
            {status}
          </p>
        ) : null
      }
      composer={
        <form className="connected-prompt" onSubmit={send}>
          <div className="connected-prompt-row">
            <div className="connected-prompt-field">
              <input
                id="connected-concierge-input"
                aria-label="Message the Concierge"
                aria-busy={!!pending}
                value={chat.input}
                onChange={(event) => chat.setInput(event.currentTarget.value)}
                disabled={!!pending || resetting || !!blocked}
                placeholder={pending ? '' : 'Shall we find something delighting?'}
                autoComplete="off"
              />
              {pending && (
                <span className="connected-progress" role="status" aria-live="polite">
                  <span className="connected-progress-dots" aria-hidden="true">
                    <span className="connected-progress-dot" />
                    <span className="connected-progress-dot" />
                    <span className="connected-progress-dot" />
                  </span>
                  <span className="connected-progress-label">{pendingStatus}</span>
                  <span className="connected-progress-time" aria-hidden="true">
                    {elapsedSeconds}s
                  </span>
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!canSubmitConnectedTurn(chat.input, !!pending, resetting, blocked)}
            >
              Send
            </button>
          </div>
        </form>
      }
      productWorkspace={
        <ShoppingWorkspace
          model={model}
          onStart={() => {
            setSection('conversation');
            requestAnimationFrame(() =>
              document.getElementById('connected-concierge-input')?.focus(),
            );
          }}
        />
      }
    />
  );
}
