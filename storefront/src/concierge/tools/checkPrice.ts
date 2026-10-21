/* Lane 1 deterministic tool 2: check_price (TOOLS-DESIGN-V1.md).
 *
 * One job: price facts against the bounds the caller passes. Stock is not
 * this tool's job. Bounds are strict at both edges: a piece priced exactly at
 * the ceiling or floor is out of bounds (the live production rule, "under
 * $200 excludes $200"). Input is validated to a structured invalid_input
 * outcome, never a throw; no shopper-facing text. */

import type { CatalogRecordFetcher } from './catalogRecord';

export type PriceCheckEntry =
  | { objectID: string; outcome: 'ok'; price: number | null; withinBounds: boolean }
  | { objectID: string; outcome: 'not_found' };

export type PriceCheckInput = {
  objectIDs: readonly string[];
  ceiling?: number;
  floor?: number;
};

export type PriceCheckOutput =
  | { status: 'ok'; results: PriceCheckEntry[]; duplicates: string[] }
  | { status: 'invalid_input'; reason: string };

export type CheckPrice = (input: PriceCheckInput) => Promise<PriceCheckOutput>;

export function createCheckPrice(getRecords: CatalogRecordFetcher): CheckPrice {
  return async ({ objectIDs, ceiling, floor }) => {
    if (!Array.isArray(objectIDs) || objectIDs.length === 0)
      return { status: 'invalid_input', reason: 'objectIDs must be a non-empty array' };
    const duplicates = [...new Set(objectIDs)].filter(
      (id) => objectIDs.indexOf(id) !== objectIDs.lastIndexOf(id),
    );
    const records = await getRecords([...new Set(objectIDs)]);
    const results: PriceCheckEntry[] = [];
    for (const objectID of [...new Set(objectIDs)]) {
      const record = records.get(objectID);
      if (!record) {
        results.push({ objectID, outcome: 'not_found' });
        continue;
      }
      const { price } = record;
      const withinBounds =
        price !== null &&
        (ceiling === undefined || price < ceiling) &&
        (floor === undefined || price > floor);
      results.push({ objectID, outcome: 'ok', price, withinBounds });
    }
    return { status: 'ok', results, duplicates };
  };
}
