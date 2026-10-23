import { describe, expect, it } from 'vitest';
import { canRestoreNativeCanvas } from '../../src/concierge/ConnectedConcierge';
import type { UIMessage } from 'instantsearch.js/es/lib/ai-lite';

/**
 * Canvas restore after a page reload (Option B). The canvas tiles are React
 * state written only by the send path, so a full page load (PDP trip, F5)
 * remounts the component with an empty canvas while the SDK restores the
 * transcript from sessionStorage. Measured 2026-10-22 in dev: 6 tiles before
 * the PDP click, 0 after returning, conversation restored; the stored
 * transcript retains tool-arrange_groups and search outputs.
 *
 * The gate below decides when the restore effect may re-stage the canvas from
 * the visible transcript. Fixtures replay the restored-transcript shape.
 */

const userMessage = {
  id: 'shopper-r1',
  role: 'user',
  parts: [{ type: 'text', text: 'show me gold hoop earrings' }],
} as never;

const restoredTranscript = [
  userMessage,
  {
    id: 'assistant-r1',
    role: 'assistant',
    parts: [
      {
        type: 'tool-algolia_search_index_prod_catalog',
        toolCallId: 't1',
        state: 'output-available',
        input: {},
        output: { hits: [{ objectID: 'VG271' }] },
      },
      {
        type: 'tool-arrange_groups',
        toolCallId: 't2',
        state: 'output-available',
        input: {},
        output: { status: 'ok', groups: [], dropped: [], shortfall: [] },
      },
      { type: 'text', text: 'Here are the gold hoops I found.', state: 'done' },
    ],
  },
] as never as UIMessage[];

const emptyTranscript = [] as never as UIMessage[];

function gate(overrides: Partial<Parameters<typeof canRestoreNativeCanvas>[0]> = {}) {
  return canRestoreNativeCanvas({
    visibleMessages: restoredTranscript,
    nativeGroups: null,
    pending: false,
    resetting: false,
    ...overrides,
  });
}

describe('canvas restore gate', () => {
  it('allows staging from a restored transcript with a user and assistant message', () => {
    expect(gate()).toBe(true);
  });

  it('does nothing on an empty transcript (fresh visitor or cleared conversation)', () => {
    expect(gate({ visibleMessages: emptyTranscript })).toBe(false);
  });

  it('never re-stages over an already staged canvas', () => {
    expect(gate({ nativeGroups: [{ title: 'Gold Hoops', items: [] }] })).toBe(false);
  });

  it('stays out of an in-flight turn', () => {
    expect(gate({ pending: true })).toBe(false);
  });

  it('stays out of a conversation reset', () => {
    expect(gate({ resetting: true })).toBe(false);
  });

  it('does not stage from a transcript with only assistant messages', () => {
    expect(gate({ visibleMessages: restoredTranscript.slice(1) })).toBe(false);
  });
});
