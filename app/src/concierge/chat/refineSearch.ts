/* The turn a chip refine re-issues.
 *
 * A chip tap refines the shelf in place instead of asking the agent again
 * (Arijit's 2026-11-04 call, restoring the funnel the 2026-11-02 decision
 * dropped): the app re-issues THIS message's own search with the tap's
 * selections ANDed on top. Re-issuing the turn's own query and constraints is
 * what keeps a tap from drifting — the pre-simplify bug class was a refine
 * rebuilt from partial state, which searched the transcript's first turn and
 * dropped the budget (2026-10-26 platinum-over-budget receipt).
 *
 * Which tool shape carries the turn tracks the model, not our configuration
 * (measured 2026-11-02): per-index tools (`algolia_search_index_prod_catalog`)
 * carry constraints as `facet_<Attribute>` keys on the query object, the
 * generic tool (`algolia_search_index` + `{index}`) carries them as
 * `facet_filters` OR-groups. Both are read. */

export type SearchPart = {
  /** `tool-<toolName>` on a rendered message part; the raw event carries
   * `toolName` instead. */
  type?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: { facets?: Record<string, Record<string, number>> };
};

/** One OR-group per constrained attribute, ready for Algolia's nested-array
 * semantics: groups AND together, values inside a group OR together. */
export type TurnRefine = {
  queryText: string;
  turnFilters: string[][];
  /** A multi-query search is a multi-direction turn: its facet counts are
   * per-direction, so a funnel over them mismatches the tiles. Chips do not
   * refine such a turn (the accepted single-scope rule, 2026-10-23). */
  multiScope: boolean;
};

const facetPrefix = 'facet_';

function fromFacetFilters(input: Record<string, unknown>): string[][] {
  const raw = input.facet_filters;
  if (!Array.isArray(raw)) return [];
  const groups: string[][] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (entry) groups.push([entry]);
      continue;
    }
    if (!Array.isArray(entry)) continue;
    const values = entry.filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (values.length) groups.push(values);
  }
  return groups;
}

function fromFacetKeys(query: Record<string, unknown>): string[][] {
  const groups: string[][] = [];
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith(facetPrefix) || !Array.isArray(value)) continue;
    const attribute = key.slice(facetPrefix.length);
    const values = value.filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (attribute && values.length) groups.push(values.map((v) => `${attribute}:${v}`));
  }
  return groups;
}

export function extractTurnRefine(part: SearchPart | undefined): TurnRefine {
  const input = (part?.input ?? {}) as Record<string, unknown>;
  const queries = Array.isArray(input.queries) ? (input.queries as unknown[]) : null;
  const multiScope = queries !== null && queries.length > 1;
  const first = multiScope ? null : queries !== null && queries.length === 1 ? queries[0] : input;

  let queryText = '';
  let turnFilters: string[][] = [];
  if (queries !== null) {
    if (
      first &&
      typeof first === 'object' &&
      typeof (first as { query?: unknown }).query === 'string'
    ) {
      queryText = (first as { query: string }).query;
      turnFilters = fromFacetKeys(first as Record<string, unknown>);
    }
  } else {
    if (typeof input.query === 'string') queryText = input.query;
    turnFilters = fromFacetFilters(input);
  }
  return { queryText, turnFilters, multiScope };
}

export type ChipSelection = { attribute: string; value: string };

/** The refine's search params: the turn's own query and constraints first,
 * the shopper's selections ANDed on top. Pure, so the refine cannot silently
 * diverge from the turn it refines. */
export function buildRefineParams(
  pick: Pick<TurnRefine, 'queryText' | 'turnFilters'>,
  selections: ChipSelection[],
): { query: string; facetFilters: (string | string[])[] } {
  return {
    query: pick.queryText,
    facetFilters: [
      ...pick.turnFilters,
      ...selections.map((selection) => `${selection.attribute}:"${selection.value}"`),
    ],
  };
}
