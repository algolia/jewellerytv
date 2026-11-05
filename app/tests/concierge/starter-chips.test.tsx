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
    expect(html).toContain('Not sure where to start? Try one of these.');
    /* The full wordmark, per the accepted welcome-screen design. */
    expect(html).toContain('/assets/jtv-logo-full.png');
  });

  /* Mid-turn everything goes down: dealing a new set under a streaming answer
   * would move the panel while it is being read. There is no re-roll control
   * in the accepted design; the nine chips are the whole surface. */
  it('disables the chips mid-turn', () => {
    const html = renderToStaticMarkup(
      <StarterChips sendMessage={() => undefined} status="streaming" />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(9);
  });

  /* Without a sender the chips can do nothing, so they render disabled
   * rather than lying about what a click will do. */
  it('disables the chips when the widget hands over no sender', () => {
    const html = renderToStaticMarkup(<StarterChips />);
    expect(html.match(/disabled=""/g)).toHaveLength(9);
  });

  /* The stagger is JTV's own layout: one centered list, the offset applied
   * presentationally in CSS to the even slots. */
  it('lays the starters out as the centered staggered list', () => {
    const html = renderToStaticMarkup(<StarterChips sendMessage={() => undefined} />);
    expect(html).toContain('jtv-chat-starters-list');
    expect(html.match(/class="jtv-chat-starter"/g)).toHaveLength(9);
  });
});

/* The live half of the set. These labels are derived from facet counts rather
 * than written down, which is the whole point: a label that names a series
 * only appears because the index says that series aired. */
describe('the live starters', () => {
  it("names the week's series and host", () => {
    expect(signalsToLabels({ series: ['Jewel School'], hosts: ['Melissa'] })).toEqual([
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
