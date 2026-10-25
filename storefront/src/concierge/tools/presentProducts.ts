/* Curation tool (2026-10-24, requirement enforcement 2026-10-25): one call
 * after the search decides what displays. The model reads the streamed search
 * result, chooses the pieces, and quotes the shopper's named material or
 * stone; this tool runs the deterministic checks — exists, in stock, priced,
 * photographed, not a same-design twin, and the quoted requirement matched
 * against the piece's actual material fields via the runtime vocabulary — and
 * returns the verified list with names and prices so the model writes its
 * reply from exactly what will show. A piece it dropped can never appear. No
 * grouping, no bounds: the chips-era shelf is one flat list capped at eight. */

import type { CatalogRecordFetcher } from './catalogRecord';
import { designSignature } from './designVariant';
export { designSignature };

export type PresentProductsInput = {
  objectIDs: readonly string[];
  /** The material, stone or gem family the shopper named, quoted from the
   * conversation. The tool matches it against the runtime vocabulary and
   * drops candidates whose material fields contradict it. */
  requirement?: string;
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
  | 'duplicate'
  | 'requirement_mismatch';

export type PresentDrop = { objectID: string; reason: PresentDropReason };

export type PresentProductsOutput = {
  status: 'ok' | 'invalid_input' | 'empty';
  reason?: string;
  /** Verified pieces in the model's order, capped at eight. */
  objectIDs: { objectID: string; name: string; price: number }[];
  dropped: PresentDrop[];
  displayFacets: string[];
  /** The requirement-matched (attribute, value) pairs the tool enforced, so
   * the model and the logs can see what was checked. */
  enforced?: { attribute: string; value: string }[];
};

export type PresentProducts = (input: PresentProductsInput) => Promise<PresentProductsOutput>;

/** The slice of the runtime vocabulary the tool needs: filterable attribute →
 * live value list, derived from the index (never hand-maintained). */
export type VocabularyLike = { values: Record<string, string[]> };

const MAX_TILES = 8;
const MIN_TOKEN_LENGTH = 4;

const invalid = (reason: string): PresentProductsOutput => ({
  status: 'invalid_input',
  reason,
  objectIDs: [],
  dropped: [],
  displayFacets: [],
});

/** Match the shopper's quoted requirement to vocabulary values by exact token:
 * a value counts when one of its own words equals a requirement word ("sterling
 * silver" matches Purity "Sterling"; "rubies" matches gemstone "Ruby"). A
 * light singularization handles shopper plurals ("rubies", "rings"). Exact
 * word matching keeps the rule deterministic; multi-word values only match via
 * their own words. Returns [] when nothing in the vocabulary matches — the
 * caller then enforces nothing, exactly like today. */
function singularize(token: string): string {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) return token.slice(0, -1);
  return token;
}

export function matchRequirement(
  requirement: string,
  vocabulary: VocabularyLike,
): { attribute: string; value: string }[] {
  const tokens = requirement
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH)
    .map(singularize);
  if (!tokens.length) return [];
  const enforced: { attribute: string; value: string }[] = [];
  for (const [attribute, values] of Object.entries(vocabulary.values)) {
    for (const value of values) {
      const words = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (words.some((word) => tokens.includes(word))) {
        enforced.push({ attribute, value });
        break;
      }
    }
  }
  return enforced;
}

function satisfies(recordMaterial: Record<string, string[]>, enforced: { attribute: string; value: string }[]) {
  return enforced.every(({ attribute, value }) =>
    (recordMaterial[attribute] ?? []).some((v) => v.toLowerCase() === value.toLowerCase()),
  );
}

export function createPresentProducts(
  getRecords: CatalogRecordFetcher,
  options?: { vocabulary?: () => Promise<VocabularyLike | null> },
): PresentProducts {
  return async ({ objectIDs, displayFacets, requirement }) => {
    if (!Array.isArray(objectIDs) || objectIDs.length === 0)
      return invalid('objectIDs must be a non-empty array');
    if (objectIDs.length > 24) return invalid(`${objectIDs.length} objectIDs exceeds the maximum of 24`);
    const facets = (displayFacets ?? [])
      .filter((name): name is string => typeof name === 'string' && !!name.trim())
      .filter((name, index, all) => all.indexOf(name) === index)
      .slice(0, 3);

    /* Requirement enforcement needs the live vocabulary; without it the check
     * is skipped and behavior matches the pre-enforcement build. */
    let enforced: { attribute: string; value: string }[] = [];
    if (typeof requirement === 'string' && requirement.trim()) {
      try {
        const vocabulary = (await options?.vocabulary?.()) ?? null;
        if (vocabulary) enforced = matchRequirement(requirement, vocabulary);
      } catch {
        enforced = [];
      }
    }

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
      if (enforced.length && !satisfies(record.materialFields, enforced)) {
        dropped.push({ objectID, reason: 'requirement_mismatch' });
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
      return { status: 'empty', objectIDs: [], dropped, displayFacets: facets, enforced };
    return { status: 'ok', objectIDs: verified, dropped, displayFacets: facets, enforced };
  };
}
