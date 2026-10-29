import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StarterChips } from '../../src/concierge/chat/StarterChips';
import {
  STARTER_QUESTION_POOL,
  selectStarterSet,
  type StarterQuestion,
} from '../../src/concierge/chat/starterQuestions';
import { signalsToLabels } from '../../src/concierge/chat/starterSignals';

/* The pool's standing rule is that a set shows nine and never fewer than six,
 * with variety enforced across theme and voice so a set does not read as one
 * sentence with the nouns swapped. */

const seeded = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

describe('the starter set', () => {
  it('picks nine from the pool', () => {
    const set = selectStarterSet(STARTER_QUESTION_POOL, [], seeded([0.1, 0.5, 0.9, 0.3, 0.7]));
    expect(set).toHaveLength(9);
    expect(new Set(set.map((q) => q.label)).size).toBe(9);
  });

  it('spreads across themes and voices rather than repeating one shape', () => {
    const set = selectStarterSet(STARTER_QUESTION_POOL, [], seeded([0.2, 0.8, 0.4, 0.6, 0.05]));
    const perTheme = new Map<string, number>();
    const perVoice = new Map<string, number>();
    for (const question of set) {
      perTheme.set(question.theme, (perTheme.get(question.theme) ?? 0) + 1);
      perVoice.set(question.voice, (perVoice.get(question.voice) ?? 0) + 1);
    }
    expect(Math.max(...perTheme.values())).toBeLessThanOrEqual(3);
    expect(Math.max(...perVoice.values())).toBeLessThanOrEqual(3);
  });

  it('avoids labels already shown this session', () => {
    const first = selectStarterSet(STARTER_QUESTION_POOL, [], seeded([0.3, 0.6, 0.9]));
    const second = selectStarterSet(
      STARTER_QUESTION_POOL,
      first.map((q) => q.label),
      seeded([0.3, 0.6, 0.9]),
    );
    const repeated = second.filter((q) => first.some((seen) => seen.label === q.label));
    expect(repeated).toEqual([]);
  });

  /* "View more" accumulates: the second re-roll must avoid both prior sets,
   * not just the one on screen, or the shopper is handed back chips they
   * already declined. */
  it('accumulates across re-rolls', () => {
    const first = selectStarterSet(STARTER_QUESTION_POOL, [], seeded([0.3, 0.6, 0.9]));
    const seenAfterFirst = first.map((q) => q.label);
    const second = selectStarterSet(STARTER_QUESTION_POOL, seenAfterFirst, seeded([0.15, 0.85]));
    const seenAfterSecond = [...seenAfterFirst, ...second.map((q) => q.label)];
    const third = selectStarterSet(STARTER_QUESTION_POOL, seenAfterSecond, seeded([0.45, 0.05]));
    expect(third.filter((q) => seenAfterSecond.includes(q.label))).toEqual([]);
  });

  /* The pool is bigger than one set, but a caller asking for more than it
   * holds must still get a usable set rather than an exception. */
  it('still returns a set when the pool is smaller than the request', () => {
    const tiny = STARTER_QUESTION_POOL.slice(0, 3) as readonly StarterQuestion[];
    expect(selectStarterSet(tiny, [], seeded([0.5]))).toHaveLength(3);
  });
});

describe('the empty state', () => {
  it('renders every starter as its own sendable control', () => {
    const html = renderToStaticMarkup(<StarterChips sendMessage={() => undefined} />);
    expect(html.match(/class="jtv-chat-starter"/g)).toHaveLength(9);
    expect(html).toContain('Ask about a piece, an occasion, or how we work.');
  });

  /* Mid-turn everything goes down, the re-roll included: dealing a new set
   * under a streaming answer would move the panel while it is being read. */
  it('disables the chips and the re-roll mid-turn', () => {
    const html = renderToStaticMarkup(
      <StarterChips sendMessage={() => undefined} status="streaming" />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(10);
  });

  /* Without a sender the chips cannot do anything, but the re-roll still can:
   * it only deals from the local pool. */
  it('disables the chips when the widget hands over no sender', () => {
    const html = renderToStaticMarkup(<StarterChips />);
    expect(html.match(/disabled=""/g)).toHaveLength(9);
    expect(html).toContain('jtv-chat-starters-more');
  });
});

/* The live half of the set. These labels are derived from facet counts rather
 * than written down, which is the whole point: a label that names a series
 * only appears because the index says that series aired. */
describe('the live starters', () => {
  it('names the week\'s series and host', () => {
    expect(
      signalsToLabels({ series: ['Jewel School'], hosts: ['Melissa'] }),
    ).toEqual([
      'What was on Jewel School this week?',
      'What did Melissa feature this week?',
    ]);
  });

  it('offers nothing when the broadcast window is empty', () => {
    expect(signalsToLabels({ series: [], hosts: [] })).toEqual([]);
  });

  /* A quiet week can have shows without a named host, or the reverse. Either
   * half alone is still a true chip. */
  it('offers whichever half it has', () => {
    expect(signalsToLabels({ series: ['Warehouse Clearance'], hosts: [] })).toEqual([
      'What was on Warehouse Clearance this week?',
    ]);
    expect(signalsToLabels({ series: [], hosts: ['Susan'] })).toEqual([
      'What did Susan feature this week?',
    ]);
  });

  it('never takes more than its two slots', () => {
    expect(
      signalsToLabels({
        series: ['Jewel School', 'Prazana Lab-Grown Diamonds'],
        hosts: ['Melissa', 'Susan'],
      }),
    ).toHaveLength(2);
  });
});
