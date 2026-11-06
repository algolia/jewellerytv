import { describe, expect, it } from 'vitest';
import { filterNarration } from '../../src/concierge/chat/narrationFilter';

type Chunk = { type?: string; id?: string; delta?: string } & Record<string, unknown>;

/** Feeds chunks through the filter and collects what survives. */
async function run(chunks: Chunk[]): Promise<Chunk[]> {
  const source = new ReadableStream<Chunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const out: Chunk[] = [];
  const reader = filterNarration(source).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(value);
  }
  return out;
}

/** The deltas a text block would arrive in, a few words at a time. */
const block = (id: string, text: string): Chunk[] => [
  { type: 'text-start', id },
  ...text.split(/(?<=\s)/).map((delta) => ({ type: 'text-delta', id, delta })),
  { type: 'text-end', id },
];

const textOf = (chunks: Chunk[]) =>
  chunks
    .filter((chunk) => chunk.type === 'text-delta')
    .map((chunk) => chunk.delta)
    .join('');

describe('the narration filter', () => {
  it('drops a narration block entirely, start and end included', async () => {
    const out = await run(block('a', "I'll search for garnet pendants for you."));
    expect(out).toEqual([]);
  });

  it('lets a reply through, every word of it', async () => {
    const reply = 'Opal runs deep here, from milky Ethiopian stones to the darker black opals.';
    const out = await run(block('a', reply));
    expect(textOf(out)).toBe(reply);
    expect(out[0].type).toBe('text-start');
    expect(out[out.length - 1].type).toBe('text-end');
  });

  /* The point of filtering here rather than in the display: nothing is
   * emitted before the verdict, so no word ever renders and then vanishes. */
  it('emits nothing at all until it has judged the block', async () => {
    const out = await run([
      { type: 'text-start', id: 'a' },
      { type: 'text-delta', id: 'a', delta: "I'll " },
      { type: 'text-delta', id: 'a', delta: 'search ' },
    ]);
    expect(out).toEqual([]);
  });

  it('keeps the reply when a turn narrates first', async () => {
    const out = await run([
      ...block('a', "I'll search for Judith Ripka jewelry."),
      { type: 'tool-input-start', toolCallId: 's', toolName: 'algolia_search_index' },
      ...block('b', 'Judith Ripka leans sculptural, with a lot of textured gold.'),
    ]);
    expect(textOf(out)).toBe('Judith Ripka leans sculptural, with a lot of textured gold.');
    expect(out.some((chunk) => chunk.type === 'tool-input-start')).toBe(true);
  });

  it('never holds a non-text chunk', async () => {
    const tool = { type: 'tool-output-available', toolCallId: 's', output: { hits: [] } };
    expect(await run([tool])).toEqual([tool]);
  });

  /* Both measured on the class battery, 2026-11-05. The block-at-a-time
   * filter released each at its first full stop, because what stood there
   * was an interjection and a sentence about the results, and the
   * announcement behind it then streamed through unexamined. */
  it('drops narration that follows a verdict on the search', async () => {
    const out = await run(
      block(
        'a',
        'I see these results are mostly silver with gold overlay and gemstones. Let me search for solid sterling silver hoops instead.',
      ),
    );
    expect(textOf(out)).toBe(
      'I see these results are mostly silver with gold overlay and gemstones. ',
    );
  });

  it('keeps the human sentence when the narration comes first', async () => {
    const out = await run(
      block('a', "I'll show you a few. These sapphires run deep blue and warm up under lamplight."),
    );
    expect(textOf(out)).toBe('These sapphires run deep blue and warm up under lamplight.');
  });

  /* Measured 2026-11-05 on "Show me blue topaz December rings": the model
   * opened with an interjection and then narrated, the filter did its job,
   * and the whole voice over three shelves was the word "Perfect!". */
  it('drops an interjection left alone by the narration it introduced', async () => {
    const out = await run(block('a', "Perfect! Now I'll display these rings."));
    expect(out).toEqual([]);
  });

  it('keeps an interjection in front of a sentence that survives', async () => {
    const out = await run(
      block('a', 'Perfect! Blue topaz runs deep here, from pale sky to London blue.'),
    );
    expect(textOf(out)).toBe('Perfect! Blue topaz runs deep here, from pale sky to London blue.');
  });

  /* A stream cut off mid-block must not swallow what it was holding. */
  it('releases a half-judged block when the stream ends', async () => {
    const out = await run([
      { type: 'text-start', id: 'a' },
      { type: 'text-delta', id: 'a', delta: 'Opal runs' },
    ]);
    expect(textOf(out)).toBe('Opal runs');
  });
});
