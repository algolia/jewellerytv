/* Chips-native extraction layer (2026-10-24, curation restored): the agent
 * searches with its own server tool, reads the streamed result, and calls
 * `present_products` with the pieces it chose; the app renders exactly what
 * that call verified — cross-checked against the streamed search hits, so a
 * piece the search never returned can never render — and strips the NOTE
 * line from what the shopper sees. It holds no conversation logic. */

const PRESENT_TOOL = 'tool-present_products';

/** Single switch for echoing the NOTE back into conversation state. F1 ships
 * the strip (the shopper never sees the line) but NOT the echo: Arijit is
 * still deciding whether the NOTE stays. Flip this one constant to true when
 * the echo is approved; until then nothing reads NOTE content. */
export const NOTE_ECHO_ENABLED = false;

type Part = {
  type?: unknown;
  state?: unknown;
  input?: unknown;
  output?: unknown;
};

type Message = { id?: string; role?: string; parts?: readonly unknown[] };

export type NativeGroup = { title: string; why?: string; objectIDs: string[] };

const SEARCH_TOOL_PREFIX = 'tool-algolia_search_index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Mobile anchored cards: per assistant message, the pieces the model curated
 * via `present_products` — up to four — become the anchored tiles the
 * conversation renders under the answer that found them. A multi-query
 * message anchors nothing, matching the tiles-path suppression. Search
 * records are NOT collected here; the hydration layer collects them across
 * the transcript. */
const MAX_ANCHOR_TILES = 9;

function readPresentInput(input: unknown): { displayFacets: string[] } | null {
  if (!isRecord(input)) return null;
  const raw = input.displayFacets;
  if (!Array.isArray(raw)) return { displayFacets: [] };
  const names = raw.filter((n): n is string => typeof n === 'string' && !!n.trim());
  return { displayFacets: [...new Set(names)].slice(0, 3) };
}

function readPresentOutput(output: unknown): string[] | null {
  if (!isRecord(output) || output.status !== 'ok' || !Array.isArray(output.objectIDs)) return null;
  const ids: string[] = [];
  for (const item of output.objectIDs) {
    if (!isRecord(item) || typeof item.objectID !== 'string' || !item.objectID) continue;
    if (!ids.includes(item.objectID)) ids.push(item.objectID);
  }
  return ids;
}

export function extractMessageAnchors(
  messages: readonly Message[],
): { messageId: string; groups: NativeGroup[] }[] {
  const anchors: { messageId: string; groups: NativeGroup[] }[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.parts || !message.id) continue;
    let queryText = '';
    let objectIDs: string[] | null = null;
    let multiScope = false;
    for (const part of message.parts as Part[]) {
      if (typeof part.type !== 'string') continue;
      if (part.type === PRESENT_TOOL) {
        const present = readPresentOutput(part.output);
        if (present?.length) objectIDs = present;
        continue;
      }
      if (!part.type.startsWith(SEARCH_TOOL_PREFIX)) continue;
      const input = isRecord(part.input) ? (part.input as Record<string, unknown>) : null;
      const queries = normalizeSearchQueries(input);
      if (!queries) continue;
      if (queries.length !== 1) multiScope = true;
      const first = queries[0];
      if (!queryText && isRecord(first) && typeof first.query === 'string')
        queryText = first.query;
    }
    if (queryText && objectIDs?.length && !multiScope)
      anchors.push({
        messageId: message.id,
        groups: [{ title: queryText, objectIDs: objectIDs.slice(0, MAX_ANCHOR_TILES) }],
      });
  }
  return anchors;
}

/** Facet chips: the model picks the narrowing facets in the `present_products`
 * call (its judgment over the search's own facet counts — the mechanism the
 * grouped era used); the app renders them in the model's order. */
export type FacetPick = {
  displayFacets: string[];
  facets: Record<string, Record<string, number>>;
  queryText: string;
  /** The turn's own constraints, read from the search input's `facet_<Attribute>`
   * keys (the model's only narrowing mechanism — the budget rides
   * `facet_Pricing_PriceRange` band values). One OR-group per attribute, ready
   * to re-apply in a chip refine so a tap never drops the turn's context. */
  turnFilters: string[][];
};

/** Per-message variant for anchored chip rendering: each assistant message
 * that carries a facet pick gets one entry, with the facet counts and
 * search hits accumulated up to and including that message. */
export type MessageFacetPick = {
  messageId: string;
  pick: FacetPick;
  hits: Record<string, unknown>[];
  /** The present_products output's verified items for this message, in the
   * tool's order, when the tool has completed. The preview renders THESE —
   * never raw hits: raw hits bypass the requirement, twin and stock checks
   * the tool ran (measured live 2026-10-26: an aquamarine rendered in an
   * emerald ask because the preview read the unverified stream). Items
   * admitted by the floor's follow-up search carry their raw record, since
   * they were never part of the streamed hits. */
  verified: PresentItem[] | null;
};

/** One verified piece from the present_products output. */
export type PresentItem = {
  objectID: string;
  name?: string;
  price?: number;
  image?: string;
  raw?: Record<string, unknown>;
};

function readPresentItems(output: unknown): PresentItem[] | null {
  if (!isRecord(output) || output.status !== 'ok' || !Array.isArray(output.objectIDs)) return null;
  const items: PresentItem[] = [];
  for (const item of output.objectIDs) {
    if (!isRecord(item) || typeof item.objectID !== 'string' || !item.objectID) continue;
    if (items.some((existing) => existing.objectID === item.objectID)) continue;
    items.push({
      objectID: item.objectID,
      ...(typeof item.name === 'string' ? { name: item.name } : {}),
      ...(typeof item.price === 'number' ? { price: item.price } : {}),
      ...(typeof item.image === 'string' ? { image: item.image } : {}),
      ...(isRecord(item.raw) ? { raw: item.raw } : {}),
    });
  }
  return items;
}

/** Raw index records carried by present_products outputs — the shelf floor's
 * follow-up tiles, which were never part of any streamed search. Merge these
 * into a streamed records map so hydration sees one complete record set. */
export function collectPresentRaws(messages: readonly Message[]): Map<string, Record<string, unknown>> {
  const raws = new Map<string, Record<string, unknown>>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.parts) continue;
    for (const part of message.parts as Part[]) {
      if (part.type !== PRESENT_TOOL) continue;
      const items = readPresentItems(part.output);
      for (const item of items ?? []) {
        if (item.raw && !raws.has(item.objectID)) raws.set(item.objectID, item.raw);
      }
    }
  }
  return raws;
}

function readSearchPartFacets(
  output: Record<string, unknown>,
): Record<string, Record<string, number>> {
  const found: Record<string, Record<string, number>> = {};
  if (!isRecord(output.facets)) return found;
  for (const [attr, values] of Object.entries(output.facets as Record<string, unknown>)) {
    if (!isRecord(values)) continue;
    const counts: Record<string, number> = {};
    for (const [value, count] of Object.entries(values))
      if (typeof count === 'number') counts[value] = count;
    if (Object.keys(counts).length) found[attr] = counts;
  }
  return found;
}

/** Navigable-attribute picker, index-derived (never an attribute-name list —
 * static lists are a repeated defect class). A facet can narrow only if it
 * carries at least two values, and a values list the size of a spec sheet
 * does not read as a choice. Most discriminative (fewest values) first, then
 * attribute name for stability, capped at three like the model pick. */
const MAX_DERIVED_PILL_VALUES = 24;
export function deriveDisplayFacets(
  facets: Record<string, Record<string, number>>,
): string[] {
  return Object.entries(facets)
    .filter(([, values]) => {
      const count = Object.keys(values).length;
      return count >= 2 && count <= MAX_DERIVED_PILL_VALUES;
    })
    .sort(
      (a, b) =>
        Object.keys(a[1]).length - Object.keys(b[1]).length || a[0].localeCompare(b[0]),
    )
    .slice(0, 3)
    .map(([attribute]) => attribute);
}

/** The search tool's input reaches the wire in TWO shapes: the multi-query
 * array ({queries: [{query, facet_<Attribute>: [...]}]}) and the flat
 * single-query form ({query, index, facet_filters: [[attr:value, ...]],
 * number_of_results}) — the model picks per turn. Measured 2026-10-30:
 * flat-shape turns silently lost facets, cards and the canvas because every
 * reader keyed on input.queries only. Normalizes the flat shape into the
 * array form; facet_filters OR-groups map to facet_<Attribute> arrays (first
 * group per attribute wins — Algolia ANDs across groups). */
function normalizeSearchQueries(input: unknown): unknown[] | null {
  if (!isRecord(input)) return null;
  if (Array.isArray(input.queries)) return input.queries as unknown[];
  if (typeof input.query !== 'string' || !input.query) return null;
  const flat: Record<string, unknown> = { query: input.query };
  const facetFilters = input.facet_filters;
  if (Array.isArray(facetFilters)) {
    for (const group of facetFilters) {
      /* The model alternates between [["Attr:Value"]] and ["Attr:Value"] for
       * the same field (measured live 2026-10-30 across consecutive turns);
       * a bare string is a one-entry OR-group. */
      const entries = typeof group === 'string' ? [group] : Array.isArray(group) ? group : [];
      const perAttribute: Record<string, string[]> = {};
      for (const entry of entries) {
        if (typeof entry !== 'string') continue;
        const sep = entry.indexOf(':');
        if (sep <= 0) continue;
        const attribute = `facet_${entry.slice(0, sep)}`;
        (perAttribute[attribute] ??= []).push(entry.slice(sep + 1));
      }
      for (const [attribute, values] of Object.entries(perAttribute)) {
        if (!Array.isArray(flat[attribute])) flat[attribute] = values;
      }
    }
  }
  return [flat];
}

/** Reads the search input's `facet_<Attribute>` keys — the model's per-query
 * narrowing (ground truth: prod mission-d99113f8 expresses "under $1,000" as
 * every Pricing_PriceRange band at or under the cap). Null and empty values
 * are the model leaving an attribute unconstrained; malformed values skip.
 * One OR-group per attribute, in key order. Later search parts in the same
 * turn overwrite earlier groups of the same attribute. */
function readTurnFilters(
  queries: unknown[],
  into: Record<string, string[]>,
): Record<string, string[]> {
  const first = queries[0];
  if (!isRecord(first)) return into;
  for (const [key, value] of Object.entries(first)) {
    if (!key.startsWith('facet_') || !Array.isArray(value)) continue;
    const attribute = key.slice('facet_'.length);
    if (!attribute || !value.length) continue;
    const values = value.filter((v): v is string => typeof v === 'string' && !!v);
    if (values.length) into[attribute] = values;
  }
  return into;
}

/** The chip refine's search params: the turn's own query and constraints
 * (one OR-group per constrained attribute, per Algolia's nested-array OR
 * semantics), with the shopper's chip selections ANDed on top. Pure so the
 * refine cannot silently diverge from the turn it refines again. */
export function buildFacetRefineParams(
  pick: Pick<FacetPick, 'queryText' | 'turnFilters'>,
  selections: { attribute: string; value: string }[],
): { query: string; facetFilters: (string | string[])[] } {
  return {
    query: pick.queryText,
    facetFilters: [
      ...pick.turnFilters,
      ...selections.map((selection) => `${selection.attribute}:"${selection.value}"`),
    ],
  };
}

/** Facet-count-only search for a turn whose streamed result carried no facet
 * counts (the platform stopped returning them on 2026-10-30 — measured: model-side
 * and client-side tool outputs both carry only hits, nbHits, queryID, and no
 * agent-side control restores them). Runs the turn's own query and constraints
 * so the counts describe exactly what the shopper is looking at. Zero hits
 * retrieved: this call exists for the counts alone. */
export function buildFacetCountParams(
  pick: Pick<FacetPick, 'queryText' | 'turnFilters' | 'displayFacets'>,
): { query: string; facetFilters: (string | string[])[]; facets: string[]; attributesToRetrieve: string[]; hitsPerPage: number; maxValuesPerFacet: number } {
  return {
    query: pick.queryText,
    facetFilters: [...pick.turnFilters],
    facets: pick.displayFacets,
    attributesToRetrieve: [],
    hitsPerPage: 1,
    maxValuesPerFacet: 24,
  };
}

export function extractMessageFacetPicks(messages: readonly Message[]): MessageFacetPick[] {
  const out: MessageFacetPick[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.parts || !message.id) continue;
    const hits: Record<string, unknown>[] = [];
    /* Per-turn state (2026-10-26 bug): queryText, facet counts and constraints
     * belong to THIS message's own search. They used to accumulate across the
     * transcript, so a round-3 chip tap refined round 1's query text — the
     * shopper's gold shelf re-searched platinum with no price cap. */
    const facets: Record<string, Record<string, number>> = {};
    let queryText = '';
    const turnConstraints: Record<string, string[]> = {};
    /* A multi-query call is a multi-direction turn: its facet counts are
     * per-direction, so a single funnel over them mismatches the tiles.
     * Chips only apply to a single-scope discovery search. */
    let multiScope = false;
    let sawSearch = false;
    let pick: string[] | null = null;
    let verified: PresentItem[] | null = null;
    for (const part of message.parts as Part[]) {
      if (typeof part.type !== 'string') continue;
      if (part.type === PRESENT_TOOL) {
        const present = readPresentInput(part.input);
        if (present?.displayFacets.length) pick = present.displayFacets;
        const items = readPresentItems(part.output);
        if (items?.length) verified = items;
        continue;
      }
      if (!part.type.startsWith(SEARCH_TOOL_PREFIX)) continue;
      const input = isRecord(part.input) ? (part.input as Record<string, unknown>) : null;
      const queries = normalizeSearchQueries(input);
      if (!queries) continue;
      sawSearch = true;
      if (queries.length !== 1) multiScope = true;
      const first = queries[0];
      if (!queryText && isRecord(first) && typeof first.query === 'string')
        queryText = first.query;
      readTurnFilters(queries, turnConstraints);
      if (!isRecord(part.output)) continue;
      const output = part.output as Record<string, unknown>;
      Object.assign(facets, readSearchPartFacets(output));
      if (Array.isArray(output.hits))
        for (const hitRecord of output.hits) if (isRecord(hitRecord)) hits.push(hitRecord);
    }
    /* A message without its own search part never carries a pick. The pills
     * are the app's contract with the shopper, not the model's: when the model
     * omits its displayFacets pick, the search's own counts still render. */
    const displayFacets = !sawSearch || multiScope ? [] : (pick ?? deriveDisplayFacets(facets));
    if (displayFacets.length && queryText)
      out.push({
        messageId: message.id,
        pick: {
          displayFacets,
          facets: { ...facets },
          queryText,
          turnFilters: Object.entries(turnConstraints).map(([attribute, values]) =>
            values.map((value) => `${attribute}:"${value}"`),
          ),
        },
        hits,
        verified,
      });
  }
  return out;
}

/* Tiles from the model's `present_products` call: the hits streamed back to
 * the model, the model chose, the tool verified — and this extractor
 * cross-checks every chosen id against the streamed search hits of the same
 * turn, so a piece the search never returned can never render. One search
 * per turn is the rule: a multi-query search part suppresses the whole
 * presentation. Nine: the tool's shelf cap, and Arijit's 3x3 target. */
const MAX_SEARCH_TILES = 9;

export type SearchPresentation = {
  queryText: string;
  objectIDs: string[];
  records: Map<string, Record<string, unknown>>;
};

export function extractSearchPresentation(messages: readonly Message[]): SearchPresentation | null {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      lastUser = index;
      break;
    }
  }
  if (lastUser < 0) return null;
  const assistants = [...messages]
    .slice(lastUser + 1)
    .filter((message) => message.role === 'assistant');
  const records = new Map<string, Record<string, unknown>>();
  let queryText = '';
  let chosen: string[] | null = null;
  for (const assistant of assistants) {
    if (!assistant?.parts) continue;
    for (const part of assistant.parts as Part[]) {
      if (typeof part.type !== 'string') continue;
      if (part.type === PRESENT_TOOL) {
        const items = readPresentItems(part.output);
        if (items?.length) {
          chosen = items.map((item) => item.objectID);
          /* Follow-up tiles were never streamed: their raw record rides the
           * output, so the cross-check below admits them like streamed ones. */
          for (const item of items) {
            if (item.raw && !records.has(item.objectID)) records.set(item.objectID, item.raw);
          }
        }
        continue;
      }
      if (!part.type.startsWith(SEARCH_TOOL_PREFIX)) continue;
      const input = isRecord(part.input) ? (part.input as Record<string, unknown>) : null;
      const queries = normalizeSearchQueries(input);
      if (!queries) continue;
      if (queries.length !== 1) return null;
      const first = queries[0];
      if (!queryText && isRecord(first) && typeof first.query === 'string')
        queryText = first.query;
      if (!isRecord(part.output)) continue;
      const hits = (part.output as Record<string, unknown>).hits;
      if (!Array.isArray(hits)) continue;
      for (const hit of hits) {
        if (!isRecord(hit) || typeof hit.objectID !== 'string' || !hit.objectID) continue;
        if (records.has(hit.objectID)) continue;
        records.set(hit.objectID, hit);
      }
    }
  }
  /* Cross-check: only pieces the tool verified — streamed, or carried whole
   * in the verified output — may render. */
  const objectIDs = (chosen ?? []).filter((id) => records.has(id)).slice(0, MAX_SEARCH_TILES);
  if (!objectIDs.length || !queryText) return null;
  return { queryText, objectIDs, records };
}

/** Every streamed search hit of the current turn, in result order — the
 * present_products backfill pool (the shelf floor). Unlike
 * extractSearchPresentation this does not depend on the model having picked
 * pieces yet, so it is valid at the moment the display tool executes. */
export function extractSearchHitObjectIDs(messages: readonly Message[]): string[] {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      lastUser = index;
      break;
    }
  }
  if (lastUser < 0) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const message of messages.slice(lastUser + 1)) {
    if (message?.role !== 'assistant' || !message.parts) continue;
    for (const part of message.parts as Part[]) {
      if (typeof part?.type !== 'string' || !part.type.startsWith(SEARCH_TOOL_PREFIX)) continue;
      if (!isRecord(part.output)) continue;
      const hits = part.output.hits;
      if (!Array.isArray(hits)) continue;
      for (const hit of hits) {
        if (!isRecord(hit) || typeof hit.objectID !== 'string' || !hit.objectID) continue;
        if (seen.has(hit.objectID)) continue;
        seen.add(hit.objectID);
        ids.push(hit.objectID);
      }
    }
  }
  return ids;
}

/**
 * Strips a trailing NOTE line (`NOTE: …` or `**NOTE:** …`) from DISPLAYED
 * reply text. The conversation state keeps the raw text; this runs only on the
 * render path. A NOTE that is not the last non-empty line is content and
 * stays. Returns the note (marker stripped) for the switch-gated echo path.
 */
export function stripTrailingNote(text: string): { display: string; note: string | null } {
  const lines = text.split('\n');
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  if (last < 0) return { display: text, note: null };
  const match = lines[last].match(/^\s*(?:\*\*)?NOTE:?(?:\*\*)?\s*(.*)$/);
  if (!match) return { display: text, note: null };
  const display = lines.slice(0, last).join('\n').replace(/\n+$/, '');
  return { display: display.length ? display : text, note: match[1] ?? '' };
}
