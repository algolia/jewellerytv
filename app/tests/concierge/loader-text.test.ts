import { describe, expect, it } from 'vitest';
import { loaderTextFor } from '../../src/concierge/chat/loaderText';

/* The words change because the turn changed. A timer would alternate on a
 * schedule the agent knows nothing about and would be wrong half the time. */
const part = (type: string, state?: string) => ({ type, state });

describe('what the panel says while a turn runs', () => {
  it('says it is thinking before anything has started', () => {
    expect(loaderTextFor({ phase: 'submitted', message: { parts: [] } })).toBe('Thinking…');
  });

  it('says it is searching while a search runs', () => {
    expect(
      loaderTextFor({
        phase: 'tool',
        message: { parts: [part('tool-algolia_search_index_prod_catalog', 'input-available')] },
      }),
    ).toBe('Searching…');
  });

  /* The display tool is the slow half — about four seconds of stall — so
   * calling it "Searching" would name the fast tool and mislabel the wait. */
  it('says it is choosing while the display tool runs', () => {
    expect(
      loaderTextFor({
        phase: 'tool',
        message: { parts: [part('tool-algolia_grouped_results', 'input-streaming')] },
      }),
    ).toBe('Choosing pieces…');
  });

  it('moves on once the search has returned', () => {
    expect(
      loaderTextFor({
        phase: 'tool',
        message: {
          parts: [
            part('tool-algolia_search_index_prod_catalog', 'output-available'),
            part('tool-algolia_grouped_results', 'input-streaming'),
          ],
        },
      }),
    ).toBe('Choosing pieces…');
  });

  it('is back to thinking once every tool has finished', () => {
    expect(
      loaderTextFor({
        phase: 'thinking',
        message: {
          parts: [
            part('tool-algolia_search_index_prod_catalog', 'output-available'),
            part('tool-algolia_grouped_results', 'output-available'),
          ],
        },
      }),
    ).toBe('Thinking…');
  });

  it('survives a context with nothing in it', () => {
    expect(loaderTextFor(undefined)).toBe('Thinking…');
  });
});
