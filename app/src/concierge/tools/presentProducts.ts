/* Curation tool (2026-10-24, requirement enforcement 2026-10-25, structural
 * source change 2026-10-25, brand enforcement 2026-10-25): one call after the
 * search decides what displays. The model reads the streamed search result and
 * chooses the pieces; this tool runs the deterministic checks — exists, in
 * stock, priced, photographed, not a same-design twin, and the requirement
 * (material, gemstone or brand) enforced against the piece's actual record
 * fields via the runtime vocabulary — and returns the verified list with names
 * and prices so the model writes its reply from exactly what will show. A
 * piece it dropped can never appear.
 *
 * The requirement's SOURCE is the shopper's own message text, supplied by the
 * app through the send path — never a model-quoted field. The model quoted
 * `requirement` on only 8% of material turns (battery 2026-10-25), so
 * prompt-based enforcement fails structurally on this model version; reading
 * the shopper's words removes the model from the loop entirely. No grouping,
 * no bounds: the chips-era shelf is one flat list capped at nine. */

import type { CatalogRecordFetcher } from './catalogRecord';
import { designSignature } from './designVariant';
export { designSignature };

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
  /** The requirement check the tool enforced, so the model and the logs can
   * see what was verified. */
  enforced?: EnforcedRequirement;
};

export type PresentProducts = (input: PresentProductsInput) => Promise<PresentProductsOutput>;

/** The slice of the runtime vocabulary the tool needs: filterable attribute →
 * live value list, derived from the index (never hand-maintained). */
export type VocabularyLike = { values: Record<string, string[]> };

const MAX_TILES = 9;
const MIN_TOKEN_LENGTH = 4;

const invalid = (reason: string): PresentProductsOutput => ({
  status: 'invalid_input',
  reason,
  objectIDs: [],
  dropped: [],
  displayFacets: [],
});

/* The app's naming map: which attributes carry material facts, which carry
 * gemstone facts and which carries the brand (our language layer — the VALUES
 * always come from the live vocabulary). The requirement's words decide the
 * concept; within it, the most discriminative attribute (fewest vocabulary
 * values sharing a requirement word) is enforced, with OR over its matched
 * values. Brand is deliberately the hardest concept to trigger and the last
 * tie-break: its values are multi-word marketing names, so a stray shared word
 * ("gold") must never turn into a brand claim (the Southwest Style / Gems en
 * Vogue failure class, measured live 2026-10-25). */
const CONCEPT_ATTRIBUTES: Record<string, readonly string[]> = {
  material: [
    'Catalog_JewelryMaterialNavigationName',
    'Catalog_JewelryMaterialNavigationPurity',
  ],
  gemstone: [
    'Catalog_GemstoneAndPearlNavigationName',
    'Catalog_GemstoneInformationPrimary.GemstoneName',
  ],
  brand: ['Catalog_BrandNavigationName'],
};

/* Non-brand concepts win equal-total ties; brand only enforces when it is the
 * concept the shopper actually named. */
const CONCEPT_PRIORITY: Record<string, number> = { material: 0, gemstone: 1, brand: 2 };

export type EnforcedRequirement = { attribute: string; values: string[] };

/** Match the shopper's own message to vocabulary values by exact word
 * (light singularization for shopper plurals: "rubies" → "ruby"). Within the
 * winning concept — the one whose attributes matched anything, fewest total
 * matched values first — the attribute with the fewest matched values is the
 * most discriminative check; OR over its matched values. Returns [] when the
 * vocabulary has no match — the caller then enforces nothing. */
function singularize(token: string): string {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) return token.slice(0, -1);
  return token;
}

export function matchRequirement(
  requirement: string,
  vocabulary: VocabularyLike,
): EnforcedRequirement[] {
  const tokens = requirement
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH)
    .map(singularize);
  if (!tokens.length) return [];
  const candidates: { concept: string; matches: EnforcedRequirement[]; total: number }[] = [];
  for (const [concept, attributes] of Object.entries(CONCEPT_ATTRIBUTES)) {
    const matches: EnforcedRequirement[] = [];
    let total = 0;
    for (const attribute of attributes) {
      const values = (vocabulary.values[attribute] ?? []).filter((value) => {
        const words = value
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean);
        /* A brand value only fires when the shopper named enough of it: at
         * least two significant words (or the whole single-word brand). This
         * keeps "gold" from matching a brand that merely contains the word,
         * while "southwest style" and "gems en vogue" match their lines. */
        if (concept === 'brand') {
          const significant = words.filter((word) => word.length >= MIN_TOKEN_LENGTH);
          if (!significant.length) return false;
          const matched = significant.filter((word) => tokens.includes(word)).length;
          const threshold =
            significant.length === 1 ? 1 : Math.max(2, Math.ceil(significant.length / 2));
          return matched >= threshold;
        }
        return words.some((word) => tokens.includes(word));
      });
      if (values.length) {
        matches.push({ attribute, values });
        total += values.length;
      }
    }
    if (matches.length) candidates.push({ concept, matches, total });
  }
  if (!candidates.length) return [];
  candidates.sort(
    (a, b) =>
      a.total - b.total ||
      (CONCEPT_PRIORITY[a.concept] ?? 9) - (CONCEPT_PRIORITY[b.concept] ?? 9) ||
      a.concept.localeCompare(b.concept),
  );
  const winner = candidates[0].matches.sort(
    (a, b) => a.values.length - b.values.length || a.attribute.localeCompare(b.attribute),
  )[0];
  return [winner];
}

function satisfies(recordMaterial: Record<string, string[]>, enforced: EnforcedRequirement) {
  return (recordMaterial[enforced.attribute] ?? []).some((value) =>
    enforced.values.includes(value),
  );
}

export function createPresentProducts(
  getRecords: CatalogRecordFetcher,
  options?: {
    vocabulary?: () => Promise<VocabularyLike | null>;
    /** The shopper's own message text for this turn, held by the app's send
     * path. The tool extracts the named material/stone words itself — the
     * model is never the source of the requirement. */
    shopperMessage?: () => string | null | undefined;
  },
): PresentProducts {
  return async ({ objectIDs, displayFacets }) => {
    if (!Array.isArray(objectIDs) || objectIDs.length === 0)
      return invalid('objectIDs must be a non-empty array');
    if (objectIDs.length > 24) return invalid(`${objectIDs.length} objectIDs exceeds the maximum of 24`);
    const facets = (displayFacets ?? [])
      .filter((name): name is string => typeof name === 'string' && !!name.trim())
      .filter((name, index, all) => all.indexOf(name) === index)
      .slice(0, 3);

    /* Requirement enforcement reads the shopper's own message, not a
     * model-quoted field. Without the live vocabulary, the supplier, or any
     * matching words, the check is skipped and behavior matches the
     * pre-enforcement build. */
    let enforced: EnforcedRequirement | null = null;
    const shopperMessage = options?.shopperMessage?.();
    if (typeof shopperMessage === 'string' && shopperMessage.trim()) {
      try {
        const vocabulary = (await options?.vocabulary?.()) ?? null;
        if (vocabulary) enforced = matchRequirement(shopperMessage, vocabulary)[0] ?? null;
      } catch {
        enforced = null;
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
      if (enforced && !satisfies(record.materialFields, enforced)) {
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
      return { status: 'empty', objectIDs: [], dropped, displayFacets: facets, enforced: enforced ?? undefined };
    return { status: 'ok', objectIDs: verified, dropped, displayFacets: facets, enforced: enforced ?? undefined };
  };
}
