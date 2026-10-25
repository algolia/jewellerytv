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
const MAX_ANCHOR_TILES = 4;

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
      const queries = Array.isArray(input?.queries) ? (input!.queries as unknown[]) : null;
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
};

/** Per-message variant for anchored chip rendering: each assistant message
 * that carries a facet pick gets one entry, with the facet counts and
 * search hits accumulated up to and including that message. */
export type MessageFacetPick = {
  messageId: string;
  pick: FacetPick;
  hits: Record<string, unknown>[];
};

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

export function extractMessageFacetPicks(messages: readonly Message[]): MessageFacetPick[] {
  const out: MessageFacetPick[] = [];
  const facets: Record<string, Record<string, number>> = {};
  let queryText = '';
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.parts || !message.id) continue;
    const hits: Record<string, unknown>[] = [];
    /* A multi-query call is a multi-direction turn: its facet counts are
     * per-direction, so a single funnel over them mismatches the tiles.
     * Chips only apply to a single-scope discovery search. */
    let multiScope = false;
    let sawSearch = false;
    let pick: string[] | null = null;
    for (const part of message.parts as Part[]) {
      if (typeof part.type !== 'string') continue;
      if (part.type === PRESENT_TOOL) {
        const present = readPresentInput(part.input);
        if (present?.displayFacets.length) pick = present.displayFacets;
        continue;
      }
      if (!part.type.startsWith(SEARCH_TOOL_PREFIX)) continue;
      const input = isRecord(part.input) ? (part.input as Record<string, unknown>) : null;
      const queries = Array.isArray(input?.queries) ? (input!.queries as unknown[]) : null;
      if (!queries) continue;
      sawSearch = true;
      if (queries.length !== 1) multiScope = true;
      const first = queries[0];
      if (!queryText && isRecord(first) && typeof first.query === 'string')
        queryText = first.query;
      if (!isRecord(part.output)) continue;
      const output = part.output as Record<string, unknown>;
      Object.assign(facets, readSearchPartFacets(output));
      if (Array.isArray(output.hits))
        for (const hitRecord of output.hits) if (isRecord(hitRecord)) hits.push(hitRecord);
    }
    /* A message without its own search part never carries a pick, even though
     * the accumulated counts stay live for the messages that do. The pills are
     * the app's contract with the shopper, not the model's: when the model
     * omits its displayFacets pick, the search's own counts still render. */
    const displayFacets = !sawSearch || multiScope ? [] : (pick ?? deriveDisplayFacets(facets));
    if (displayFacets.length && queryText)
      out.push({
        messageId: message.id,
        pick: { displayFacets, facets: { ...facets }, queryText },
        hits,
      });
  }
  return out;
}

/* Tiles from the model's `present_products` call: the hits streamed back to
 * the model, the model chose, the tool verified — and this extractor
 * cross-checks every chosen id against the streamed search hits of the same
 * turn, so a piece the search never returned can never render. One search
 * per turn is the rule: a multi-query search part suppresses the whole
 * presentation. */
const MAX_SEARCH_TILES = 8;

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
        const present = readPresentOutput(part.output);
        if (present?.length) chosen = present;
        continue;
      }
      if (!part.type.startsWith(SEARCH_TOOL_PREFIX)) continue;
      const input = isRecord(part.input) ? (part.input as Record<string, unknown>) : null;
      const queries = Array.isArray(input?.queries) ? (input!.queries as unknown[]) : null;
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
  /* Cross-check: only pieces the streamed search actually returned may render. */
  const objectIDs = (chosen ?? []).filter((id) => records.has(id)).slice(0, MAX_SEARCH_TILES);
  if (!objectIDs.length || !queryText) return null;
  return { queryText, objectIDs, records };
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
