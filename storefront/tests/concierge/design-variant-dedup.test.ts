import { describe, expect, it } from 'vitest';
import { designSignature, createPresentProducts } from '../../src/concierge/tools/presentProducts';

/**
 * Design-variant dedup (2026-10-23, Arijit; re-homed 2026-10-24 into the
 * present_products tool): the catalog carries the same design as multiple
 * records (the same huggie hoop in yellow and white gold at the same price),
 * and two variants of one design filled two tiles. The display must show one
 * tile per design; a variant is dropped with reason 'variant_of_shown'.
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

const fetcher = async (ids: readonly string[]) => {
  const out = new Map();
  for (const id of ids) {
    const record = CATALOG[id];
    if (record)
      out.set(id, {
        objectID: id,
        name: record.name,
        price: record.price,
        inStock: true,
        imageUrl: `https://example.com/${id}.jpg`,
        link: `/product/${id}`,
      });
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

describe('present_products design-variant dedup', () => {
  it('drops a same-design variant and keeps different designs', async () => {
    const present = createPresentProducts(fetcher);
    const result = await present({ objectIDs: ['LGA601B', 'LGA601A', 'TWISTED', 'LABGROWN'] });
    expect(result.status).toBe('ok');
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['LGA601B', 'TWISTED', 'LABGROWN']);
    expect(result.dropped).toContainEqual(
      expect.objectContaining({ objectID: 'LGA601A', reason: 'variant_of_shown' }),
    );
  });
  it('keeps the first pick in the model\'s order, not the cheaper variant', async () => {
    const present = createPresentProducts(fetcher);
    const result = await present({ objectIDs: ['LGA601A', 'LGA601B'] });
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['LGA601A']);
  });
});
