import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UIMessage } from 'instantsearch.js/es/lib/ai-lite';
import {
  ConnectedWelcome,
  STARTER_QUESTIONS,
  composerSendText,
  shouldShowEntryGuidance,
} from '../../src/concierge/EntryGuidance';
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
  it('renders every starter question as a keyboard-activatable button with its exact label', () => {
    const html = renderToStaticMarkup(
      <ConnectedWelcome showStarters startersDisabled={false} onAsk={() => {}} />,
    );
    expect(html).toContain('aria-label="Suggested first questions"');
    for (const question of STARTER_QUESTIONS) {
      expect(html).toContain(`>${question.label}</button>`);
    }
    expect(
      html.match(/<button type="button" class="connected-starter-chip"/g),
    ).toHaveLength(STARTER_QUESTIONS.length);
  });

  it('offers a small fixed set of catalogue-grounded starter labels without em dashes', () => {
    expect(STARTER_QUESTIONS.length).toBeGreaterThanOrEqual(4);
    expect(STARTER_QUESTIONS.length).toBeLessThanOrEqual(6);
    const labels = new Set<string>();
    for (const { label } of STARTER_QUESTIONS) {
      expect(label.length).toBeGreaterThan(0);
      expect(label).toBe(label.trim());
      expect(label).not.toMatch(/[—–]/);
      labels.add(label);
    }
    expect(labels.size).toBe(STARTER_QUESTIONS.length);
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
    const chip = STARTER_QUESTIONS[0].label;
    expect(composerSendText(chip, 'a half-typed draft in the input')).toBe(chip);
    expect(composerSendText(undefined, '  typed by the shopper  ')).toBe('typed by the shopper');
  });
});
