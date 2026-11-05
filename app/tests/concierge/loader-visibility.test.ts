import { describe, expect, it } from 'vitest';
import { keepLoaderUp } from '../../src/concierge/chat/loaderVisibility';

const text = (state: 'streaming' | 'done') => ({ type: 'text', state });
const tool = (name: string, state: string) => ({ type: `tool-${name}`, state });

describe('whether the turn status stays up', () => {
  it('never argues with the library when it already wants the loader', () => {
    expect(keepLoaderUp({ defaultValue: true, status: 'streaming' })).toBe(true);
    expect(keepLoaderUp({ defaultValue: true, status: 'ready' })).toBe(true);
  });

  /* The measured gap: the model's sentence has landed, the display tool has
   * not started, and the library has already hidden the loader. */
  it('holds through the gap after a finished sentence', () => {
    expect(
      keepLoaderUp({
        defaultValue: false,
        status: 'streaming',
        message: { parts: [text('done')] },
      }),
    ).toBe(true);
  });

  /* The transport emits a sentence at a time, so streaming text has gaps
   * in it too: 8 characters at 10691ms and 26 at 11418ms on the measured
   * turn, with nothing moving in between. */
  it('holds while the words are still arriving', () => {
    expect(
      keepLoaderUp({
        defaultValue: false,
        status: 'streaming',
        message: { parts: [text('streaming')] },
      }),
    ).toBe(true);
  });

  it('stands down once the turn is over', () => {
    for (const status of ['ready', 'error', undefined]) {
      expect(
        keepLoaderUp({ defaultValue: false, status, message: { parts: [text('done')] } }),
        String(status),
      ).toBe(false);
    }
  });

  /* Measured 2026-11-05: the skeleton stood alone from 4731ms to 8895ms on
   * "What did Misty feature this week?". It shows the shape of what is
   * coming, not that anything is happening, so the status holds over it. */
  it('holds over the shelf skeleton, which does not move', () => {
    expect(
      keepLoaderUp({
        defaultValue: false,
        status: 'streaming',
        message: { parts: [text('done'), tool('algolia_grouped_results', 'input-streaming')] },
      }),
    ).toBe(true);
  });

  it('stands down once the first group lands and tiles start filling in', () => {
    expect(
      keepLoaderUp({
        defaultValue: false,
        status: 'streaming',
        message: {
          parts: [
            text('done'),
            { ...tool('algolia_grouped_results', 'input-streaming'), input: { groups: [{}] } },
          ],
        },
      }),
    ).toBe(false);
  });

  /* The search tool renders nothing of its own, and it is fast; the library
   * already keeps the loader up for it through `defaultValue`. */
  it('leaves other tools to the library', () => {
    expect(
      keepLoaderUp({
        defaultValue: false,
        status: 'streaming',
        message: { parts: [tool('algolia_search_index_prod_catalog', 'output-available')] },
      }),
    ).toBe(false);
  });

  it('reads the last visible part, not the last part', () => {
    expect(
      keepLoaderUp({
        defaultValue: false,
        status: 'streaming',
        message: { parts: [text('done'), { type: 'reasoning', state: 'done' }] },
      }),
    ).toBe(true);
  });

  it('is false with nothing to judge', () => {
    expect(keepLoaderUp({ defaultValue: false, status: 'streaming' })).toBe(false);
    expect(keepLoaderUp({ defaultValue: false, status: 'streaming', message: { parts: [] } })).toBe(
      false,
    );
  });
});
