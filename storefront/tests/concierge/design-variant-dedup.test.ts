import { describe, expect, it, vi } from 'vitest';
import { createArrangeGroups, designSignature } from '../../src/concierge/tools/arrangeGroups';
import type { CatalogRecordFetcher } from '../../src/concierge/tools/catalogRecord';

/**
 * Design-variant dedup (2026-10-23, Arijit): the catalog carries the same
 * design as multiple records (the same huggie hoop in yellow and white gold
 * at the same price), and two variants of one design filled two tiles. The
 * display must show one tile per design; a variant is dropped with reason
 * 'variant_of_shown' so the model reads why, like every other drop.
 * Real pairs from production: LGA601A/LGA601B (same design, yellow vs white
 * gold, both $1,196.99) must collapse; the twisted huggie and the lab-grown
 * diamond huggie are different designs and must both stay.
 */

const CATALOG: Record<string, { name: string; price: number }> = {
  LGA601B: { name: 'Oval White Lab-Grown Diamond G VS2 10K Yellow Gold Huggie Hoop Earrings', price: 1196.99 },
  LGA601A: { name: 'Oval White Lab-Grown Diamond G VS2 10K White Gold Huggie Hoop Earrings', price: 1196.99 },
  TWISTED: { name: 'Rhodium Over 10k White Gold 3/8 inch Polished Hinged Huggie Hoop Earrings', price: 398.29 },
  LABGROWN: { name: 'Rhodium Over 14K White Gold Lab Grown Diamond SI1/SI2, G H Huggie Hoop Earrings', price: 789.59 },
  PLAIN: { name: 'Plain Simple Hoop', price: 50 },
};

const fetcher: CatalogRecordFetcher = async (ids) => {
  const out = new Map();
  for (const id of ids) {
    const record = CATALOG[id];
    if (record) out.set(id, { objectID: id, name: record.name, price: record.price, link: `/product/${id}`, imageUrl: null, inStock: true });
  }
  return out;
};

describe('designSignature', () => {
  it('strips metal color, purity and size tokens', () => {
    expect(designSignature('Oval White Lab-Grown Diamond G VS2 10K Yellow Gold Huggie Hoop Earrings')).toBe(
      designSignature('Oval White Lab-Grown Diamond G VS2 10K White Gold Huggie Hoop Earrings'),
    );
  });
  it('keeps different designs apart', () => {
    expect(designSignature('Rhodium Over 10k White Gold 3/8 inch Polished Hinged Huggie Hoop Earrings')).not.toBe(
      designSignature('Rhodium Over 14K White Gold Lab Grown Diamond SI1/SI2, G H Huggie Hoop Earrings'),
    );
  });
});

describe('arrange_groups design-variant dedup', () => {
  it('drops a same-design variant and keeps different designs', async () => {
    const arrange = createArrangeGroups(fetcher);
    const result = await arrange({
      groups: [
        { title: 'Statement & diamond hoops', objectIDs: ['LGA601B', 'LGA601A'] },
        { title: 'Everyday', objectIDs: ['TWISTED', 'LABGROWN'] },
      ],
      minGroups: 1,
      maxGroups: 3,
    });
    expect(result.status).toBe('ok');
    expect(result.groups[0].items.map((i) => i.objectID)).toEqual(['LGA601B']);
    expect(result.dropped).toContainEqual(
      expect.objectContaining({ objectID: 'LGA601A', reason: 'variant_of_shown' }),
    );
    expect(result.groups[1].items.map((i) => i.objectID)).toEqual(['TWISTED', 'LABGROWN']);
  });
  it('does not drop different designs that share a metal prefix', async () => {
    const arrange = createArrangeGroups(fetcher);
    const result = await arrange({
      groups: [{ title: 'Hoops', objectIDs: ['TWISTED', 'LABGROWN', 'PLAIN'] }],
      minGroups: 1,
      maxGroups: 3,
      maxPerGroup: 3,
    });
    expect(result.status).toBe('ok');
    expect(result.groups[0].items.map((i) => i.objectID)).toEqual(['TWISTED', 'LABGROWN', 'PLAIN']);
    expect(result.dropped).toEqual([]);
  });
  it('reports the variant like every other drop, never reallocating across groups', async () => {
    const arrange = createArrangeGroups(fetcher);
    const result = await arrange({
      groups: [
        { title: 'First', objectIDs: ['LGA601B'] },
        { title: 'Second', objectIDs: ['LGA601A'] },
      ],
      minGroups: 1,
      maxGroups: 3,
    });
    expect(result.status).toBe('ok');
    expect(result.groups[0].items.map((i) => i.objectID)).toEqual(['LGA601B']);
    // A group left empty by the dedup is not published at all.
    expect(result.groups).toHaveLength(1);
    expect(result.shortfall).toContainEqual(expect.objectContaining({ group: 'Second' }));
    expect(result.dropped).toContainEqual(
      expect.objectContaining({ objectID: 'LGA601A', reason: 'variant_of_shown', group: 'Second' }),
    );
  });
});
