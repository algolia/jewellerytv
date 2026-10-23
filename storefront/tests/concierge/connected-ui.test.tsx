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
  selectStarterSet,
  type StarterTheme,
  type StarterVoice,
} from '../../src/concierge/starterQuestions';
import {
  canSubmitConnectedTurn,
  connectedProgressLabel,
  getConnectedTurnSystemNotice,
  partialAssistantToReveal,
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
        withPart({ type: 'tool-algolia_search_index_help_content', state: 'input-available' }),
        'another-shopper',
      ),
    ).toBe('Concierge is working');
    expect(
      connectedProgressLabel(
        'streaming',
        [
          ...withPart({ type: 'tool-algolia_search_index_help_content', state: 'input-available' }),
          { id: 'shopper-2', role: 'user', parts: [{ type: 'text', text: 'Now show rings' }] },
        ] as UIMessage[],
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
        withPart({ type: 'tool-algolia_search_index_help_content', state: 'input-available' }),
        'shopper-1',
      ),
    ).toBe('Checking JTV information');
    expect(
      connectedProgressLabel(
        'streaming',
        withPart({ type: 'tool-arrange_groups', state: 'input-available' }),
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
        withPart({ type: 'tool-algolia_search_index_help_content', state: 'output-available' }),
        'shopper-1',
      ),
    ).toBe('Continuing your request');
    expect(
      connectedProgressLabel(
        'streaming',
        [
          user,
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              { type: 'tool-update_shopping_state', state: 'output-available' },
              { type: 'tool-algolia_search_index_help_content', state: 'input-available' },
            ],
          },
        ] as UIMessage[],
        'shopper-1',
      ),
    ).toBe('Checking JTV information');
  });
});

describe('connected Concierge reset gate', () => {
  it('does not reveal prior mission messages while the SDK clears a new conversation', () => {
    const oldUser = {
      id: 'shopper-old',
      role: 'user',
      parts: [{ type: 'text', text: 'Old question' }],
    };
    const oldAssistant = {
      id: 'assistant-old',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Old answer' }],
    };
    const newUser = {
      id: 'shopper-new',
      role: 'user',
      parts: [{ type: 'text', text: 'New question' }],
    };
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
              type: 'tool-algolia_search_index_help_content',
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
  it('reveals streamed assistant text after a failed turn so the painted reply survives', () => {
    const messages = [
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Find a necklace' }] },
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Here is a first look at what we carry.' },
          {
            type: 'tool-arrange_groups',
            toolCallId: 'call-1',
            state: 'output-error',
            input: {},
            errorText: "['WPD900'] is too long",
          },
        ],
      },
    ] as unknown as UIMessage[];
    const revealed = partialAssistantToReveal(messages);
    expect(revealed?.id).toBe('assistant-1');
  });
  it('does not reveal an empty or SDK-notice assistant message after a failed turn', () => {
    const empty = partialAssistantToReveal([
      { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Find a necklace' }] },
      { id: 'assistant-1', role: 'assistant', parts: [] },
    ] as unknown as UIMessage[]);
    expect(empty).toBeNull();
    const sdkNotice = partialAssistantToReveal([
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: '[System notice] Please refine the request.' }],
      },
    ] as unknown as UIMessage[]);
    expect(sdkNotice).toBeNull();
  });
});

describe('connected entry guidance', () => {
  // Deterministic linear-congruential rng so selector behavior is reproducible.
  const seededRng = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const THEMES: StarterTheme[] = [
    'discovery',
    'style',
    'brand',
    'occasion',
    'value',
    'service',
    'new',
    'personalization',
    'preference',
    'care',
  ];
  const VOICES: StarterVoice[] = ['show', 'question', 'tell'];

  it('renders five distinct starter chips from the analytics-backed pool', () => {
    const set = selectStarterSet(STARTER_QUESTION_POOL, [], seededRng(2));
    const html = renderToStaticMarkup(
      <ConnectedWelcome showStarters startersDisabled={false} starters={set} onAsk={() => {}} />,
    );
    expect(html).toContain('aria-label="Suggested first questions"');
    const labels = [...html.matchAll(/class="connected-starter-chip"[^>]*>([^<]*)<\/button>/g)].map(
      (match) => match[1].replace(/&#x27;/g, "'"),
    );
    expect(labels).toEqual(set.map((question) => question.label));
    expect(new Set(labels).size).toBe(5);
    const poolLabels = new Set(STARTER_QUESTION_POOL.map((question) => question.label));
    for (const label of labels) {
      expect(poolLabels.has(label)).toBe(true);
    }
  });

  it('grounds the pool in analytics themes and sources without em dashes', () => {
    expect(STARTER_QUESTION_POOL.length).toBeGreaterThanOrEqual(20);
    const labels = new Set<string>();
    for (const question of STARTER_QUESTION_POOL) {
      expect(question.label.length).toBeGreaterThan(0);
      expect(question.label).toBe(question.label.trim());
      expect(question.label).not.toMatch(/[—–]/);
      expect(THEMES).toContain(question.theme);
      expect(VOICES).toContain(question.voice);
      expect(['prod_catalog', 'help_content']).toContain(question.source);
      labels.add(question.label);
    }
    expect(labels.size).toBe(STARTER_QUESTION_POOL.length);
  });

  it('selects five distinct labels and never repeats the previous welcome set', () => {
    for (const seed of [1, 7, 42]) {
      const rng = seededRng(seed);
      const first = selectStarterSet(STARTER_QUESTION_POOL, [], rng);
      expect(first).toHaveLength(5);
      expect(new Set(first.map((question) => question.label)).size).toBe(5);
      const second = selectStarterSet(
        STARTER_QUESTION_POOL,
        first.map((question) => question.label),
        rng,
      );
      for (const question of second) {
        expect(first.some((picked) => picked.label === question.label)).toBe(false);
      }
    }
  });

  it('keeps each welcome set varied across themes and sentence voices', () => {
    for (const seed of [1, 3, 7, 42]) {
      const set = selectStarterSet(STARTER_QUESTION_POOL, [], seededRng(seed));
      const perTheme = new Map<StarterTheme, number>();
      const perVoice = new Map<StarterVoice, number>();
      for (const question of set) {
        perTheme.set(question.theme, (perTheme.get(question.theme) ?? 0) + 1);
        perVoice.set(question.voice, (perVoice.get(question.voice) ?? 0) + 1);
      }
      for (const count of [...perTheme.values(), ...perVoice.values()]) {
        expect(count).toBeLessThanOrEqual(2);
      }
      expect(perTheme.size).toBeGreaterThanOrEqual(3);
      expect(perVoice.size).toBeGreaterThanOrEqual(2);
    }
  });

  it('is deterministic for a given rng and fills the set under heavy exclusion', () => {
    const first = selectStarterSet(STARTER_QUESTION_POOL, [], seededRng(9));
    const again = selectStarterSet(STARTER_QUESTION_POOL, [], seededRng(9));
    expect(again.map((question) => question.label)).toEqual(
      first.map((question) => question.label),
    );
    const narrow = selectStarterSet(
      STARTER_QUESTION_POOL,
      STARTER_QUESTION_POOL.slice(0, 20).map((question) => question.label),
      seededRng(5),
    );
    expect(narrow).toHaveLength(5);
  });

  it('disables starter chips while a turn is pending, resetting, or the workspace is blocked', () => {
    const html = renderToStaticMarkup(
      <ConnectedWelcome
        showStarters
        startersDisabled
        starters={selectStarterSet(STARTER_QUESTION_POOL, [], seededRng(2))}
        onAsk={() => {}}
      />,
    );
    expect(html).toContain('disabled=""');
  });

  it('shows starter chips only while the transcript is empty and they return after a reset', () => {
    expect(shouldShowEntryGuidance(0)).toBe(true);
    expect(shouldShowEntryGuidance(3)).toBe(false);
    const hidden = renderToStaticMarkup(
      <ConnectedWelcome
        showStarters={false}
        startersDisabled={false}
        starters={selectStarterSet(STARTER_QUESTION_POOL, [], seededRng(2))}
        onAsk={() => {}}
      />,
    );
    expect(hidden).not.toContain('connected-starter-chip');
  });

  it('sends exactly the displayed starter text through the one composer send path', () => {
    const chip = STARTER_QUESTION_POOL[0].label;
    expect(composerSendText(chip, 'a half-typed draft in the input')).toBe(chip);
    expect(composerSendText(undefined, '  typed by the shopper  ')).toBe('typed by the shopper');
  });
});
