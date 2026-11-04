import { recordDisplayEvent } from '../../shared/telemetry';
import type { SearchPart } from './refineSearch';

/* The narrowing chips under a shelf.
 *
 * Every catalogue search already returns facet counts — nine attributes, with
 * their values — so the data for this is on the wire and no agent change is
 * needed. What a chip does when clicked is settled on 2026-11-04 (Arijit's
 * order, restoring the funnel): the tap refines the shelf in place, one
 * client search, no agent turn. The chip therefore carries its attribute and
 * value for the refine; it is a filter control, not a question.
 *
 * Which attributes are offerable is derived from the search's own counts, per
 * the 2026-10-23 law: never a hardcoded attribute list (the whitelist built
 * into the simplified rebuild was a repeat of that defect class and is gone).
 * A facet can narrow only if it carries at least two values, and a values
 * list the size of a spec sheet does not read as a choice.
 *
 * Catalogue only. An on-air search returns its own facets (`hosts`,
 * `seriesName`, `showId`, `relativeDay`) which narrow a broadcast rather than
 * a shopper's taste. */

const CATALOGUE_INDEX = 'prod_catalog';
const MAX_ATTRIBUTES = 3;
const MAX_VALUES = 3;
/** A facet with more distinct values than this reads as a spec sheet, not a
 * choice; the accepted derive rule (deployed funnel, 2026-10-26) skips it. */
const MAX_DISTINCT_VALUES = 24;

/** Condition is a scope fact, not a narrowing question (Arijit, 2026-11-04:
 * "pre-owned needs to be discarded and never included. That should be in
 * code"). The display gate enforces the piece-level exclusion; this keeps the
 * condition axis out of the offer entirely. Named here deliberately: it is
 * hygiene on one attribute, not an offerable list, which is what the
 * 2026-10-23 no-whitelist law bans. */
const NON_OFFERABLE = new Set(['Catalog_Condition']);

export type NarrowChip = { attribute: string; value: string; label: string };
/** Chips keep their attribute so the panel can put each axis on its own row.
 * Run together, colour and price read as one undifferentiated list and the
 * shopper cannot tell they are different questions. */
export type NarrowGroup = { attribute: string; chips: NarrowChip[] };

/** Which index a search part ran against. The tool is one-per-index on some
 * models (`algolia_search_index_prod_catalog`) and generic with the index as
 * an input on others (`algolia_search_index` + `{index}`), and which one the
 * agent gets tracks the model rather than the configuration — measured
 * 2026-11-02. Both shapes have to be read or the chips appear on the wrong
 * index the next time the model changes. */
export function indexOf(part: SearchPart | undefined): string | undefined {
  const raw = typeof part?.toolName === 'string' ? part.toolName : (part?.type ?? '');
  const name = raw.startsWith('tool-') ? raw.slice('tool-'.length) : raw;
  const suffix = name.startsWith('algolia_search_index_')
    ? name.slice('algolia_search_index_'.length)
    : undefined;
  const fromInput = part?.input?.index;
  return suffix ?? (typeof fromInput === 'string' ? fromInput : undefined);
}

/** The values the search was already filtered on, in either tool shape, so a
 * chip never offers a refinement the shopper is already inside. */
function alreadyFiltered(part: SearchPart | undefined): Set<string> {
  const applied = new Set<string>();
  const input = part?.input ?? {};
  const filters = input.facet_filters;
  if (Array.isArray(filters)) {
    for (const entry of filters.flat()) {
      if (typeof entry === 'string') applied.add(entry);
    }
  }
  const queries = Array.isArray(input.queries) ? input.queries : [];
  for (const query of [...queries, input]) {
    if (!query || typeof query !== 'object') continue;
    for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
      if (!key.startsWith('facet_') || !Array.isArray(value)) continue;
      for (const one of value) {
        if (typeof one === 'string') applied.add(`${key.slice('facet_'.length)}:${one}`);
      }
    }
  }
  return applied;
}

/** Price bands sort by price, not by popularity: "$25 - $50, Under $25,
 * $50 - $100" is the count order and reads as a shuffle. This is an ordering
 * rule for the price axis, not an offer list — offerable attributes are never
 * enumerated here. */
function bandFloor(value: string): number {
  const digits = value.replace(/,/g, '').match(/\d+/g);
  if (!digits) return Number.MAX_SAFE_INTEGER;
  return /^under/i.test(value) ? -1 : Number(digits[0]);
}

/**
 * Chips for one catalogue search, or none.
 *
 * Axes come from the search's own facet counts: an attribute offers chips
 * when it carries two to MAX_DISTINCT_VALUES values, the most discriminative
 * (fewest values) first with the attribute name breaking ties, capped at
 * MAX_ATTRIBUTES rows of MAX_VALUES chips. Counts are deliberately not shown:
 * they describe the whole result set, and next to twelve tiles "White (1,240)"
 * invites the question of where the other 1,228 are.
 */
export function narrowChipsFor(part: SearchPart | undefined): NarrowGroup[] {
  if (indexOf(part) !== CATALOGUE_INDEX) return [];
  const facets = part?.output?.facets;
  if (!facets) return [];
  const applied = alreadyFiltered(part);

  const axes = Object.entries(facets)
    .filter(([attribute, values]) => {
      if (NON_OFFERABLE.has(attribute)) return false;
      const count = Object.keys(values).length;
      return count >= 2 && count <= MAX_DISTINCT_VALUES;
    })
    .sort(
      ([aName, aValues], [bName, bValues]) =>
        Object.keys(aValues).length - Object.keys(bValues).length || aName.localeCompare(bName),
    )
    .slice(0, MAX_ATTRIBUTES);

  const groups: NarrowGroup[] = [];
  for (const [attribute, counts] of axes) {
    /* Pick by count — the biggest slices of the shelf — then present in the
     * attribute's own natural order. */
    const picked = Object.entries(counts)
      .filter(([value]) => !applied.has(`${attribute}:${value}`))
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_VALUES)
      .map(([value]) => value);
    /* One value is not a choice — it describes the shelf rather than
     * narrowing it. */
    if (picked.length < 2) continue;
    const ordered =
      attribute === 'Pricing_PriceRange'
        ? [...picked].sort((a, b) => bandFloor(a) - bandFloor(b))
        : picked;
    groups.push({ attribute, chips: ordered.map((value) => ({ attribute, value, label: value })) });
  }

  if (groups.length) {
    const offered = groups.flatMap((group) => group.chips.map((chip) => chip.label));
    recordDisplayEvent('stage-ok', `narrow chips offered ${offered.join(', ')}`);
  }
  return groups;
}
