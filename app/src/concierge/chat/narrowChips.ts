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
 * 2026-10-23 no-whitelist law bans.
 *
 * Audience joins it by the same ruling, same day: the model already filters
 * on TargetConsumer when the shopper names a recipient ("a gift for a
 * husband"), so offering Women/Girls/Men as a narrowing question is noise —
 * measured live on three consecutive turns. Hardware axes (ear backs, chain
 * links) are excluded by the prompt's own curation rule ("skip hardware
 * attributes such as ear backs and chain links"); the chips were never told. */
const NON_OFFERABLE = new Set([
  'Catalog_TargetConsumer',
  'Catalog_BackingType',
  'Catalog_ChainLinkType',
]);

/** An axis needs three values to read as a choice: two leaves a row half
 * empty and reads as a broken pair (Arijit, 2026-11-04, on the ragged
 * three-row stack with dead space to the right). */
const MIN_VALUES = 3;

/** Band-style attributes present in their own natural order, not count
 * order: "$25 - $50, Under $25, $50 - $100" reads as a shuffle, and so did
 * "50% - 60% off, 60% - 70% off, 10% - 20% off" (measured, 2026-11-04). */
const ORDERED: Record<string, (a: string, b: string) => number> = {
  Pricing_PriceRange: (a, b) => bandFloor(a) - bandFloor(b),
  Pricing_DiscountPercentRange: (a, b) => bandFloor(a) - bandFloor(b),
};

/** Price bands sort by price, not by popularity; discount bands by discount.
 * This is an ordering rule for band attributes, not an offer list —
 * offerable attributes are never enumerated here. */
function bandFloor(value: string): number {
  const digits = value.replace(/,/g, '').match(/\d+/g);
  if (!digits) return Number.MAX_SAFE_INTEGER;
  return /^under/i.test(value) ? -1 : Number(digits[0]);
}

export type NarrowChip = { attribute: string; value: string; label: string };
/** Chips keep their attribute so the panel can put each axis on its own row.
 * Run together, colour and price read as one undifferentiated list and the
 * shopper cannot tell they are different questions. */
export type NarrowGroup = { attribute: string; chips: NarrowChip[]; label: string };

/* The index models one physical facet several times over. Measured live
 * 2026-11-04 (wedding ring sets, White refine): the colour axis exists as
 * `Catalog_JewelryMaterialNavigationColor` AND
 * `Catalog_MaterialInformation.MaterialColor`; purity exists three times
 * (navigation, material, plating); gemstone creation twice. Excluding the
 * applied value on the tapped attribute alone left the sibling re-offering
 * the same chip ("White" again after White was applied), and the funnel
 * showed the same question as two rows ("14K" twice). The fix is derived,
 * not enumerated: two attributes whose value sets overlap — either a subset
 * of the other, or Jaccard >= 0.5 — are one axis, grouped by union-find.
 * The 2026-10-23 no-whitelist law is untouched: nothing here decides which
 * attributes MAY be offered, only which returned attributes are the same
 * question. */
const DUPLICATE_OVERLAP = 0.5;

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function sameAxis(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = new Set(Object.keys(a));
  const bKeys = new Set(Object.keys(b));
  if (aKeys.size === 0 || bKeys.size === 0) return false;
  /* A subset is the same question seen through a narrower record set. */
  let shared = 0;
  for (const value of aKeys) if (bKeys.has(value)) shared += 1;
  if (shared === aKeys.size || shared === bKeys.size) return true;
  return jaccard(aKeys, bKeys) >= DUPLICATE_OVERLAP;
}

/* One representative per axis class: the richest value set describes the
 * question best, then the most populated, then the name for determinism. */
function representative(members: string[], byValues: Map<string, Record<string, number>>): string {
  return [...members].sort((a, b) => {
    const aFacet = byValues.get(a) ?? {};
    const bFacet = byValues.get(b) ?? {};
    return (
      Object.keys(bFacet).length - Object.keys(aFacet).length ||
      Object.values(bFacet).reduce((x, y) => x + y, 0) -
        Object.values(aFacet).reduce((x, y) => x + y, 0) ||
      a.localeCompare(b)
    );
  })[0];
}

/* The row heading, derived mechanically from the attribute name — no domain
 * dictionary: strip the record-family prefix (Catalog_, Pricing_, Inventory_
 * are namespaces, not meaning), the dotted path and the platform navigation
 * noise, split camel case, and collapse the word the dotted path repeats
 * ("Gemstone.GemstoneCreation" reads as one word twice). */
function axisLabel(attribute: string): string {
  /* Collapse repeated words anywhere in the label: the dotted path can put
   * the family name at both ends ("Gemstone…Primary.GemstoneCTW"), and
   * adjacency is not the only way it repeats. */
  const seen = new Set<string>();
  const words = attribute
    .replace(/^[A-Za-z]+_/, '')
    .replace(/[._]/g, ' ')
    .replace(/Navigation|Information/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!words.length) return attribute;
  /* Sentence case, except an acronym stays whole ("CTW"); the first word
   * keeps whatever case the attribute gave it. */
  return words
    .map((word, index) => {
      if (index === 0) return word;
      if (/^[A-Z]+$/.test(word)) return word;
      return word.toLowerCase();
    })
    .join(' ');
}

/* Value labels for the raw purity stamps a shopper cannot read. Both are
 * cross-checked against the same refine response they appeared in
 * (2026-11-04): the four `950` records are exactly the four Platinum Over
 * records, and the twenty-eight `Sterling` records are the twenty-eight
 * Silver ones. Display only — the refine still sends the index value. */
const VALUE_LABELS: Record<string, string> = {
  '950': 'Platinum 950',
  Sterling: 'Sterling silver',
};

function valueLabel(value: string): string {
  return VALUE_LABELS[value] ?? value;
}

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

/**
 * Chips for one catalogue search, or none.
 *
 * Axes come from the search's own facet counts: an attribute offers chips
 * when it carries two to MAX_DISTINCT_VALUES values, the most discriminative
 * (fewest values) first with the attribute name breaking ties, capped at
 * MAX_ATTRIBUTES rows of MAX_VALUES chips. Counts are deliberately not shown:
 * they describe the whole result set, and next to twelve tiles "White (1,240)"
 * invites the question of where the other 1,228 are.
 *
 * Sibling attributes that model the same physical facet are merged into one
 * axis first (see `sameAxis`), and an applied filter excludes its value
 * across the whole class, not just the tapped attribute — the White chip was
 * re-offered by `MaterialColor` after `JewelryMaterialNavigationColor:White`
 * was applied (measured 2026-11-04).
 */
export function narrowChipsFor(part: SearchPart | undefined): NarrowGroup[] {
  if (indexOf(part) !== CATALOGUE_INDEX) return [];
  const facets = part?.output?.facets;
  if (!facets) return [];
  const applied = alreadyFiltered(part);

  const offerable = Object.entries(facets).filter(([attribute, values]) => {
    if (NON_OFFERABLE.has(attribute)) return false;
    const count = Object.keys(values).length;
    return count >= MIN_VALUES && count <= MAX_DISTINCT_VALUES;
  });

  /* Union-find over the offerable attributes: same value question, one axis. */
  const parent = new Map<string, string>();
  const find = (attribute: string): string => {
    let root = attribute;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    return root;
  };
  for (const [attribute] of offerable) parent.set(attribute, attribute);
  const byAttribute = new Map(offerable);
  for (let i = 0; i < offerable.length; i += 1) {
    for (let j = i + 1; j < offerable.length; j += 1) {
      const [a] = offerable[i];
      const [b] = offerable[j];
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB && sameAxis(byAttribute.get(a)!, byAttribute.get(b)!)) {
        parent.set(rootB, rootA);
      }
    }
  }
  const classes = new Map<string, string[]>();
  for (const [attribute] of offerable) {
    const root = find(attribute);
    classes.set(root, [...(classes.get(root) ?? []), attribute]);
  }

  const axes = [...classes.values()]
    .map((members) => representative(members, byAttribute))
    .sort(
      (aName, bName) =>
        Object.keys(byAttribute.get(aName)!).length -
          Object.keys(byAttribute.get(bName)!).length ||
        aName.localeCompare(bName),
    )
    .slice(0, MAX_ATTRIBUTES);

  const groups: NarrowGroup[] = [];
  for (const attribute of axes) {
    const counts = byAttribute.get(attribute)!;
    /* The applied values of every sibling in this class exclude a chip too:
     * the shopper is already inside that choice, whichever key carried it. */
    const classApplied = new Set<string>();
    for (const member of classes.get(find(attribute)) ?? []) {
      for (const pair of applied) {
        /* Split on the FIRST colon only: a facet value may carry its own. */
        const colon = pair.indexOf(':');
        if (colon < 0) continue;
        const appliedAttribute = pair.slice(0, colon);
        const appliedValue = pair.slice(colon + 1);
        if (appliedAttribute === member && appliedValue) classApplied.add(appliedValue);
      }
    }
    /* Pick by count — the biggest slices of the shelf — then present in the
     * attribute's own natural order. */
    const picked = Object.entries(counts)
      .filter(([value]) => !classApplied.has(value))
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_VALUES)
      .map(([value]) => value);
    /* Fewer values than the floor after the applied-filter exclusion means
     * the axis stopped being a choice; drop the row rather than strand it. */
    if (picked.length < MIN_VALUES) continue;
    const ordered = ORDERED[attribute]
        ? [...picked].sort(ORDERED[attribute])
        : picked;
    groups.push({
      attribute,
      label: axisLabel(attribute),
      chips: ordered.map((value) => ({ attribute, value, label: valueLabel(value) })),
    });
  }

  if (groups.length) {
    const offered = groups.flatMap((group) => group.chips.map((chip) => chip.label));
    recordDisplayEvent('stage-ok', `narrow chips offered ${offered.join(', ')}`);
  }
  return groups;
}
