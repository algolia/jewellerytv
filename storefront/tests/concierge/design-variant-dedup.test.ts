import { describe, expect, it } from 'vitest';
import { normalizeProduct } from '../../src/catalog';
import { dedupeVariants, designSignature } from '../../src/concierge/ConciergeWorkspaceProvider';

/**
 * Design-variant dedup (2026-10-23, Arijit; re-homed 2026-10-24): the catalog
 * carries the same design as multiple records (the same huggie hoop in yellow
 * and white gold at the same price), and two variants of one design filled
 * two tiles. The display must show one tile per design. Real pairs from
 * production: LGA601A/LGA601B (same design, yellow vs white gold, both
 * $1,196.99) must collapse; the twisted huggie and the lab-grown diamond
 * huggie are different designs and must both stay. Originally implemented in
 * arrange_groups; the chips-native cut re-homed the rule into the streamed
 * display staging (dedupeVariants), so the tests follow it.
 */

const CATALOG: Record<string, { title: string; price: number }> = {
  LGA601B: { title: 'Oval White Lab-Grown Diamond G VS2 10K Yellow Gold Huggie Hoop Earrings', price: 1196.99 },
  LGA601A: { title: 'Oval White Lab-Grown Diamond G VS2 10K White Gold Huggie Hoop Earrings', price: 1196.99 },
  TWISTED: { title: 'Rhodium Over 10k White Gold 3/8 inch Polished Hinged Huggie Hoop Earrings', price: 398.29 },
  LABGROWN: { title: 'Rhodium Over 14K White Gold Lab Grown Diamond SI1/SI2, G H Huggie Hoop Earrings', price: 789.59 },
  PLAIN: { title: 'Plain Simple Hoop', price: 50 },
};

const products = (ids: string[]) =>
  ids.map((id) =>
    normalizeProduct({
      objectID: id,
      Catalog_TitleDescription: CATALOG[id].title,
      Pricing_ActivePrice: CATALOG[id].price,
      Inventory_InStock: true,
      Media_Images: [`https://example.com/${id}.jpg`],
    }),
  );

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

describe('chips-native design-variant dedup', () => {
  it('drops a same-design variant and keeps different designs', () => {
    const kept = dedupeVariants(products(['LGA601B', 'LGA601A', 'TWISTED', 'LABGROWN']));
    expect(kept.map((p) => p.id)).toEqual(['LGA601B', 'TWISTED', 'LABGROWN']);
  });
  it('does not drop different designs that share a metal prefix', () => {
    const kept = dedupeVariants(products(['TWISTED', 'LABGROWN', 'PLAIN']));
    expect(kept.map((p) => p.id)).toEqual(['TWISTED', 'LABGROWN', 'PLAIN']);
  });
  it('keeps the first hit in relevancy order, not the cheaper variant', () => {
    const kept = dedupeVariants(products(['LGA601A', 'LGA601B']));
    expect(kept.map((p) => p.id)).toEqual(['LGA601A']);
  });
});
