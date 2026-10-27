import { describe, expect, it, vi } from 'vitest';
import { createCatalogRecordFetcher } from '../../src/concierge/tools/catalogRecord';

const record = (objectID: string) => ({
  objectID,
  Catalog_TitleDescription: `Product ${objectID}`,
  Pricing_ActivePrice: 100,
  Inventory_InStock: true,
  Media_Images: [`https://images.example/${objectID}.jpg`],
});

describe('catalog record fetcher batch path', () => {
  /* The curation tool's latency budget: per-ID requests lost the platform's
   * client-tool wait race (the cancelled present_products events, 2026-10-26).
   * One batched multi-get replaces N round trips, with the per-ID reader as
   * the fallback when the batch itself fails. */
  it('reads every id in one batch call when a batch reader is provided', async () => {
    const batch = vi.fn(async (ids: readonly string[]) => ids.map(record));
    const fetcher = createCatalogRecordFetcher(vi.fn(), { batchFetchRawRecords: batch });
    const records = await fetcher(['a', 'b', 'c']);
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch).toHaveBeenCalledWith(['a', 'b', 'c']);
    expect([...records.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(records.get('b')?.name).toBe('Product b');
  });

  it('falls back to per-ID reads when the batch call fails', async () => {
    const batch = vi.fn(async () => {
      throw new Error('batch endpoint down');
    });
    const perId = vi.fn(async (id: string) => record(id));
    const fetcher = createCatalogRecordFetcher(perId, { batchFetchRawRecords: batch });
    const records = await fetcher(['a', 'b']);
    expect(perId).toHaveBeenCalledTimes(2);
    expect([...records.keys()].sort()).toEqual(['a', 'b']);
  });

  it('chunks id sets larger than one batch', async () => {
    const batch = vi.fn(async (ids: readonly string[]) => ids.map(record));
    const fetcher = createCatalogRecordFetcher(vi.fn(), {
      batchFetchRawRecords: batch,
      batchSize: 2,
    });
    const records = await fetcher(['a', 'b', 'c']);
    expect(batch).toHaveBeenCalledTimes(2);
    expect([...records.keys()].sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps the identity rule: a record under a different objectID is not found', async () => {
    const batch = vi.fn(async (ids: readonly string[]) =>
      ids.map((id) => (id === 'swapped' ? record('other') : record(id))),
    );
    const fetcher = createCatalogRecordFetcher(vi.fn(), { batchFetchRawRecords: batch });
    const records = await fetcher(['a', 'swapped']);
    expect(records.has('a')).toBe(true);
    expect(records.has('swapped')).toBe(false);
  });

  it('uses the per-ID reader when no batch reader is provided', async () => {
    const perId = vi.fn(async (id: string) => record(id));
    const fetcher = createCatalogRecordFetcher(perId);
    const records = await fetcher(['a', 'b']);
    expect(perId).toHaveBeenCalledTimes(2);
    expect([...records.keys()].sort()).toEqual(['a', 'b']);
  });
});
