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

import type { CatalogRecord, CatalogRecordFetcher } from './catalogRecord';
import { designSignature } from './designVariant';
export { designSignature };

export type PresentProductsInput = {
  objectIDs: readonly string[];
  /** One to three facet attribute names from the search's facet counts, the
   * narrowing options the app renders as chips, first shown first. */
  displayFacets?: readonly string[];
  /** The model's declaration of what it understood from the shopper's own
   * words this turn (Option B, 2026-10-26): material, gemstone and brand as
   * verbatim catalog values, empty arrays when the shopper named none or
   * declined one. Shadow stage: recorded for the gate, never enforced —
   * the word-matcher stays the enforcement source until the cutover. */
  understood?: UnderstoodConstraints;
};

export type UnderstoodConstraints = {
  material: readonly string[];
  gemstone: readonly string[];
  brand: readonly string[];
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
  objectIDs: { objectID: string; name: string; price: number; image: string; raw?: Record<string, unknown> }[];
  dropped: PresentDrop[];
  displayFacets: string[];
  /** The requirement check the tool enforced, so the model and the logs can
   * see what was verified. */
  enforced?: EnforcedRequirement;
  /** The model's declaration of its understanding, normalized. Absent when
   * the model sent none. Shadow stage: never drives enforcement. */
  declared?: UnderstoodConstraints;
  /** Whether every declared value exists in the live vocabulary — the
   * invented-value check. Undefined when no declaration or no vocabulary. */
  declaredVerbatim?: boolean;
  /** How many tiles came from the backfill pool rather than the model's
   * pick — nonzero only when the model's verified list sat under the floor. */
  backfilled?: number;
  /** The backfill pool's size at execution time. Zero when the streamed
   * search had not reached the app's ref yet — that reading is how the race
   * vs a real empty pool is told apart in the battery ledger. */
  poolSize?: number;
};

export type PresentProducts = (input: PresentProductsInput) => Promise<PresentProductsOutput>;

/** The slice of the runtime vocabulary the tool needs: filterable attribute →
 * live value list, derived from the index (never hand-maintained). */
export type VocabularyLike = { values: Record<string, string[]> };

const MAX_TILES = 9;
const MIN_TOKEN_LENGTH = 4;
/** The shelf floor Arijit set (2026-10-25): a shopping turn never shows fewer
 * than six tiles when the search returned enough candidates to fill it —
 * not 3, not 4. Backfill runs the same verification over the streamed
 * search's remaining hits until the floor or the cap is met. */
const SHELF_FLOOR = 6;

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
 * vocabulary has no match — the caller then enforces nothing.
 *
 * Negated clauses state no requirement (the measured mission-5b148c11
 * failure, 2026-10-26): "no specific stone, but my budget is $200" enforced
 * the gemstone value "Multi-Stone" and dropped every candidate, because the
 * negators "no"/"not" sit below the token length floor and never reached the
 * matcher. The message is split into clauses on punctuation and contrast
 * conjunctions; a clause containing a negation word contributes nothing. The
 * model's own search filters remain the channel for exclusions ("not gold"):
 * this check only enforces what the shopper positively asked for. */
const NEGATORS = new Set([
  'no',
  'not',
  'none',
  'nope',
  'never',
  'nothing',
  'without',
  'dont',
  'cant',
  'wont',
  'isnt',
  'arent',
  'cannot',
  'nor',
]);

function requirementTokens(requirement: string): string[] {
  const normalized = requirement.toLowerCase().replace(/[''`]/g, '');
  const clauses = normalized
    .split(/(?:[,.;!?]|\b(?:but|though|however|except)\b)/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const clause of clauses) {
    const words = clause.split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some((word) => NEGATORS.has(word))) continue;
    kept.push(...words.filter((word) => word.length >= MIN_TOKEN_LENGTH).map(singularize));
  }
  return kept;
}

function singularize(token: string): string {
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 4) return token.slice(0, -1);
  return token;
}

const PLATED_VALUE = /\bover\b|\bplated\b|\bplating\b/i;

export function matchRequirement(
  requirement: string,
  vocabulary: VocabularyLike,
): EnforcedRequirement[] {
  const tokens = requirementTokens(requirement);
  if (!tokens.length) return [];
  const shopperSaidOver = tokens.includes('over');
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
        if (!words.some((word) => tokens.includes(word))) return false;
        /* Plated composites are not the solid metal the shopper named. When
         * the shopper asked for a combination ("gold over silver"), a plated
         * value survives only when both its metals were said, in their
         * roles: the plating metal before "over", the base after it. */
        if (concept === 'material' && PLATED_VALUE.test(value)) {
          if (!shopperSaidOver) return false;
          const [plating, base] = value.split(PLATED_VALUE);
          const saidAll = (part: string) =>
            part
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((word) => word.length >= MIN_TOKEN_LENGTH)
              .some((word) => tokens.includes(word));
          if (!saidAll(plating)) return false;
          if (base && base.trim() && !saidAll(base)) return false;
        }
        return true;
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

/** Normalize the model's declaration: three arrays of trimmed, deduped,
 * capped values. Null for anything that is not a declaration object — the
 * field is advisory, so invalid input degrades to "no declaration", never a
 * failed call. */
function normalizeUnderstood(input: unknown): UnderstoodConstraints | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const list = (value: unknown): readonly string[] => {
    if (!Array.isArray(value)) return [];
    return [...new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string' && !!entry.trim())
        .map((entry) => entry.trim()),
    )].slice(0, 4);
  };
  return {
    material: list(source.material),
    gemstone: list(source.gemstone),
    brand: list(source.brand),
  };
}

/** Every declared value must exist in the live vocabulary for its concept —
 * the model uses verbatim values or the declaration is flagged. Compared
 * case-insensitively: the live model declares "gold" for the catalog value
 * "Gold" (measured first turn of the shadow, 2026-10-26). An empty
 * declaration (the shopper declined) is vacuously verbatim. */
function declaredValuesAreVerbatim(
  declared: UnderstoodConstraints,
  vocabulary: VocabularyLike,
): boolean {
  const concepts: (keyof UnderstoodConstraints)[] = ['material', 'gemstone', 'brand'];
  for (const concept of concepts) {
    const attributes = CONCEPT_ATTRIBUTES[concept] ?? [];
    const known = new Set(
      attributes.flatMap((attribute) => (vocabulary.values[attribute] ?? []).map((v) => v.toLowerCase())),
    );
    for (const value of declared[concept]) {
      if (!known.has(value.toLowerCase())) return false;
    }
  }
  return true;
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
    /** The streamed search's remaining hit objectIDs for this turn, held by
     * the app. When verification leaves the shelf under the floor, the tool
     * backfills from here — the same checks, model never involved. */
    searchPool?: () => readonly string[] | null | undefined;
    /** The app's read-only search proxy. The last resort of the shelf floor:
     * when the streamed pool is exhausted under six tiles, the tool searches
     * again itself, facet-filtered on the enforced requirement, and admits
     * survivors through the identical checks. */
    appSearch?: (facetFilters: readonly string[]) => Promise<readonly string[]>;
  },
): PresentProducts {
  return async ({ objectIDs, displayFacets, understood }) => {
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
     * pre-enforcement build. The record read starts immediately and runs
     * alongside the vocabulary fetch — the platform's client-tool wait
     * budget cancelled slow present_products calls (2026-10-26), so the
     * independent reads never run one after the other. The model's
     * declaration (shadow stage) shares the same single vocabulary read. */
    const needs = [...new Set(objectIDs)];
    const recordsPromise = getRecords(needs);
    const declared = normalizeUnderstood(understood);
    let enforced: EnforcedRequirement | null = null;
    let declaredVerbatim: boolean | undefined;
    const shopperMessage = options?.shopperMessage?.();
    if ((typeof shopperMessage === 'string' && shopperMessage.trim()) || declared) {
      try {
        const vocabulary = (await options?.vocabulary?.()) ?? null;
        if (vocabulary) {
          if (typeof shopperMessage === 'string' && shopperMessage.trim())
            enforced = matchRequirement(shopperMessage, vocabulary)[0] ?? null;
          if (declared) declaredVerbatim = declaredValuesAreVerbatim(declared, vocabulary);
        }
      } catch {
        enforced = null;
      }
    }
    const records = await recordsPromise;
    const verified: { objectID: string; name: string; price: number; image: string; raw?: Record<string, unknown> }[] = [];
    const dropped: PresentDrop[] = [];
    const seenIds = new Set<string>();
    const seenDesigns = new Set<string>();
    /* One admission path for every source — the model's picks, the streamed
     * pool, and the follow-up search all pass the identical checks in the
     * same order: requirement, stock, price, image, same-design twin. */
    const admit = (objectID: string, record: CatalogRecord, attachRaw = false): boolean => {
      if (enforced && !satisfies(record.materialFields, enforced)) {
        dropped.push({ objectID, reason: 'requirement_mismatch' });
        return false;
      }
      if (record.inStock === false) {
        dropped.push({ objectID, reason: 'out_of_stock' });
        return false;
      }
      if (record.price === null) {
        dropped.push({ objectID, reason: 'unpriced' });
        return false;
      }
      if (!record.imageUrl) {
        dropped.push({ objectID, reason: 'no_image' });
        return false;
      }
      const signature = designSignature(record.name);
      if (signature && seenDesigns.has(signature)) {
        dropped.push({ objectID, reason: 'variant_of_shown' });
        return false;
      }
      if (signature) seenDesigns.add(signature);
      /* The raw record rides only on follow-up tiles: they were never part of
       * the streamed search, so the render layer needs their full record to
       * display them beside the streamed ones. */
      verified.push({
        objectID,
        name: record.name,
        price: record.price,
        image: record.imageUrl,
        ...(attachRaw ? { raw: record.raw } : {}),
      });
      return true;
    };
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
      if (admit(objectID, record) && verified.length >= MAX_TILES) break;
    }

    /* Shelf floor, layer one: the streamed pool. */
    let backfilled = 0;
    const pool = options?.searchPool?.() ?? null;
    const poolSize = pool ? pool.length : 0;
    const floorTarget = Math.min(SHELF_FLOOR, MAX_TILES);
    if (verified.length > 0 && verified.length < floorTarget && pool && poolSize > 0) {
      const extra = pool.filter((id) => typeof id === 'string' && !!id && !seenIds.has(id));
      if (extra.length) {
        const extraRecords = await getRecords(extra);
        for (const objectID of extra) {
          if (verified.length >= floorTarget) break;
          const record = extraRecords.get(objectID);
          if (!record) continue;
          seenIds.add(objectID);
          if (admit(objectID, record)) backfilled += 1;
        }
      }
    }
    /* Shelf floor, layer two: the follow-up search. The streamed pool is
     * exhausted and the shelf still sits under the floor — the tool asks the
     * app for the next candidates matching the enforced requirement itself,
     * facet-filtered, and admits survivors identically. The floor never
     * invents tiles, but it never stops at five when the catalog has them. */
    if (verified.length > 0 && verified.length < floorTarget && enforced && options?.appSearch) {
      try {
        const facetFilters = enforced.values.map(
          (value) => `${enforced!.attribute}:"${value.replace(/"/g, '\\"')}"`,
        );
        const extra = (await options.appSearch(facetFilters)).filter(
          (id) => typeof id === 'string' && !!id && !seenIds.has(id),
        );
        if (extra.length) {
          const extraRecords = await getRecords(extra);
          for (const objectID of extra) {
            if (verified.length >= floorTarget) break;
            const record = extraRecords.get(objectID);
            if (!record) continue;
            seenIds.add(objectID);
            if (admit(objectID, record, true)) backfilled += 1;
          }
        }
      } catch {
        /* The floor degrades honestly when the follow-up search fails. */
      }
    }

    if (!verified.length)
      return {
        status: 'empty',
        objectIDs: [],
        dropped,
        displayFacets: facets,
        enforced: enforced ?? undefined,
        declared: declared ?? undefined,
        declaredVerbatim,
      };
    /* The shelf law (Arijit, standing rule, re-confirmed 2026-10-26): a shelf
     * shows complete rows of three — 3, 6 or 9 pieces, never 4, 5, 7 or 8.
     * The model writes its reply from exactly this list, so the trim happens
     * here, before the model speaks. One and two pieces stay: an honest thin
     * result is not a partial row pretending to be a full shelf. */
    const shelf =
      verified.length > 3 ? verified.slice(0, verified.length - (verified.length % 3)) : verified;
    return {
      status: 'ok',
      objectIDs: shelf,
      dropped,
      displayFacets: facets,
      enforced: enforced ?? undefined,
      declared: declared ?? undefined,
      declaredVerbatim,
      backfilled: backfilled || undefined,
      poolSize,
    };
  };
}
