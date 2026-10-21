/* Lane 1 deterministic tool 3: check_stock (TOOLS-DESIGN-V1.md).
 *
 * One job: the in-stock flag per objectID, in input order. Price is not this
 * tool's job. Structured invalid_input on empty input, never a throw; no
 * shopper-facing text. */

import type { CatalogRecordFetcher } from './catalogRecord';

export type StockCheckEntry =
  | { objectID: string; outcome: 'ok'; inStock: boolean }
  | { objectID: string; outcome: 'not_found' };

export type CheckStockInput = { objectIDs: readonly string[] };

export type CheckStockOutput =
  | { status: 'ok'; results: StockCheckEntry[]; duplicates: string[] }
  | { status: 'invalid_input'; reason: string };

export type CheckStock = (input: CheckStockInput) => Promise<CheckStockOutput>;

export function createCheckStock(getRecords: CatalogRecordFetcher): CheckStock {
  return async ({ objectIDs }) => {
    if (!Array.isArray(objectIDs) || objectIDs.length === 0)
      return { status: 'invalid_input', reason: 'objectIDs must be a non-empty array' };
    const duplicates = [...new Set(objectIDs)].filter(
      (id) => objectIDs.indexOf(id) !== objectIDs.lastIndexOf(id),
    );
    const records = await getRecords([...new Set(objectIDs)]);
    const results: StockCheckEntry[] = [];
    for (const objectID of [...new Set(objectIDs)]) {
      const record = records.get(objectID);
      results.push(
        record
          ? { objectID, outcome: 'ok', inStock: record.inStock }
          : { objectID, outcome: 'not_found' },
      );
    }
    return { status: 'ok', results, duplicates };
  };
}
