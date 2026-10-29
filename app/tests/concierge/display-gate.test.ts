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

  it('shows a piece once when the model repeats it across groups', () => {
    const { input, dropped } = gateGroups(
      { groups: [group('First', ['A1']), group('Second', ['A1', 'B2'])] },
      store([withImage, onAirShape]),
    );
    expect(input.groups?.[0].results?.map((r) => r.objectID)).toEqual(['A1']);
    expect(input.groups?.[1].results?.map((r) => r.objectID)).toEqual(['B2']);
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
