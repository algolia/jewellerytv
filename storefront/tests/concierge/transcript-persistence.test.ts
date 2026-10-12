import { describe, expect, it, vi } from 'vitest';
import { ChatState } from 'instantsearch.js/es/lib/chat';
import type { UIMessage } from 'instantsearch.js/es/lib/ai-lite';
import {
  clearCompletedAssistantMessages,
  getConnectedChatPersistenceOptions,
  isRestoredAssistantMessage,
  legacyCompletionReceiptKeys,
  migrateLegacyCompletionReceipts,
  readCompletedAssistantMessageIds,
  reconcileRestoredReveal,
  recordCompletedAssistantMessage,
  visibleConnectedTranscript,
} from '../../src/concierge/ConnectedConcierge';

const assistant = (id: string, text: string): UIMessage => ({
  id,
  role: 'assistant',
  parts: [{ type: 'text', text, state: 'done' }],
});

describe('connected Concierge transcript continuity', () => {
  it('uses the mission id as the same-session transcript key and enables SDK persistence', () => {
    expect(getConnectedChatPersistenceOptions('mission-1')).toEqual({
      id: 'mission-1',
      persistence: true,
    });
    expect(getConnectedChatPersistenceOptions('mission-2')).not.toEqual(
      getConnectedChatPersistenceOptions('mission-1'),
    );
  });

  it('restores completed assistant turns but keeps cancelled and failed turns hidden', () => {
    expect(isRestoredAssistantMessage(assistant('complete', 'Here are the pieces.'))).toBe(true);
    expect(
      isRestoredAssistantMessage({
        id: 'cancelled',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Partial answer', state: 'streaming' }],
      } as UIMessage),
    ).toBe(false);
    expect(
      isRestoredAssistantMessage({
        id: 'failed',
        role: 'assistant',
        parts: [
          {
            type: 'tool-retrieve_evidence',
            toolCallId: 'call-1',
            state: 'output-error',
            input: {},
            errorText: 'failed',
          },
          { type: 'text', text: 'A fallback', state: 'done' },
        ],
      } as UIMessage),
    ).toBe(false);
  });

  it('does not restore a final-looking reply without an app completion receipt', () => {
    const values = new Map<string, string>();
    const storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    } satisfies Storage;
    const failedReply = assistant('failed-final-looking', 'The answer was replaced.');
    expect(isRestoredAssistantMessage(failedReply)).toBe(true);
    expect(readCompletedAssistantMessageIds(storage).has(failedReply.id)).toBe(false);
    recordCompletedAssistantMessage(storage, 'accepted-assistant');
    expect(readCompletedAssistantMessageIds(storage)).toEqual(
      new Set(['accepted-assistant']),
    );
    expect(readCompletedAssistantMessageIds(storage).has(failedReply.id)).toBe(false);
  });

  it('reveals a persisted completed answer even when the SDK hydrates messages after the first effect run', () => {
    const values = new Map<string, string>();
    const sessionStorage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    } satisfies Storage;
    recordCompletedAssistantMessage(sessionStorage, 'assistant-1');
    const restoredMessages = [
      { id: 'shopper-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hi' }] },
      assistant('assistant-1', 'The persisted answer.'),
    ];
    // First effect run: mount order can place it before the SDK fills messages from storage.
    const firstRun = reconcileRestoredReveal(null, [], sessionStorage);
    expect(firstRun.revealed).toEqual([]);
    // The one-shot guard must NOT be consumed by that empty first run.
    expect(firstRun.hydratedId).toBeNull();
    // Hydration lands; the next effect run must reveal the persisted answer.
    const secondRun = reconcileRestoredReveal(firstRun.hydratedId, restoredMessages, sessionStorage);
    expect(secondRun.revealed).toEqual(['assistant-1']);
    expect(secondRun.hydratedId).toBe('reconciled');
  });

  it('reveals a valid completed answer even when a stale receipt id never arrives', () => {
    const values = new Map<string, string>();
    const sessionStorage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    } satisfies Storage;
    recordCompletedAssistantMessage(sessionStorage, 'stale-from-old-transcript');
    recordCompletedAssistantMessage(sessionStorage, 'assistant-live');
    const hydrated = [
      { id: 'shopper-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hi' }] },
      assistant('assistant-live', 'The valid persisted answer.'),
    ];
    const result = reconcileRestoredReveal(null, hydrated, sessionStorage);
    expect(result.revealed).toEqual(['assistant-live']);
    // The stale id keeps the reconciliation armed, but that must not block the reveal.
    expect(result.hydratedId).toBeNull();
  });

  it('stays waiting while only some receipt ids have hydrated, then reveals the ones that arrive', () => {
    const values = new Map<string, string>();
    const sessionStorage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    } satisfies Storage;
    recordCompletedAssistantMessage(sessionStorage, 'assistant-1');
    recordCompletedAssistantMessage(sessionStorage, 'assistant-2');
    const partial = reconcileRestoredReveal(
      null,
      [
        { id: 'shopper-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hi' }] },
        assistant('assistant-1', 'First answer.'),
      ],
      sessionStorage,
    );
    expect(partial.revealed).toEqual(['assistant-1']);
    expect(partial.hydratedId).toBeNull();
    const complete = reconcileRestoredReveal(null, [
      { id: 'shopper-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hi' }] },
      assistant('assistant-1', 'First answer.'),
      assistant('assistant-2', 'Second answer.'),
    ], sessionStorage);
    expect(complete.revealed).toEqual(['assistant-1', 'assistant-2']);
    expect(complete.hydratedId).toBe('reconciled');
  });

  it('marks the reveal reconciled when no completion receipt exists and when every receipt id has arrived', () => {
    const values = new Map<string, string>();
    const sessionStorage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    } satisfies Storage;
    // No receipt: nothing to reveal, mark consumed immediately.
    const noReceipt = reconcileRestoredReveal(null, [], sessionStorage);
    expect(noReceipt.hydratedId).toBe('reconciled');
    expect(noReceipt.revealed).toEqual([]);
    // Receipt id that never passes the predicate still terminates once it has arrived.
    recordCompletedAssistantMessage(sessionStorage, 'failed-turn');
    const terminated = reconcileRestoredReveal(null, [assistant('failed-turn', 'Answer')], sessionStorage);
    expect(terminated.hydratedId).toBe('reconciled');
    // The message passes the predicate here, so it is revealed before termination.
    expect(terminated.revealed).toEqual(['failed-turn']);
    // Receipt id arrives in a message that fails the restore predicate: terminate without revealing.
    clearCompletedAssistantMessages(sessionStorage);
    recordCompletedAssistantMessage(sessionStorage, 'broken-turn');
    const faulted = reconcileRestoredReveal(
      null,
      [
        {
          id: 'broken-turn',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Half answer', state: 'streaming' as const }],
        },
      ],
      sessionStorage,
    );
    expect(faulted.revealed).toEqual([]);
    expect(faulted.hydratedId).toBe('reconciled');
  });

  it('hides the old transcript during reset and restores it if reset fails', () => {
    const transcript = [
      { id: 'shopper-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hi' }] },
      assistant('assistant-1', 'A completed answer.'),
    ];
    expect(visibleConnectedTranscript(transcript, true)).toEqual([]);
    expect(visibleConnectedTranscript(transcript, false)).toEqual(transcript);
  });

  it('round-trips a ready transcript in session storage and clears it on reset', () => {
    const values = new Map<string, string>();
    const sessionStorage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    } satisfies Storage;
    vi.stubGlobal('window', { sessionStorage });
    vi.stubGlobal('sessionStorage', sessionStorage);
    const first = new ChatState<UIMessage>('mission-1', undefined, true);
    first.messages = [
      { id: 'shopper-1', role: 'user', parts: [{ type: 'text', text: 'Find a necklace' }] },
      assistant('assistant-1', 'Here is a grounded choice.'),
    ];
    const reloaded = new ChatState<UIMessage>('mission-1', undefined, true);
    expect(reloaded.messages).toEqual(first.messages);

    reloaded.messages = [];
    expect(new ChatState<UIMessage>('mission-1', undefined, true).messages).toEqual([]);
    expect(new ChatState<UIMessage>('mission-2', undefined, true).messages).toEqual([]);
    recordCompletedAssistantMessage(sessionStorage, 'assistant-1');
    clearCompletedAssistantMessages(sessionStorage);
    expect(readCompletedAssistantMessageIds(sessionStorage)).toEqual(new Set());
    vi.unstubAllGlobals();
  });

  describe('legacy mission-keyed receipt migration', () => {
    const storageStub = () => {
      const values = new Map<string, string>();
      return {
        get length() {
          return values.size;
        },
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
        removeItem: (key: string) => {
          values.delete(key);
        },
      } satisfies Storage;
    };

    const writeLegacyReceipt = (storage: Storage, key: string, ids: string[]) => {
      storage.setItem(key, JSON.stringify({ version: 1, assistantMessageIds: ids }));
    };

    it('merges legacy receipt ids that match the current transcript and the predicate, then cleans up', () => {
      const storage = storageStub();
      writeLegacyReceipt(storage, 'jtv-concierge-completed-mission-abc', [
        'legacy-good',
        'legacy-gone',
      ]);
      const messages = [
        { id: 'shopper-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hi' }] },
        assistant('legacy-good', 'Restored legacy answer.'),
      ];
      expect(legacyCompletionReceiptKeys(storage)).toEqual([
        'jtv-concierge-completed-mission-abc',
      ]);
      expect(migrateLegacyCompletionReceipts(storage, messages)).toEqual(['legacy-good']);
      expect(readCompletedAssistantMessageIds(storage)).toEqual(new Set(['legacy-good']));
      // Terminal reconciliation run removes the legacy key.
      reconcileRestoredReveal(null, messages, storage);
      expect(legacyCompletionReceiptKeys(storage)).toEqual([]);
    });

    it('never reveals a legacy id that is not in the current transcript or fails the predicate', () => {
      const storage = storageStub();
      writeLegacyReceipt(storage, 'jtv-concierge-completed-mission-xyz', [
        'not-in-transcript',
        'streaming-turn',
        'notice-turn',
        'failed-tool-turn',
      ]);
      const messages = [
        {
          id: 'streaming-turn',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Half', state: 'streaming' as const }],
        },
        {
          id: 'notice-turn',
          role: 'assistant' as const,
          parts: [
            {
              type: 'text' as const,
              text: '[System notice] Part of the generated answer could not be supported reliably and was withheld. Please retry.',
              state: 'done' as const,
            },
          ],
        },
        {
          id: 'failed-tool-turn',
          role: 'assistant' as const,
          parts: [
            {
              type: 'tool-retrieve_evidence' as const,
              toolCallId: 'call-1',
              state: 'output-error' as const,
              input: {},
              errorText: 'failed',
            },
            { type: 'text' as const, text: 'Fallback', state: 'done' as const },
          ],
        },
      ];
      const result = reconcileRestoredReveal(null, messages, storage);
      expect(result.revealed).toEqual([]);
      expect(migrateLegacyCompletionReceipts(storage, messages)).toEqual([]);
      expect(readCompletedAssistantMessageIds(storage)).toEqual(new Set());
    });

    it('keeps legacy keys until the reconciliation settles so a late-hydrating transcript still migrates', () => {
      const storage = storageStub();
      writeLegacyReceipt(storage, 'jtv-concierge-completed-mission-def', ['legacy-late']);
      const empty = reconcileRestoredReveal(null, [], storage);
      expect(empty.revealed).toEqual([]);
      expect(empty.hydratedId).toBeNull();
      expect(legacyCompletionReceiptKeys(storage)).toEqual([
        'jtv-concierge-completed-mission-def',
      ]);
      const hydrated = reconcileRestoredReveal(null, [assistant('legacy-late', 'Late.')], storage);
      expect(hydrated.revealed).toEqual(['legacy-late']);
      expect(legacyCompletionReceiptKeys(storage)).toEqual([]);
    });
  });

  describe('reset and message-shape safety', () => {
    const storageStub = () => {
      const values = new Map<string, string>();
      return {
        get length() {
          return values.size;
        },
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
        removeItem: (key: string) => {
          values.delete(key);
        },
      } satisfies Storage;
    };

    it('reveals nothing after a reset cleared the receipt, even with messages present', () => {
      const storage = storageStub();
      recordCompletedAssistantMessage(storage, 'assistant-1');
      clearCompletedAssistantMessages(storage);
      const result = reconcileRestoredReveal(null, [assistant('assistant-1', 'Answer.')], storage);
      expect(result.revealed).toEqual([]);
      expect(result.hydratedId).toBe('reconciled');
    });

    it('does not reveal a guardrail-replaced answer even if a receipt id matched it', () => {
      const storage = storageStub();
      recordCompletedAssistantMessage(storage, 'guardrail-turn');
      const guardrailMessage: UIMessage = {
        id: 'guardrail-turn',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: '[System notice] This request was blocked because it asked to bypass evidence or instruction boundaries.',
            state: 'done',
          },
        ],
      };
      expect(isRestoredAssistantMessage(guardrailMessage)).toBe(false);
      const result = reconcileRestoredReveal(null, [guardrailMessage], storage);
      expect(result.revealed).toEqual([]);
    });

    it('does not reveal an aborted-turn-shaped message (streaming text, no terminal state)', () => {
      const storage = storageStub();
      recordCompletedAssistantMessage(storage, 'aborted-turn');
      const abortedMessage: UIMessage = {
        id: 'aborted-turn',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Partial answer before the shopper pressed stop', state: 'streaming' },
        ],
      };
      const result = reconcileRestoredReveal(null, [abortedMessage], storage);
      expect(result.revealed).toEqual([]);
      // The id has arrived and fails the predicate, so the reconciliation settles
      // without revealing; live turns are revealed directly on completion instead.
      expect(result.hydratedId).toBe('reconciled');
    });
  });
});
