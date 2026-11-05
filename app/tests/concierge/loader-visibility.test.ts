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

  it('stands down while the words are still arriving', () => {
    expect(
      keepLoaderUp({
        defaultValue: false,
        status: 'streaming',
        message: { parts: [text('streaming')] },
      }),
    ).toBe(false);
  });

  it('stands down once the turn is over', () => {
    for (const status of ['ready', 'error', undefined]) {
      expect(
        keepLoaderUp({ defaultValue: false, status, message: { parts: [text('done')] } }),
        String(status),
      ).toBe(false);
    }
  });

  /* A tool part carries its own affordance — the shelf skeleton — so the
   * loader would be a second one saying the same thing. */
  it('leaves a running tool to speak for itself', () => {
    expect(
      keepLoaderUp({
        defaultValue: false,
        status: 'streaming',
        message: { parts: [text('done'), tool('algolia_grouped_results', 'input-streaming')] },
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
