/* Curation tool (2026-10-24): one call after the search decides what displays.
 * The model reads the streamed search result and chooses the pieces; this tool
 * runs the deterministic checks the arrange era owned — exists, in stock,
 * priced, photographed, not a same-design twin — and returns the verified list
 * with names and prices so the model writes its reply from exactly what will
 * show. A piece it dropped can never appear. No grouping, no bounds: the
 * chips-era shelf is one flat list capped at eight. */

import type { CatalogRecordFetcher } from './catalogRecord';

/* Variant dedupe primitives (Arijit decision 2026-10-24; signature from
 * main's 2026-10-23 design-variant fix): the catalog carries the same design
 * as several records, and two of them may never fill two tiles. Same family
 * number = same design; the title signature (metal colors, purities and
 * sizes stripped) catches records without a family number, so yellow- and
 * white-gold twins at different prices collapse. This is the single home for
 * the rule — the model curates, this tool enforces. */
const DESIGN_NOISE_TOKENS = new Set([
  'yellow', 'white', 'rose', 'pink', 'gold', 'goldtone', 'silvertone',
  'rhodium', 'sterling', 'silver', 'silverite', 'platineve', 'over',
  '10k', '14k', '18k', '24k', 'ctw', 'ct', 'mm', 'inch', 'inches', 'approximately',
]);

export function designSignature(name: string): string {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9\s./]+/g, ' ')
    .split(/\s+/)
    .filter(
      (token) =>
        token &&
        !DESIGN_NOISE_TOKENS.has(token) &&
        !/^\d+(?:\.\d+)?(?:\/\d+)?$/.test(token),
    );
  return tokens.join(' ');
}

export type PresentProductsInput = {
  objectIDs: readonly string[];
  /** One to three facet attribute names from the search's facet counts, the
   * narrowing options the app renders as chips, first shown first. */
  displayFacets?: readonly string[];
};

export type PresentDropReason =
  | 'not_found'
  | 'out_of_stock'
  | 'unpriced'
  | 'no_image'
  | 'variant_of_shown'
  | 'duplicate';

export type PresentDrop = { objectID: string; reason: PresentDropReason };

export type PresentProductsOutput = {
  status: 'ok' | 'invalid_input' | 'empty';
  reason?: string;
  /** Verified pieces in the model's order, capped at eight. */
  objectIDs: { objectID: string; name: string; price: number }[];
  dropped: PresentDrop[];
  displayFacets: string[];
};

export type PresentProducts = (input: PresentProductsInput) => Promise<PresentProductsOutput>;

const MAX_TILES = 8;

const invalid = (reason: string): PresentProductsOutput => ({
  status: 'invalid_input',
  reason,
  objectIDs: [],
  dropped: [],
  displayFacets: [],
});

export function createPresentProducts(getRecords: CatalogRecordFetcher): PresentProducts {
  return async ({ objectIDs, displayFacets }) => {
    if (!Array.isArray(objectIDs) || objectIDs.length === 0)
      return invalid('objectIDs must be a non-empty array');
    if (objectIDs.length > 24) return invalid(`${objectIDs.length} objectIDs exceeds the maximum of 24`);
    const facets = (displayFacets ?? [])
      .filter((name): name is string => typeof name === 'string' && !!name.trim())
      .filter((name, index, all) => all.indexOf(name) === index)
      .slice(0, 3);

    const needs = [...new Set(objectIDs)];
    const records = await getRecords(needs);
    const verified: { objectID: string; name: string; price: number }[] = [];
    const dropped: PresentDrop[] = [];
    const seenIds = new Set<string>();
    const seenDesigns = new Set<string>();
    for (const objectID of objectIDs) {
      if (typeof objectID !== 'string' || !objectID) continue;
      if (seenIds.has(objectID)) {
        dropped.push({ objectID, reason: 'duplicate' });
        continue;
      }
      seenIds.add(objectID);
      const record = records.get(objectID);
      if (!record) {
        dropped.push({ objectID, reason: 'not_found' });
        continue;
      }
      if (record.inStock === false) {
        dropped.push({ objectID, reason: 'out_of_stock' });
        continue;
      }
      if (record.price === null) {
        dropped.push({ objectID, reason: 'unpriced' });
        continue;
      }
      if (!record.imageUrl) {
        dropped.push({ objectID, reason: 'no_image' });
        continue;
      }
      const signature = designSignature(record.name);
      if (signature && seenDesigns.has(signature)) {
        dropped.push({ objectID, reason: 'variant_of_shown' });
        continue;
      }
      if (signature) seenDesigns.add(signature);
      verified.push({ objectID, name: record.name, price: record.price });
      if (verified.length >= MAX_TILES) break;
    }
    if (!verified.length)
      return { status: 'empty', objectIDs: [], dropped, displayFacets: facets };
    return { status: 'ok', objectIDs: verified, dropped, displayFacets: facets };
  };
}
