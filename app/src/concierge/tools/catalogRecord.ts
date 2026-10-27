/* Lane 1 deterministic tools, shared record reader (TOOLS-DESIGN-V1.md).
 *
 * One read-only lookup turns a raw prod_catalog record into the small view the
 * deterministic tools consume. Each tool is a thin view of this one record, so
 * there is no repeated fetch or repeated parsing. The fetcher
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
  /** Material, gemstone and brand facts per attribute, for requirement
   * enforcement (the present_products tool checks the shopper's named
   * material, stone or brand against what the piece actually is). Only
   * attributes that carry values appear; this is the app's language layer
   * naming which raw fields count as product facts, not a facet whitelist. */
  materialFields: Record<string, string[]>;
  /** Whether the record carries any pearl information — the generic-pearl
   * check. Pearl types live in their own fields, not in the gemstone name
   * values, so "pearl" can never be verified against a navigation value
   * (the Craig Task 01 conclusion; the 2026-10-27 matcher misfires re-proved
   * it by emptying every pearl shelf). */
  hasPearls: boolean;
  /** The original index record, kept so a tile fetched outside the streamed
   * search (the shelf floor's follow-up search) can still render everywhere
   * the streamed records render. */
  raw: Record<string, unknown>;
};

/** Which raw fields count as material, gemstone and brand facts. Our naming
 * map, not the index's: the values themselves always come from the live record. */
const MATERIAL_FIELD_PATHS = [
  'Catalog_JewelryMaterialNavigationName',
  'Catalog_JewelryMaterialNavigationPurity',
  'Catalog_GemstoneAndPearlNavigationName',
  'Catalog_GemstoneInformationPrimary.GemstoneName',
  'Catalog_BrandNavigationName',
] as const;

function readStringField(raw: Record<string, unknown>, path: string): string[] {
  const [head, ...tail] = path.split('.');
  const value = raw[head];
  /* Material fields arrive as scalar OR array at every level; flatten the way
   * the catalogue adapter does so top-level arrays read correctly. */
  const parts = tail.length
    ? (Array.isArray(value) ? value : [value]).flatMap((part) => {
        if (!part || typeof part !== 'object') return [part];
        const nested = (part as Record<string, unknown>)[tail.join('.')];
        return Array.isArray(nested) ? nested : [nested];
      })
    : Array.isArray(value)
      ? value
      : [value];
  return parts.filter((v): v is string => typeof v === 'string' && !!v.trim());
}

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
  const materialFields: Record<string, string[]> = {};
  for (const path of MATERIAL_FIELD_PATHS) {
    const values = readStringField(raw, path);
    if (values.length) materialFields[path] = values;
  }
  const hasPearls =
    (Array.isArray(raw.Catalog_PearlInformationPrimary) && raw.Catalog_PearlInformationPrimary.length > 0) ||
    (Array.isArray(raw.Catalog_PearlInformation) && raw.Catalog_PearlInformation.length > 0);
  return {
    objectID,
    name,
    price,
    inStock: raw.Inventory_InStock === true,
    imageUrl,
    link: `/product/${objectID}`,
    materialFields,
    hasPearls,
    raw,
  };
}

/** Builds the shared fetcher over an injected per-ID read. A fetched record
 * only counts when its own objectID equals the requested ID (the same identity
 * rule the exact-product refresh path applies).
 *
 * With a batch reader (the /api/products/batch multi-get), one request covers
 * every id — per-ID requests lose the platform's client-tool wait budget (the
 * cancelled present_products events, 2026-10-26). A failed chunk falls back to
 * the per-ID reader, so a batch-endpoint outage degrades to today's behavior
 * instead of an empty shelf. */
export function createCatalogRecordFetcher(
  fetchRawRecord: (objectID: string) => Promise<unknown>,
  options?: {
    batchFetchRawRecords?: (objectIDs: readonly string[]) => Promise<unknown[]>;
    batchSize?: number;
  },
): CatalogRecordFetcher {
  const batchSize = options?.batchSize ?? 50;
  const collect = (objectID: string, raw: unknown, records: Map<string, CatalogRecord>) => {
    const record = toCatalogRecord(raw);
    if (record && record.objectID === objectID) records.set(objectID, record);
  };
  return async (objectIDs) => {
    const ids = [...new Set(objectIDs)];
    const records = new Map<string, CatalogRecord>();
    if (!options?.batchFetchRawRecords) {
      await Promise.all(
        ids.map(async (objectID) => {
          try {
            collect(objectID, await fetchRawRecord(objectID), records);
          } catch {
            // A record that will not load is reported as not_found by the caller.
          }
        }),
      );
      return records;
    }
    for (let start = 0; start < ids.length; start += batchSize) {
      const chunk = ids.slice(start, start + batchSize);
      try {
        const raws = await options.batchFetchRawRecords(chunk);
        chunk.forEach((objectID, index) => {
          collect(objectID, raws[index], records);
        });
      } catch {
        await Promise.all(
          chunk.map(async (objectID) => {
            try {
              collect(objectID, await fetchRawRecord(objectID), records);
            } catch {
              // A record that will not load is reported as not_found by the caller.
            }
          }),
        );
      }
    }
    return records;
  };
}
