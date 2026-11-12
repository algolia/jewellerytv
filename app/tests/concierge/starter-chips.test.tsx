import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StarterChips } from '../../src/concierge/chat/StarterChips';
import {
  STARTER_QUESTION_POOL,
  selectStarterSet,
  type StarterQuestion,
} from '../../src/concierge/chat/starterQuestions';
import { signalsToLabels } from '../../src/concierge/chat/starterSignals';

/* `selectStarterSet` still defaults to nine and enforces variety across theme
 * and voice so a set does not read as one sentence with the nouns swapped.
 * The panel asks it for five (JTV, 2026-11-12); the pool rules are unchanged,
 * which is why the selector tests below still use the default size. */

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
  it('renders five starters, each its own sendable control', () => {
    const html = renderToStaticMarkup(<StarterChips sendMessage={() => undefined} />);
    expect(html.match(/class="jtv-chat-starter"/g)).toHaveLength(5);
  });

  /* The wordmark gave way to a heading and a sentence (JTV, 2026-11-12): a
   * shopper who has never used this needs telling what it is, and the brand
   * is already on the page behind the panel. */
  it('says what the thing is instead of showing the wordmark', () => {
    const html = renderToStaticMarkup(<StarterChips sendMessage={() => undefined} />);
    expect(html).toContain('What can we help you find?');
    expect(html).toContain('your personal jewelry shopper');
    expect(html).not.toContain('jtv-logo-full.png');
    expect(html).not.toContain('Not sure where to start');
  });

  /* Mid-turn everything goes down: dealing a new set under a streaming answer
   * would move the panel while it is being read. The re-roll lives in the
   * header's New search control, not here. */
  it('disables the chips mid-turn', () => {
    const html = renderToStaticMarkup(
      <StarterChips sendMessage={() => undefined} status="streaming" />,
    );
    expect(html.match(/disabled=""/g)).toHaveLength(5);
  });

  /* Without a sender the chips can do nothing, so they render disabled
   * rather than lying about what a click will do. */
  it('disables the chips when the widget hands over no sender', () => {
    const html = renderToStaticMarkup(<StarterChips />);
    expect(html.match(/disabled=""/g)).toHaveLength(5);
  });

  /* One plain list; the single left-aligned column and the even spread are
   * CSS. The nine-chip stagger it replaced needed a presentational offset on
   * the even slots, and that is gone with it. */
  it('lays the starters out as one list', () => {
    const html = renderToStaticMarkup(<StarterChips sendMessage={() => undefined} />);
    expect(html).toContain('jtv-chat-starters-list');
    expect(html.match(/<li>/g)).toHaveLength(5);
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
