import { describe, expect, it } from 'vitest';
import {
  gateGroups,
  messageCarriesText,
  regroupRefinedHits,
  shapeRefinedGroups,
} from '../../src/concierge/chat/gatedGroupedResults';

/* The gate is the only place a piece can be refused now, so these cases are
 * the whole contract. The failure this replaces was silent: four layers each
 * returned nothing when a check failed, and a shelf could vanish with every
 * layer reporting success. */

const withImage = { objectID: 'A1', Media_Images: ['https://img/a1.jpg'] };
const onAirShape = { objectID: 'B2', name: 'On-air piece', imageLarge: 'https://img/b2.jpg' };
const noImage = { objectID: 'C3', Catalog_TitleDescription: 'Imageless' };

const store = (records: Record<string, unknown>[]) => ({
  get: (objectID: string) =>
    records.find((record) => (record as { objectID: string }).objectID === objectID) as
      Record<string, unknown> | undefined,
});

const group = (title: string, ids: string[]) => ({
  title,
  results: ids.map((objectID) => ({ objectID })),
});

describe('the display gate', () => {
  it('keeps pieces whose record carries an image, in either record shape', () => {
    const { input, dropped } = gateGroups(
      { groups: [group('Shelf', ['A1', 'B2'])] },
      store([withImage, onAirShape]),
    );
    expect(input.groups?.[0].results?.map((r) => r.objectID)).toEqual(['A1', 'B2']);
    expect(dropped).toEqual([]);
  });

  it('refuses a piece whose record has no usable image', () => {
    const { input, dropped } = gateGroups(
      { groups: [group('Shelf', ['A1', 'C3'])] },
      store([withImage, noImage]),
    );
    expect(input.groups?.[0].results?.map((r) => r.objectID)).toEqual(['A1']);
    expect(dropped).toEqual(['C3:no_image']);
  });

  /* Both groups end up under the three-piece floor once the repeat is
   * removed, so they fold together; what matters here is that the piece
   * appears once and the repeat is reported. */
  it('shows a piece once when the model repeats it across groups', () => {
    const { input, dropped } = gateGroups(
      { groups: [group('First', ['A1']), group('Second', ['A1', 'B2'])] },
      store([withImage, onAirShape]),
    );
    expect(input.groups?.flatMap((g) => g.results ?? []).map((r) => r.objectID)).toEqual([
      'A1',
      'B2',
    ]);
    expect(dropped).toEqual(['A1:duplicate']);
  });

  it('drops a group left with nothing rather than rendering a bare heading', () => {
    const { input } = gateGroups(
      { groups: [group('Alive', ['A1']), group('Emptied', ['C3'])] },
      store([withImage, noImage]),
    );
    expect(input.groups?.map((g) => g.title)).toEqual(['Alive']);
  });

  /* The input streams in, so a record can legitimately be unknown for a frame.
   * Refusing it then would flicker the shelf as it fills. */
  it('keeps a piece the record store has not seen yet', () => {
    const { input, dropped } = gateGroups({ groups: [group('Streaming', ['Z9'])] }, store([]));
    expect(input.groups?.[0].results?.map((r) => r.objectID)).toEqual(['Z9']);
    expect(dropped).toEqual([]);
  });

  it('survives a malformed call instead of throwing at render', () => {
    expect(gateGroups({}, store([])).input.groups).toEqual([]);
    expect(gateGroups({ groups: [{ title: 'No results key' }] }, store([])).input.groups).toEqual(
      [],
    );
  });
});

/* A shelf is four across, and the shape is deterministic: Arijit's 2026-11-04
 * call is complete rows of four, ending the 3-vs-4 lottery. Small groups fold
 * into a neighbour, remainders beyond a full row are dropped and logged, and a
 * shelf too thin to fill one row renders as-is rather than empty. */
describe('undersized groups', () => {
  const record = { Media_Images: ['https://img.test/a.jpg'] };
  const records = { get: () => record };
  const group = (title: string, ids: string[]) => ({
    title,
    results: ids.map((objectID) => ({ objectID })),
  });

  it('folds a trailing group of one into the group before it', () => {
    const { input, dropped } = gateGroups(
      { groups: [group('Rings', ['a', 'b', 'c', 'd']), group('Pendants', ['e'])] },
      records,
    );
    expect(input.groups).toHaveLength(1);
    expect(input.groups?.[0].title).toBe('Rings');
    /* The merged group ends on a complete row: the folded piece would sit
     * alone under four, so the row contract drops it and logs it. */
    expect(input.groups?.[0].results?.map((r) => r.objectID)).toEqual(['a', 'b', 'c', 'd']);
    expect(dropped).toEqual(['e:orphan_row']);
  });

  it('folds a small leading group forward so the shelf still fills rows', () => {
    const { input, dropped } = gateGroups(
      { groups: [group('Odd one', ['a', 'b', 'c']), group('Rings', ['d', 'e', 'f', 'g'])] },
      records,
    );
    expect(input.groups).toHaveLength(1);
    expect(input.groups?.[0].results?.map((r) => r.objectID)).toEqual(['a', 'b', 'c', 'd']);
    expect(dropped).toEqual(['e:orphan_row', 'f:orphan_row', 'g:orphan_row']);
  });

  it('folds two small groups into one full row', () => {
    const { input, dropped } = gateGroups(
      { groups: [group('Rings', ['a', 'b', 'c']), group('Pendants', ['d', 'e', 'f'])] },
      records,
    );
    expect(input.groups).toHaveLength(1);
    expect(input.groups?.[0].results).toHaveLength(4);
    expect(dropped).toEqual(['e:orphan_row', 'f:orphan_row']);
  });

  it('leaves a lone small group alone rather than emptying the shelf', () => {
    const { input } = gateGroups({ groups: [group('Rings', ['a', 'b'])] }, records);
    expect(input.groups).toHaveLength(1);
    expect(input.groups?.[0].results).toHaveLength(2);
  });
});

/* The intro is the model's voice duplicated when it also writes a message,
 * and its only voice when it does not. Which happens depends on the display
 * tool's settings, so the gate decides per message rather than once. */
describe('the tool intro', () => {
  const records = { get: () => ({ Media_Images: ['https://img.test/a.jpg'] }) };
  const groups = [
    { title: 'Rings', results: [{ objectID: 'a' }, { objectID: 'b' }, { objectID: 'c' }] },
  ];

  it('is dropped when the message says it too', () => {
    const { input } = gateGroups({ intro: 'A first look.', groups }, records);
    expect(input.intro).toBeUndefined();
  });

  it('is kept when the message said nothing', () => {
    const { input } = gateGroups({ intro: 'A first look.', groups }, records, { keepIntro: true });
    expect(input.intro).toBe('A first look.');
  });
});

/* "Carries text" means text that survives the display filter, not text that
 * exists. Measured live 2026-11-04 on "I'm looking for wedding ring sets":
 * the model wrote only "I'll search our wedding ring sets for you." and
 * "Now I'll curate the best options and display them." — both narration, both
 * dropped at render — yet the raw-text test treated them as a voice, kept the
 * intro suppressed, and the panel showed shelves with no speech at all. */
describe('whether a message carries rendered text', () => {
  const part = (text: string) => ({ type: 'text', text });

  it('reads a narration-only message as silence', () => {
    const owner = {
      parts: [part("I'll search our wedding ring sets for you."), part("Now I'll curate the best options and display them.")],
    };
    expect(messageCarriesText(owner)).toBe(false);
  });

  it('reads a message with a human sentence as a voice', () => {
    const owner = {
      parts: [
        part('Wonderful choice.'),
        part("I'll search our wedding ring sets for you."),
      ],
    };
    expect(messageCarriesText(owner)).toBe(true);
  });

  it('ignores empty and whitespace-only parts', () => {
    expect(messageCarriesText({ parts: [part(''), part('   ')] })).toBe(false);
    expect(messageCarriesText(undefined)).toBe(false);
    expect(messageCarriesText({ parts: [{ type: 'text' }] })).toBe(false);
  });
});

/* Four across, and the shape is the shopper's contract: a group is complete
 * rows, not a row and a straggler. Remainders beyond a full row are dropped
 * and logged; the piece count per group ends deterministic. */
describe('a trailing row beyond the first', () => {
  const records = { get: () => ({ Media_Images: ['https://img.test/a.jpg'] }) };
  const ids = (n: number) => Array.from({ length: n }, (_, i) => ({ objectID: `p${i}` }));

  it('trims the fifth piece rather than stranding it', () => {
    const { input, dropped } = gateGroups(
      { groups: [{ title: 'Bands', results: ids(5) }] },
      records,
    );
    expect(input.groups?.[0].results).toHaveLength(4);
    expect(dropped).toEqual(['p4:orphan_row']);
  });

  it('trims six and seven down to one full row', () => {
    for (const n of [6, 7]) {
      const { input, dropped } = gateGroups(
        { groups: [{ title: 'Bands', results: ids(n) }] },
        records,
      );
      expect(input.groups?.[0].results).toHaveLength(4);
      expect(dropped).toHaveLength(n - 4);
      for (const drop of dropped) expect(drop).toMatch(/:orphan_row$/);
    }
  });

  it('leaves exact rows alone', () => {
    for (const n of [4, 8]) {
      const { input, dropped } = gateGroups(
        { groups: [{ title: 'Bands', results: ids(n) }] },
        records,
      );
      expect(input.groups?.[0].results).toHaveLength(n);
      expect(dropped).toEqual([]);
    }
  });

  it('never trims a shelf too thin to fill one row', () => {
    const { input, dropped } = gateGroups(
      { groups: [{ title: 'Bands', results: ids(3) }] },
      records,
    );
    expect(input.groups?.[0].results).toHaveLength(3);
    expect(dropped).toEqual([]);
  });
});

/* The group's `why` renders as a second line under the heading and restates
 * it more vaguely — "Featured products" over "Different jewelry and accessory
 * styles". Two lines of chrome above every shelf buys nothing. */
describe('the group subtitle', () => {
  const records = { get: () => ({ Media_Images: ['https://img.test/a.jpg'] }) };

  it('is dropped, and the heading is kept', () => {
    const { input } = gateGroups(
      {
        groups: [
          {
            title: 'Featured products',
            why: 'Different jewelry and accessory styles',
            results: [{ objectID: 'a' }, { objectID: 'b' }, { objectID: 'c' }],
          },
        ],
      },
      records,
    );
    expect(input.groups?.[0].title).toBe('Featured products');
    expect(input.groups?.[0].why).toBeUndefined();
  });
});

/* The refined shelf keeps the agent's own shelf shape: the shopper's complaint
 * (2026-11-05) was that applying a filter collapsed twelve headed tiles into
 * eight heading-less ones. Every refined hit maps back to the agent's group by
 * objectID; leftovers land in one trailing section under a fixed UI label. */
describe('the refined shelf regroup', () => {
  const hit = (id: string) => ({ objectID: id }) as never;
  const originals = [
    { title: 'Classic', results: [{ objectID: 'a' }, { objectID: 'b' }, { objectID: 'c' }, { objectID: 'd' }] },
    { title: 'Modern', results: [{ objectID: 'e' }, { objectID: 'f' }] },
  ];

  it('renders survivors under their original titles in the agent order', () => {
    const groups = regroupRefinedHits([hit('e'), hit('a'), hit('b'), hit('f')], originals);
    expect(groups.map((g) => g.title)).toEqual(['Classic', 'Modern']);
    expect(groups[0].results.map((h) => h.objectID)).toEqual(['a', 'b']);
    expect(groups[1].results.map((h) => h.objectID)).toEqual(['e', 'f']);
  });

  it('puts hits the agent never showed under one trailing label', () => {
    const groups = regroupRefinedHits([hit('x'), hit('a'), hit('y')], originals);
    expect(groups.map((g) => g.title)).toEqual(['Classic', 'More picks']);
    expect(groups[1].results.map((h) => h.objectID)).toEqual(['x', 'y']);
  });

  it('invents no family when nothing matches the original groups', () => {
    const groups = regroupRefinedHits([hit('x'), hit('y')], originals);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe('More picks');
  });
});

/* The fold law runs on the refined groups too, and the hits travel by
 * objectID: a folded heading must never land on the wrong pieces. */
describe('the refined shelf shape', () => {
  const hit = (id: string) => ({ objectID: id }) as never;

  it('folds a trailing two-piece group forward and keeps the title honest', () => {
    const shaped = shapeRefinedGroups([
      { title: 'First', results: [hit('a'), hit('b'), hit('c'), hit('d')] },
      { title: 'Second', results: [hit('e'), hit('f')] },
    ]);
    expect(shaped).toHaveLength(1);
    expect(shaped[0].title).toBe('First');
    expect(shaped[0].results.map((h) => h.objectID)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps a lone thin group with its title rather than emptying it', () => {
    const shaped = shapeRefinedGroups([{ title: 'Only', results: [hit('a'), hit('b')] }]);
    expect(shaped).toHaveLength(1);
    expect(shaped[0].title).toBe('Only');
    expect(shaped[0].results).toHaveLength(2);
  });
});
