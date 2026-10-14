import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UIMessage } from 'instantsearch.js/es/lib/ai-lite';
import {
  ConnectedWelcome,
  composerSendText,
  shouldShowEntryGuidance,
} from '../../src/concierge/EntryGuidance';
import {
  STARTER_QUESTION_POOL,
  readStarterHistory,
  selectStarterSet,
  writeStarterHistory,
  type StarterQuestion,
  type StarterTheme,
  type StarterVoice,
} from '../../src/concierge/starterQuestions';
import {
  canSubmitConnectedTurn,
  connectedProgressLabel,
  getConnectedTurnSystemNotice,
  resetConnectedConversation,
  visibleConnectedTranscript,
} from '../../src/concierge/ConnectedConcierge';

describe('connected Concierge progress', () => {
  const user = { id: 'shopper-1', role: 'user', parts: [{ type: 'text', text: 'Find earrings' }] };
  const withPart = (part: Record<string, unknown>) =>
    [user, { id: 'assistant-1', role: 'assistant', parts: [part] }] as UIMessage[];

  it('uses the SDK state until the current turn reports a real event', () => {
    expect(connectedProgressLabel('submitted', [], 'shopper-1')).toBe('Sending to Concierge');
    expect(connectedProgressLabel('streaming', [user] as UIMessage[], 'shopper-1')).toBe(
      'Concierge is working',
    );
    expect(
      connectedProgressLabel(
        'streaming',
        withPart({ type: 'tool-retrieve_evidence', state: 'input-available' }),
        'another-shopper',
      ),
    ).toBe('Concierge is working');
    expect(
      connectedProgressLabel(
        'streaming',
        [...withPart({ type: 'tool-retrieve_evidence', state: 'input-available' }),
          { id: 'shopper-2', role: 'user', parts: [{ type: 'text', text: 'Now show rings' }] }] as UIMessage[],
        'shopper-2',
      ),
    ).toBe('Concierge is working');
  });

  it('changes wording for current-turn tool and reply events', () => {
    expect(
      connectedProgressLabel(
        'streaming',
        withPart({ type: 'tool-update_shopping_state', state: 'input-available' }),
        'shopper-1',
      ),
    ).toBe('Updating preferences');
    expect(
      connectedProgressLabel(
        'streaming',
        withPart({ type: 'tool-retrieve_evidence', state: 'input-available' }),
        'shopper-1',
      ),
    ).toBe('Checking JTV information');
    expect(
      connectedProgressLabel(
        'streaming',
        withPart({ type: 'tool-present_choices', state: 'input-available' }),
        'shopper-1',
      ),
    ).toBe('Preparing product choices');
    expect(
      connectedProgressLabel(
        'streaming',
        withPart({ type: 'text', state: 'streaming', text: 'A thought' }),
        'shopper-1',
      ),
    ).toBe('Concierge is replying');
    expect(
      connectedProgressLabel(
        'streaming',
        withPart({ type: 'tool-retrieve_evidence', state: 'output-available' }),
        'shopper-1',
      ),
    ).toBe('Continuing your request');
    expect(
      connectedProgressLabel(
        'streaming',
        [user, {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'tool-update_shopping_state', state: 'output-available' },
            { type: 'tool-retrieve_evidence', state: 'input-available' },
          ],
        }] as UIMessage[],
        'shopper-1',
      ),
    ).toBe('Checking JTV information');
  });
});

describe('connected Concierge reset gate', () => {
  it('does not reveal prior mission messages while the SDK clears a new conversation', () => {
    const oldUser = { id: 'shopper-old', role: 'user', parts: [{ type: 'text', text: 'Old question' }] };
    const oldAssistant = {
      id: 'assistant-old', role: 'assistant', parts: [{ type: 'text', text: 'Old answer' }],
    };
    const newUser = { id: 'shopper-new', role: 'user', parts: [{ type: 'text', text: 'New question' }] };
    const messages = [oldUser, oldAssistant, newUser] as UIMessage[];
    const oldIds = new Set(['shopper-old', 'assistant-old']);
    expect(visibleConnectedTranscript(messages, true, oldIds)).toEqual([]);
    expect(visibleConnectedTranscript(messages, false, oldIds)).toEqual([newUser]);
  });
  it('blocks an immediate send while New conversation persistence is settling', () => {
    expect(canSubmitConnectedTurn('Find a ring', false, true)).toBe(false);
    expect(canSubmitConnectedTurn('Find a ring', false, false)).toBe(true);
    expect(canSubmitConnectedTurn('', false, false)).toBe(false);
  });
  it('keeps the synchronous lock through deferred reset and transcript clearing', async () => {
    const resettingRef = { current: false };
    let release!: (value: { ok: true }) => void;
    const clearOrder: string[] = [];
    const reset = resetConnectedConversation(
      resettingRef,
      () => new Promise<{ ok: true }>((resolve) => (release = resolve)),
      () => clearOrder.push('clear'),
      () => clearOrder.push('input'),
      () => clearOrder.push('focus'),
    );
    expect(resettingRef.current).toBe(true);
    expect(canSubmitConnectedTurn('Send immediately', false, resettingRef.current)).toBe(false);
    release({ ok: true });
    await reset;
    expect(clearOrder).toEqual(['clear', 'input', 'focus']);
    expect(resettingRef.current).toBe(false);
  });
  it('labels tool failures as system UI without exposing tool details', () => {
    const notice = getConnectedTurnSystemNotice(
      [
        { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Find a necklace' }] },
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-retrieve_evidence',
              toolCallId: 'call-1',
              state: 'output-error',
              input: {},
              errorText: 'operations [] rejected',
            },
          ],
        },
      ] as unknown as UIMessage[],
      { isAbort: false, isError: true },
    );
    expect(notice).toContain('[System notice]');
    expect(notice).toContain('Existing product choices remain.');
    expect(notice).not.toContain('operations');
    expect(notice).not.toContain('retrieve_evidence');
  });
  it('labels an exhausted turn with no final assistant text and keeps prior choices visible', () => {
    const notice = getConnectedTurnSystemNotice(
      [
        { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Find a necklace' }] },
        { id: 'assistant-1', role: 'assistant', parts: [] },
      ] as unknown as UIMessage[],
      null,
    );
    expect(notice).toBe(
      '[System notice] This request did not produce a complete response. Existing product choices remain.',
    );
  });
  it('labels a swallowed transport failure as a transport error, not an incomplete answer', () => {
    // The SDK resolves sendMessage without onFinish when the stream request
    // fails (abstract-chat.js createStream rejection path). The send closure's
    // chat snapshot predates the error, so the component reads a chatErrorRef
    // populated by the SDK's onError callback; the third parameter here is that
    // signal. The notice must name the transport, not imply the agent stopped
    // short.
    const notice = getConnectedTurnSystemNotice(
      [
        { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Find a necklace' }] },
        { id: 'assistant-1', role: 'assistant', parts: [] },
      ] as unknown as UIMessage[],
      null,
      true,
    );
    expect(notice).toBe(
      '[System notice] That message did not go through. Send it again and the conversation picks up right where it left off. Existing product choices remain.',
    );
  });
  it('preserves an agent-provided system notice without duplicating it', () => {
    const notice = getConnectedTurnSystemNotice(
      [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: '[System notice] Please refine the request.' }],
        },
      ] as unknown as UIMessage[],
      { isAbort: false, isError: true },
    );
    expect(notice).toBe('[System notice] Please refine the request.');
  });
});

describe('connected entry guidance', () => {
  const seededRng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it('renders five distinct starter chips from the analytics-backed pool', () => {
    const html = renderToStaticMarkup(
      <ConnectedWelcome showStarters startersDisabled={false} onAsk={() => {}} />,
    );
    expect(html).toContain('aria-label="Suggested first questions"');
    const labels = [...html.matchAll(/class="connected-starter-chip"[^>]*>([^<]*)<\/button>/g)].map(
      (match) => match[1].replaceAll('&#x27;', "'"),
    );
    expect(labels).toHaveLength(5);
    expect(new Set(labels).size).toBe(5);
    const poolLabels = new Set(STARTER_QUESTION_POOL.map((question) => question.label));
    for (const label of labels) expect(poolLabels.has(label)).toBe(true);
  });

  it('keeps the pool concise, unique, and assigned to a supported theme, voice, and source', () => {
    const themes: StarterTheme[] = [
      'gemstone',
      'pearl',
      'category',
      'occasion',
      'value',
      'size',
      'education',
      'service',
    ];
    const voices: StarterVoice[] = ['show', 'question', 'tell'];
    expect(STARTER_QUESTION_POOL.length).toBe(25);
    const labels = new Set<string>();
    for (const question of STARTER_QUESTION_POOL) {
      const { label } = question;
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.trim());
      expect(label).not.toMatch(/[—–]/);
      expect(label.split(/\s+/).length).toBeLessThanOrEqual(10);
      expect(themes).toContain(question.theme);
      expect(voices).toContain(question.voice);
      expect(['prod_catalog', 'blog', 'help']).toContain(question.answerSource);
      labels.add(label);
    }
    expect(labels.size).toBe(STARTER_QUESTION_POOL.length);
  });

  it('uses each pool label once across chats before cycling to a different set', () => {
    for (const seed of [1, 7, 42]) {
      const rng = seededRng(seed);
      const seen: string[] = [];
      let previousSet: StarterQuestion[] = [];
      for (let index = 0; index < STARTER_QUESTION_POOL.length / 5; index += 1) {
        const current = selectStarterSet(STARTER_QUESTION_POOL, seen, rng);
        expect(current).toHaveLength(5);
        expect(new Set(current.map((question) => question.label)).size).toBe(5);
        expect(current.every((question) => !seen.includes(question.label))).toBe(true);
        expect(new Set(current.map((question) => question.theme)).size).toBeGreaterThanOrEqual(2);
        expect(new Set(current.map((question) => question.voice)).size).toBeGreaterThanOrEqual(2);
        seen.push(...current.map((question) => question.label));
        previousSet = [...current];
      }
      expect(new Set(seen).size).toBe(STARTER_QUESTION_POOL.length);
      const next = selectStarterSet(STARTER_QUESTION_POOL, seen, rng);
      expect(next).toHaveLength(5);
      expect(
        next.every((question) => !previousSet.some((item) => item.label === question.label)),
      ).toBe(true);
    }
  });

  it('keeps selection deterministic for a given rng and fills five after heavy exclusion', () => {
    const first = selectStarterSet(STARTER_QUESTION_POOL, [], seededRng(19));
    const repeat = selectStarterSet(STARTER_QUESTION_POOL, [], seededRng(19));
    expect(repeat.map((question) => question.label)).toEqual(
      first.map((question) => question.label),
    );
    const finalFive = selectStarterSet(
      STARTER_QUESTION_POOL,
      STARTER_QUESTION_POOL.slice(0, 23).map((question) => question.label),
      seededRng(5),
    );
    expect(finalFive).toHaveLength(5);
    expect(finalFive.some((question) => question.label === STARTER_QUESTION_POOL[23].label)).toBe(
      true,
    );
    expect(finalFive.some((question) => question.label === STARTER_QUESTION_POOL[24].label)).toBe(
      true,
    );
    expect(new Set(finalFive.map((question) => question.label)).size).toBe(5);
  });

  it('persists only known labels in the current browser session', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const labels = selectStarterSet(STARTER_QUESTION_POOL, [], seededRng(11)).map(
      (question) => question.label,
    );
    writeStarterHistory([...labels, 'unrecognized label'], storage);
    const restored = readStarterHistory(storage);
    expect(restored).toEqual(labels);
    const nextSet = selectStarterSet(STARTER_QUESTION_POOL, restored, seededRng(12));
    expect(nextSet.every((question) => !labels.includes(question.label))).toBe(true);
  });

  it('disables starter chips while a turn is pending, resetting, or the workspace is blocked', () => {
    const html = renderToStaticMarkup(
      <ConnectedWelcome showStarters startersDisabled onAsk={() => {}} />,
    );
    expect(html).toContain('disabled=""');
  });

  it('shows starter chips only while the transcript is empty and they return after a reset', () => {
    expect(shouldShowEntryGuidance(0)).toBe(true);
    expect(shouldShowEntryGuidance(3)).toBe(false);
    const hidden = renderToStaticMarkup(
      <ConnectedWelcome showStarters={false} startersDisabled={false} onAsk={() => {}} />,
    );
    expect(hidden).not.toContain('connected-starter-chip');
  });

  it('sends exactly the displayed starter text through the one composer send path', () => {
    const chip = STARTER_QUESTION_POOL[0].label;
    expect(composerSendText(chip, 'a half-typed draft in the input')).toBe(chip);
    expect(composerSendText(undefined, '  typed by the shopper  ')).toBe('typed by the shopper');
  });
});
