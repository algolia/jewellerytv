/* Lane 1 deterministic tool 4: refresh_products (TOOLS-DESIGN-V1.md).
 *
 * One job: the tile facts per objectID (name, price, stock, image, link) read
 * fresh from the catalogue through the shared record reader. A missing ID is
 * a per-ID not_found, never a partial record and never a throw; the notFound
 * list is the shortfall the model sees. No shopper-facing text. */

import type { CatalogRecordFetcher } from './catalogRecord';

export type ProductRefreshRecord = {
  objectID: string;
  outcome: 'ok';
  name: string;
  price: number | null;
  inStock: boolean;
  imageUrl: string | null;
  link: string;
};

export type ProductRefreshEntry = ProductRefreshRecord | { objectID: string; outcome: 'not_found' };

export type RefreshProductsInput = { objectIDs: readonly string[] };

export type RefreshProductsOutput =
  | { status: 'ok'; records: ProductRefreshEntry[]; notFound: string[]; duplicates: string[] }
  | { status: 'invalid_input'; reason: string };

export type RefreshProducts = (input: RefreshProductsInput) => Promise<RefreshProductsOutput>;

export function createRefreshProducts(getRecords: CatalogRecordFetcher): RefreshProducts {
  return async ({ objectIDs }) => {
    if (!Array.isArray(objectIDs) || objectIDs.length === 0)
      return { status: 'invalid_input', reason: 'objectIDs must be a non-empty array' };
    const duplicates = [...new Set(objectIDs)].filter(
      (id) => objectIDs.indexOf(id) !== objectIDs.lastIndexOf(id),
    );
    const records = await getRecords([...new Set(objectIDs)]);
    const refreshed: ProductRefreshEntry[] = [];
    const notFound: string[] = [];
    for (const objectID of [...new Set(objectIDs)]) {
      const record = records.get(objectID);
      if (!record) {
        notFound.push(objectID);
        refreshed.push({ objectID, outcome: 'not_found' });
        continue;
      }
      refreshed.push({
        objectID,
        outcome: 'ok',
        name: record.name,
        price: record.price,
        inStock: record.inStock,
        imageUrl: record.imageUrl,
        link: record.link,
      });
    }
    return { status: 'ok', records: refreshed, notFound, duplicates };
  };
}
