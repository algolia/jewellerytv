/* Lane 1 deterministic tools, shared record reader (TOOLS-DESIGN-V1.md).
 *
 * One read-only lookup turns a raw prod_catalog record into the small view the
 * four deterministic tools consume. Tools 2, 3 and 4 are thin views of this
 * one record, so there is no repeated fetch or repeated parsing. The fetcher
 * is injected: in the app it is the existing read-only exact-product proxy
 * (/api/products/:id, search-only key stays server-side); in tests it is a
 * plain fixture map. No state, no shopper-facing text. */

export type CatalogRecord = {
  objectID: string;
  name: string;
  /** Numeric USD price from Pricing_ActivePrice; null when the record has none. */
  price: number | null;
  inStock: boolean;
  imageUrl: string | null;
  /** Shopper-facing destination path for the tile. */
  link: string;
};

export type CatalogRecordFetcher = (
  objectIDs: readonly string[],
) => Promise<Map<string, CatalogRecord>>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses one raw index record. Returns null for anything unusable; the
 * caller reports that as not_found rather than inventing fields. */
export function toCatalogRecord(raw: unknown): CatalogRecord | null {
  if (!isRecord(raw)) return null;
  const objectID = raw.objectID;
  if (typeof objectID !== 'string' || !objectID) return null;
  const price = typeof raw.Pricing_ActivePrice === 'number' ? raw.Pricing_ActivePrice : null;
  const media = Array.isArray(raw.Media_Images) ? raw.Media_Images : [];
  const imageUrl = typeof media[0] === 'string' && media[0] ? media[0] : null;
  const name =
    typeof raw.Catalog_TitleDescription === 'string' && raw.Catalog_TitleDescription.trim()
      ? raw.Catalog_TitleDescription
      : objectID;
  return {
    objectID,
    name,
    price,
    inStock: raw.Inventory_InStock === true,
    imageUrl,
    link: `/product/${objectID}`,
  };
}

/** Builds the shared fetcher over an injected per-ID read. A fetched record
 * only counts when its own objectID equals the requested ID (the same identity
 * rule the exact-product refresh path applies). */
export function createCatalogRecordFetcher(
  fetchRawRecord: (objectID: string) => Promise<unknown>,
): CatalogRecordFetcher {
  return async (objectIDs) => {
    const records = new Map<string, CatalogRecord>();
    await Promise.all(
      [...new Set(objectIDs)].map(async (objectID) => {
        try {
          const raw = await fetchRawRecord(objectID);
          const record = toCatalogRecord(raw);
          if (record && record.objectID === objectID) records.set(objectID, record);
        } catch {
          // A record that will not load is reported as not_found by the caller.
        }
      }),
    );
    return records;
  };
}
