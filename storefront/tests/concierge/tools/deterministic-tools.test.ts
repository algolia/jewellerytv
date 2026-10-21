import { describe, expect, it } from 'vitest';
import { toCatalogRecord, createCatalogRecordFetcher } from '../../../src/concierge/tools/catalogRecord';
import { createCheckPrice } from '../../../src/concierge/tools/checkPrice';
import { createCheckStock } from '../../../src/concierge/tools/checkStock';
import { createRefreshProducts } from '../../../src/concierge/tools/refreshProducts';
import { createArrangeGroups } from '../../../src/concierge/tools/arrangeGroups';

/**
 * Lane 1 unit cases, written against results/P4/tools/TEST-SPEC.md (Tester,
 * 2026-10-21). Every objectID, price and stock flag below was extracted from
 * the temp4 run captures (files cited in TEST-SPEC); FIX1000 is the one
 * synthetic fixture TEST-SPEC asks for (price exactly at a $1,000 bound).
 */

type RawRecord = Record<string, unknown>;

function raw(
  objectID: string,
  price: number,
  inStock: boolean,
  name = `Fixture ${objectID}`,
  image = `https://images.jtv.com/jewelry/JTV-${objectID}-1.jpg`,
): RawRecord {
  return {
    objectID,
    Catalog_TitleDescription: name,
    Pricing_ActivePrice: price,
    Inventory_InStock: inStock,
    Media_Images: [image],
  };
}

// The captured record table from TEST-SPEC, as raw index records.
const CAPTURED: Record<string, RawRecord> = {
  WPD990: raw('WPD990', 109.0, true),
  WPD824: raw('WPD824', 129.99, true),
  WPD972: raw('WPD972', 269.44, true),
  '1DP94A': raw('1DP94A', 1051.44, true),
  '1164GA': raw('1164GA', 1902.18, true),
  WPG593: raw('WPG593', 559.99, false, 'Blue Oval Tanzanite 14k Rose Gold Ring 1.71ctw'),
  WPG776: raw('WPG776', 635.11, false),
  WPG122A: raw('WPG122A', 729.39, false),
  WPD964: raw('WPD964', 192.94, true),
  WPD157: raw('WPD157', 81.2, true),
  FIX1000: raw('FIX1000', 1000.0, true),
};

function makeFetcher(table: Record<string, RawRecord> = CAPTURED) {
  return createCatalogRecordFetcher(async (objectID) => table[objectID] ?? null);
}

const price = () => createCheckPrice(makeFetcher());
const stock = () => createCheckStock(makeFetcher());
const refresh = () => createRefreshProducts(makeFetcher());
const arrange = () => createArrangeGroups(makeFetcher());

describe('catalogRecord', () => {
  it('parses a captured raw record into the tool view', () => {
    const record = toCatalogRecord(CAPTURED.WPG593);
    expect(record).toEqual({
      objectID: 'WPG593',
      name: 'Blue Oval Tanzanite 14k Rose Gold Ring 1.71ctw',
      price: 559.99,
      inStock: false,
      imageUrl: 'https://images.jtv.com/jewelry/JTV-WPG593-1.jpg',
      link: '/product/WPG593',
    });
  });

  it('rejects a record whose objectID does not match the requested ID', async () => {
    const fetcher = createCatalogRecordFetcher(async () => CAPTURED.WPD990);
    const records = await fetcher(['NOPE404']);
    expect(records.has('NOPE404')).toBe(false);
  });
});

describe('checkPrice', () => {
  it('prices in-bounds under a ceiling (WPD990, ceiling 1000)', async () => {
    const out = await price()({ objectIDs: ['WPD990'], ceiling: 1000 });
    expect(out).toEqual({
      status: 'ok',
      results: [{ objectID: 'WPD990', outcome: 'ok', price: 109.0, withinBounds: true }],
      duplicates: [],
    });
  });

  it('marks far-over-ceiling out of bounds (1164GA, ceiling 1000)', async () => {
    const out = await price()({ objectIDs: ['1164GA'], ceiling: 1000 });
    expect(out.status).toBe('ok');
    expect(out.status === 'ok' && out.results[0]).toEqual({
      objectID: '1164GA',
      outcome: 'ok',
      price: 1902.18,
      withinBounds: false,
    });
  });

  it('marks in-stock-over-ceiling out of bounds; stock is not this tool (1DP94A)', async () => {
    const out = await price()({ objectIDs: ['1DP94A'], ceiling: 1000 });
    expect(out.status === 'ok' && out.results[0]).toMatchObject({ withinBounds: false });
  });

  it('excludes the exact bound (synthetic FIX1000 at a $1,000 ceiling)', async () => {
    const out = await price()({ objectIDs: ['FIX1000'], ceiling: 1000 });
    expect(out.status === 'ok' && out.results[0]).toMatchObject({ price: 1000.0, withinBounds: false });
  });

  it('keeps just-under-the-bound in bounds (WPD157, ceiling 100)', async () => {
    const out = await price()({ objectIDs: ['WPD157'], ceiling: 100 });
    expect(out.status === 'ok' && out.results[0]).toMatchObject({ price: 81.2, withinBounds: true });
  });

  it('applies a floor and a ceiling together (WPD972 in 100-300)', async () => {
    const out = await price()({ objectIDs: ['WPD972'], floor: 100, ceiling: 300 });
    expect(out.status === 'ok' && out.results[0]).toMatchObject({ withinBounds: true });
  });

  it('marks under-floor out of bounds (WPD157, floor 100)', async () => {
    const out = await price()({ objectIDs: ['WPD157'], floor: 100 });
    expect(out.status === 'ok' && out.results[0]).toMatchObject({ withinBounds: false });
  });

  it('prices an out-of-stock record; no stock field in the output (WPG593)', async () => {
    const out = await price()({ objectIDs: ['WPG593'], ceiling: 1000 });
    expect(out.status === 'ok' && out.results[0]).toEqual({
      objectID: 'WPG593',
      outcome: 'ok',
      price: 559.99,
      withinBounds: true,
    });
  });

  it('reports a missing ID as not_found (NOPE404)', async () => {
    const out = await price()({ objectIDs: ['NOPE404'] });
    expect(out.status === 'ok' && out.results[0]).toEqual({ objectID: 'NOPE404', outcome: 'not_found' });
  });

  it('returns duplicate input IDs once each, noted (WPD990 x2)', async () => {
    const out = await price()({ objectIDs: ['WPD990', 'WPD990'] });
    expect(out.status === 'ok' && out.duplicates).toEqual(['WPD990']);
    expect(out.status === 'ok' && out.results).toHaveLength(1);
  });

  it('returns invalid_input for empty input', async () => {
    const out = await price()({ objectIDs: [] });
    expect(out.status).toBe('invalid_input');
  });
});

describe('checkStock', () => {
  it('reads in stock (WPD824)', async () => {
    const out = await stock()({ objectIDs: ['WPD824'] });
    expect(out.status === 'ok' && out.results[0]).toEqual({ objectID: 'WPD824', outcome: 'ok', inStock: true });
  });

  it('reads out of stock, the temp4 q02 excluded piece (WPG593)', async () => {
    const out = await stock()({ objectIDs: ['WPG593'] });
    expect(out.status === 'ok' && out.results[0]).toEqual({ objectID: 'WPG593', outcome: 'ok', inStock: false });
  });

  it('reads the second out-of-stock record (WPG776)', async () => {
    const out = await stock()({ objectIDs: ['WPG776'] });
    expect(out.status === 'ok' && out.results[0]).toEqual({ objectID: 'WPG776', outcome: 'ok', inStock: false });
  });

  it('keeps input order on a mixed read (WPD824, WPG593, WPD964)', async () => {
    const out = await stock()({ objectIDs: ['WPD824', 'WPG593', 'WPD964'] });
    expect(
      out.status === 'ok' && out.results.map((r) => (r.outcome === 'ok' ? r.inStock : 'not_found')),
    ).toEqual([true, false, true]);
  });

  it('reports a missing ID (NOPE404)', async () => {
    const out = await stock()({ objectIDs: ['NOPE404'] });
    expect(out.status === 'ok' && out.results[0]).toEqual({ objectID: 'NOPE404', outcome: 'not_found' });
  });

  it('deduplicates input (WPG593 x2)', async () => {
    const out = await stock()({ objectIDs: ['WPG593', 'WPG593'] });
    expect(out.status === 'ok' && out.duplicates).toEqual(['WPG593']);
    expect(out.status === 'ok' && out.results).toHaveLength(1);
  });

  it('returns invalid_input for empty input', async () => {
    expect((await stock()({ objectIDs: [] })).status).toBe('invalid_input');
  });
});

describe('refreshProducts', () => {
  it('refreshes the captured tanzanite record (WPG593)', async () => {
    const out = await refresh()({ objectIDs: ['WPG593'] });
    expect(out.status === 'ok' && out.records[0]).toEqual({
      objectID: 'WPG593',
      outcome: 'ok',
      name: 'Blue Oval Tanzanite 14k Rose Gold Ring 1.71ctw',
      price: 559.99,
      inStock: false,
      imageUrl: 'https://images.jtv.com/jewelry/JTV-WPG593-1.jpg',
      link: '/product/WPG593',
    });
  });

  it('refreshes an in-stock record (WPD990)', async () => {
    const out = await refresh()({ objectIDs: ['WPD990'] });
    expect(out.status === 'ok' && out.records[0]).toMatchObject({
      objectID: 'WPD990',
      price: 109.0,
      inStock: true,
      link: '/product/WPD990',
    });
  });

  it('reports a missing ID without a partial record (NOPE404)', async () => {
    const out = await refresh()({ objectIDs: ['NOPE404'] });
    expect(out.status === 'ok' && out.records[0]).toEqual({ objectID: 'NOPE404', outcome: 'not_found' });
    expect(out.status === 'ok' && out.notFound).toEqual(['NOPE404']);
  });

  it('reflects the shortfall on a mixed read (WPD990, WPG593, NOPE404)', async () => {
    const out = await refresh()({ objectIDs: ['WPD990', 'WPG593', 'NOPE404'] });
    expect(out.status === 'ok' && out.records.filter((r) => r.outcome === 'ok')).toHaveLength(2);
    expect(out.status === 'ok' && out.notFound).toEqual(['NOPE404']);
  });

  it('deduplicates input (WPD990 x2)', async () => {
    const out = await refresh()({ objectIDs: ['WPD990', 'WPD990'] });
    expect(out.status === 'ok' && out.duplicates).toEqual(['WPD990']);
    expect(out.status === 'ok' && out.records).toHaveLength(1);
  });

  it('returns invalid_input for empty input', async () => {
    expect((await refresh()({ objectIDs: [] })).status).toBe('invalid_input');
  });
});

describe('arrangeGroups', () => {
  it('publishes a valid grid of three groups of two (captured in-stock IDs)', async () => {
    const out = await arrange()({
      groups: [
        { title: 'Cocktail rings', objectIDs: ['WPD990', 'WPD824'] },
        { title: 'Everyday rings', objectIDs: ['WPD972', 'WPD964'] },
        { title: 'Budget picks', objectIDs: ['WPD157', 'WPD824' === 'WPD824' ? '1DP94A' : ''] },
      ],
    });
    expect(out.status).toBe('ok');
    expect(out.status === 'ok' && out.groups).toHaveLength(3);
    expect(out.status === 'ok' && out.groups.every((g) => g.items.length === 2)).toBe(true);
    expect(out.status === 'ok' && out.dropped).toEqual([]);
    expect(out.status === 'ok' && out.shortfall).toEqual([]);
  });

  it('drops an out-of-stock member with a reason and keeps the remaining item (WPG593)', async () => {
    const out = await arrange()({
      groups: [
        { title: 'Tanzanite', objectIDs: ['WPG593', 'WPD990'] },
        { title: 'Silver', objectIDs: ['WPD824', 'WPD964'] },
        { title: 'Gemstone', objectIDs: ['WPD972', 'WPD157'] },
      ],
    });
    expect(out.status).toBe('ok');
    expect(out.status === 'ok' && out.dropped).toEqual([
      { objectID: 'WPG593', reason: 'out_of_stock', group: 'Tanzanite' },
    ]);
    expect(out.status === 'ok' && out.groups[0].items).toHaveLength(1);
    expect(out.status === 'ok' && out.shortfall).toEqual([{ group: 'Tanzanite', missing: 1 }]);
  });

  it("keeps the first group's copy of a duplicate and drops the second (WPD990 in two groups)", async () => {
    const out = await arrange()({
      groups: [
        { title: 'A', objectIDs: ['WPD990', 'WPD824'] },
        { title: 'B', objectIDs: ['WPD990', 'WPD964'] },
        { title: 'C', objectIDs: ['WPD972', 'WPD157'] },
      ],
    });
    expect(out.status === 'ok' && out.dropped).toEqual([
      { objectID: 'WPD990', reason: 'duplicate', group: 'B' },
    ]);
    expect(out.status === 'ok' && out.groups.find((g) => g.title === 'A')?.items).toHaveLength(2);
    expect(out.status === 'ok' && out.groups.find((g) => g.title === 'B')?.items).toHaveLength(1);
  });

  it('drops a missing ID as not_found (NOPE404)', async () => {
    const out = await arrange()({
      groups: [
        { title: 'A', objectIDs: ['NOPE404', 'WPD990'] },
        { title: 'B', objectIDs: ['WPD824', 'WPD964'] },
        { title: 'C', objectIDs: ['WPD972', 'WPD157'] },
      ],
    });
    expect(out.status === 'ok' && out.dropped).toEqual([
      { objectID: 'NOPE404', reason: 'not_found', group: 'A' },
    ]);
  });

  it('publishes no tiles for one group against the default minimum and reports the count shortfall', async () => {
    const out = await arrange()({ groups: [{ title: 'Only', objectIDs: ['WPD990', 'WPD824'] }] });
    expect(out.status).toBe('shortfall');
    expect(out.groups).toEqual([]);
    expect(out.groupCount).toEqual({ actual: 1, min: 3, max: 3 });
  });

  it('rejects four groups as invalid_input against the default maximum', async () => {
    const out = await arrange()({
      groups: [
        { title: 'A', objectIDs: ['WPD990', 'WPD824'] },
        { title: 'B', objectIDs: ['WPD972', 'WPD964'] },
        { title: 'C', objectIDs: ['WPD157', '1DP94A'] },
        { title: 'D', objectIDs: ['WPG776', 'WPG122A'] },
      ],
    });
    expect(out.status).toBe('invalid_input');
    expect(out.groups).toEqual([]);
  });

  it('publishes zero tiles when everything is ineligible and reports all reasons', async () => {
    const out = await arrange()({
      groups: [{ title: 'Tanzanite', objectIDs: ['WPG593', 'WPG776', 'WPG122A'] }],
    });
    expect(out.status).toBe('shortfall');
    expect(out.groups).toEqual([]);
    expect(out.dropped).toEqual([
      { objectID: 'WPG593', reason: 'out_of_stock', group: 'Tanzanite' },
      { objectID: 'WPG776', reason: 'out_of_stock', group: 'Tanzanite' },
      { objectID: 'WPG122A', reason: 'out_of_stock', group: 'Tanzanite' },
    ]);
    expect(out.shortfall).toEqual([{ group: 'Tanzanite', missing: 2 }]);
  });

  it('returns invalid_input for empty groups', async () => {
    expect((await arrange()({ groups: [] })).status).toBe('invalid_input');
  });

  it('drops over-ceiling pieces, the temp4 q24 $1,000 trap (1164GA, 1DP94A)', async () => {
    const out = await arrange()({
      ceiling: 1000,
      groups: [
        { title: 'Under $1,000', objectIDs: ['WPD990', 'WPD824'] },
        { title: 'Trap A', objectIDs: ['1164GA', 'WPD972'] },
        { title: 'Trap B', objectIDs: ['1DP94A', 'WPD964'] },
      ],
    });
    expect(out.status === 'ok' && out.dropped).toEqual([
      { objectID: '1164GA', reason: 'over_ceiling', group: 'Trap A' },
      { objectID: '1DP94A', reason: 'over_ceiling', group: 'Trap B' },
    ]);
    expect(out.status === 'ok' && out.groups.find((g) => g.title === 'Under $1,000')?.items).toHaveLength(2);
  });

  it('never displays the out-of-stock piece on the temp4 q02 shape (WPG593 among eligible tanzanite)', async () => {
    const out = await arrange()({
      groups: [
        { title: 'Tanzanite rings', objectIDs: ['WPG593', 'WPD990'] },
        { title: 'Tanzanite earrings', objectIDs: ['WPD824', 'WPD972'] },
        { title: 'Tanzanite pendants', objectIDs: ['WPD964', 'WPD157'] },
      ],
    });
    const displayed =
      out.status === 'ok' ? out.groups.flatMap((g) => g.items.map((i) => i.objectID)) : [];
    expect(displayed).not.toContain('WPG593');
    expect(displayed).toEqual(['WPD990', 'WPD824', 'WPD972', 'WPD964', 'WPD157']);
  });
});
