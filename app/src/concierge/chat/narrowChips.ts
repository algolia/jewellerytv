import { recordDisplayEvent } from '../../shared/telemetry';

/* The narrowing chips under a shelf.
 *
 * Every catalogue search already returns facet counts — nine attributes, with
 * their values — so the data for this is on the wire and no agent change is
 * needed. What a chip does when clicked is a product decision, settled on
 * 2026-11-02: it asks the agent again. That costs a turn, and it is the only
 * option where the reply, the grouping and the pieces still agree afterwards;
 * filtering the twelve tiles on screen would leave the prose above them
 * describing a shelf that is no longer there.
 *
 * Catalogue only. An on-air search returns its own facets (`hosts`,
 * `seriesName`, `showId`, `relativeDay`) which narrow a broadcast rather than
 * a shopper's taste, and "show me only Misty's" is a question they would ask
 * in words. */

const CATALOGUE_INDEX = 'prod_catalog';
const MAX_ATTRIBUTES = 2;
const MAX_VALUES = 3;

/* The attributes worth offering, best first. Deliberately not all nine:
 * `Catalog_ProductType` restates the shelf the shopper is already looking at,
 * and the discount range is a filter rather than a taste. Each entry carries
 * the sentence the chip sends, since "White" alone is not a request. */
/** Price bands sort by price, not by popularity: "$25 - $50, Under $25,
 * $50 - $100" is the count order and reads as a shuffle. */
function bandFloor(value: string): number {
  const digits = value.replace(/,/g, '').match(/\d+/g);
  if (!digits) return Number.MAX_SAFE_INTEGER;
  return /^under/i.test(value) ? -1 : Number(digits[0]);
}

const OFFERABLE: ReadonlyArray<{
  attribute: string;
  ask: (value: string) => string;
  order?: (a: string, b: string) => number;
}> = [
  {
    attribute: 'Catalog_JewelryMaterialNavigationColor',
    ask: (value) => `Show me the ${value.toLowerCase()} ones`,
  },
  {
    attribute: 'Catalog_GemstoneInformation.GemstoneCreationClassification',
    ask: (value) => `Show me the ${value.toLowerCase()} ones`,
  },
  {
    attribute: 'Pricing_PriceRange',
    ask: (value) => `Show me the ones in ${value}`,
    order: (a, b) => bandFloor(a) - bandFloor(b),
  },
  {
    attribute: 'Catalog_JewelryMaterialNavigationName',
    ask: (value) => `Show me the ${value.toLowerCase()} pieces`,
  },
  {
    attribute: 'Catalog_GemstoneAndPearlNavigationName',
    ask: (value) => `Show me the ${value.toLowerCase()} pieces`,
  },
];

export type NarrowChip = { label: string; ask: string };
/** Chips keep their attribute so the panel can put each axis on its own row.
 * Run together, colour and price read as one undifferentiated list and the
 * shopper cannot tell they are different questions. */
export type NarrowGroup = { attribute: string; chips: NarrowChip[] };

type FacetCounts = Record<string, Record<string, number>>;
type SearchPart = {
  /** `tool-<toolName>` on a rendered message part; the raw event carries
   * `toolName` instead, and tests exercise both. */
  type?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: { facets?: FacetCounts };
};

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
 * Counts are deliberately not shown. They describe the whole result set, and
 * next to twelve tiles "White (1,240)" invites the question of where the
 * other 1,228 are.
 */
export function narrowChipsFor(part: SearchPart | undefined): NarrowGroup[] {
  if (indexOf(part) !== CATALOGUE_INDEX) return [];
  const facets = part?.output?.facets;
  if (!facets) return [];
  const applied = alreadyFiltered(part);
  const groups: NarrowGroup[] = [];

  for (const { attribute, ask, order } of OFFERABLE) {
    if (groups.length >= MAX_ATTRIBUTES) break;
    const counts = facets[attribute];
    if (!counts) continue;
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
    const ordered = order ? [...picked].sort(order) : picked;
    groups.push({ attribute, chips: ordered.map((value) => ({ label: value, ask: ask(value) })) });
  }

  if (groups.length) {
    const offered = groups.flatMap((group) => group.chips.map((chip) => chip.label));
    recordDisplayEvent('stage-ok', `narrow chips offered ${offered.join(', ')}`);
  }
  return groups;
}
