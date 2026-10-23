import { describe, expect, it, vi } from 'vitest';
import { createArrangeGroups } from '../../src/concierge/tools/arrangeGroups';
import type { CatalogRecordFetcher } from '../../src/concierge/tools/catalogRecord';

/**
 * Surplus reporting (two-phase canvas flow, 2026-10-23). The tool displays the
 * first two eligible pieces per group and silently discarded the rest, so the
 * model could never learn that eligible spares existed (measured: the opal
 * turn sent 5+4+1 candidates, displayed 2+2+1, dropped[] empty). The tool must
 * report every eligible piece it held back, with name and price, so the model
 * can regroup them into short directions. It must NOT reallocate: moving a
 * piece between directions is a semantic decision that belongs to the model.
 */

const records = new Map(
  ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'C1'].map((id) => [
    id,
    { objectID: id, name: `Piece ${id}`, price: 100, link: `/product/${id}`, imageUrl: null, inStock: true },
  ]),
);
const fetcher: CatalogRecordFetcher = async (ids) => {
  const out = new Map<string, (typeof records extends Map<string, infer V> ? V : never)>();
  for (const id of ids) {
    const record = records.get(id);
    if (record) out.set(id, record);
  }
  return out;
};
const arrange = createArrangeGroups(fetcher);

describe('arrange_groups surplus reporting', () => {
  it('reports eligible pieces held back by the per-group cap', async () => {
    const result = await arrange({
      groups: [{ title: 'Everyday', objectIDs: ['A1', 'A2', 'A3', 'A4'] }],
      minGroups: 1,
      maxGroups: 3,
    });
    expect(result.status).toBe('ok');
    expect(result.groups[0].items.map((i) => i.objectID)).toEqual(['A1', 'A2']);
    expect(result.surplus.map((s) => s.objectID)).toEqual(['A3', 'A4']);
    expect(result.surplus[0]).toMatchObject({ name: 'Piece A3', price: 100, group: 'Everyday' });
  });

  it('keeps drops and surplus distinct: an out-of-stock piece is a drop, not surplus', async () => {
    const outOfStock = new Map([
      ['X1', { objectID: 'X1', name: 'X', price: 50, link: '/product/X1', imageUrl: null, inStock: false }],
    ]);
    const arrangeOOS = createArrangeGroups(async (ids) => {
      const out = new Map();
      for (const id of ids) {
        if (outOfStock.has(id)) out.set(id, outOfStock.get(id));
        else if (records.has(id)) out.set(id, records.get(id));
      }
      return out;
    });
    const result = await arrangeOOS({
      groups: [{ title: 'G', objectIDs: ['X1', 'A1'] }],
      minGroups: 1,
      maxGroups: 3,
    });
    expect(result.dropped.map((d) => d.objectID)).toEqual(['X1']);
    expect(result.surplus).toEqual([]);
  });

  it('reports nothing when no group exceeds the cap', async () => {
    const result = await arrange({
      groups: [
        { title: 'One', objectIDs: ['A1', 'A2'] },
        { title: 'Two', objectIDs: ['B1', 'B2'] },
      ],
      minGroups: 1,
      maxGroups: 3,
    });
    expect(result.surplus).toEqual([]);
    expect(result.groups).toHaveLength(2);
  });

  it('still reports shortfall for an under-filled group', async () => {
    const result = await arrange({
      groups: [{ title: 'Thin', objectIDs: ['C1'] }],
      minGroups: 1,
      maxGroups: 3,
    });
    expect(result.shortfall).toEqual([{ group: 'Thin', missing: 1 }]);
    expect(result.surplus).toEqual([]);
  });
});
