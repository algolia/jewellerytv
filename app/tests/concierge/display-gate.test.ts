import { describe, expect, it } from 'vitest';
import { gateGroups } from '../../src/concierge/chat/gatedGroupedResults';

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
      | Record<string, unknown>
      | undefined,
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

/* A shelf is four across. A group of one renders as a heading over a row that
 * is mostly empty, which is the complaint; folding keeps the piece and drops
 * only the claim that it is a direction of its own. */
describe('undersized groups', () => {
  const record = { Media_Images: ['https://img.test/a.jpg'] };
  const records = { get: () => record };
  const group = (title: string, ids: string[]) => ({
    title,
    results: ids.map((objectID) => ({ objectID })),
  });

  it('folds a trailing group of one into the group before it', () => {
    const { input } = gateGroups(
      { groups: [group('Rings', ['a', 'b', 'c', 'd']), group('Pendants', ['e'])] },
      records,
    );
    expect(input.groups).toHaveLength(1);
    expect(input.groups?.[0].title).toBe('Rings');
    expect(input.groups?.[0].results?.map((r) => r.objectID)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('keeps a group of three, which fills a row', () => {
    const { input } = gateGroups(
      { groups: [group('Rings', ['a', 'b', 'c']), group('Pendants', ['d', 'e', 'f'])] },
      records,
    );
    expect(input.groups).toHaveLength(2);
  });

  /* The first group has nothing to fold back into, so it keeps its pieces and
   * loses only the heading. Dropping them would lose shoppable stock. */
  it('strips the heading from a small leading group but keeps its pieces', () => {
    const { input } = gateGroups(
      { groups: [group('Odd one', ['a']), group('Rings', ['b', 'c', 'd', 'e'])] },
      records,
    );
    expect(input.groups?.map((g) => g.title)).toEqual([undefined, 'Rings']);
    expect(input.groups?.[0].results?.map((r) => r.objectID)).toEqual(['a']);
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
  const groups = [{ title: 'Rings', results: [{ objectID: 'a' }, { objectID: 'b' }, { objectID: 'c' }] }];

  it('is dropped when the message says it too', () => {
    const { input } = gateGroups({ intro: 'A first look.', groups }, records);
    expect(input.intro).toBeUndefined();
  });

  it('is kept when the message said nothing', () => {
    const { input } = gateGroups({ intro: 'A first look.', groups }, records, { keepIntro: true });
    expect(input.intro).toBe('A first look.');
  });
});

/* Four across, so a remainder of one is a piece stranded on a row by itself.
 * Two or three read as a partial row and are left alone. */
describe('a trailing row of one', () => {
  const records = { get: () => ({ Media_Images: ['https://img.test/a.jpg'] }) };
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ objectID: `p${i}` }));

  it('trims the fifth piece rather than stranding it', () => {
    const { input, dropped } = gateGroups(
      { groups: [{ title: 'Bands', results: ids(5) }] },
      records,
    );
    expect(input.groups?.[0].results).toHaveLength(4);
    expect(dropped).toEqual(['p4:orphan_row']);
  });

  it('leaves a partial row of two or three alone', () => {
    for (const n of [6, 7]) {
      const { input, dropped } = gateGroups(
        { groups: [{ title: 'Bands', results: ids(n) }] },
        records,
      );
      expect(input.groups?.[0].results).toHaveLength(n);
      expect(dropped).toEqual([]);
    }
  });

  it('leaves an exact row alone', () => {
    const { input } = gateGroups({ groups: [{ title: 'Bands', results: ids(8) }] }, records);
    expect(input.groups?.[0].results).toHaveLength(8);
  });

  /* Four or fewer is a single row; a group of one is the folding rule's job,
   * not this one. */
  it('does not touch a group that fits in one row', () => {
    const { input, dropped } = gateGroups({ groups: [{ title: 'Bands', results: ids(4) }] }, records);
    expect(input.groups?.[0].results).toHaveLength(4);
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
