/* F1 native adapter, pure extraction layer (briefs/F1-fixer-native-adapter.md).
 *
 * In the native setup the agent searches Algolia with its own server tools
 * (`algolia_search_index`, `algolia_grouped_results`); the app's only job is to
 * render. This module reads those tool parts out of the conversation stream and
 * strips the NOTE line from what the shopper sees. It holds no conversation
 * logic: it never decides what to search, say, or show next.
 *
 * Part shapes verified against raw C2 captures (results/P4/c2/s-02/capture/):
 * a search part is `tool-algolia_search_index_<index>` with `output.hits`, and
 * a grouped part is `tool-algolia_grouped_results` whose INPUT carries
 * `{intro, groups: [{title, why?, results: [{objectID, ...}]}]}` — the output
 * is only `{status: "success"}`.
 */

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

export type NativePresentation = {
  intro: string;
  /** Grouped-call group names, used as the workspace columns. */
  groups: NativeGroup[];
  /** Raw records already streamed by the search tool, keyed by objectID. */
  records: Map<string, Record<string, unknown>>;
};

const GROUPED_TOOL = 'tool-algolia_grouped_results';
const ARRANGE_TOOL = 'tool-arrange_groups';
const SEARCH_TOOL_PREFIX = 'tool-algolia_search_index';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Latest assistant message after the last user message, mirroring
 * turnCompletion.ts's selection so both readers see the same turn. */
function readGroupedInput(input: unknown): { intro: string; groups: NativeGroup[] } | null {
  if (!isRecord(input)) return null;
  const rawGroups = input.groups;
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) return null;
  const groups: NativeGroup[] = [];
  for (const rawGroup of rawGroups) {
    if (!isRecord(rawGroup)) return null;
    const title = rawGroup.title;
    if (typeof title !== 'string' || !title.trim()) return null;
    const rawResults = rawGroup.results;
    if (!Array.isArray(rawResults)) return null;
    const objectIDs: string[] = [];
    for (const rawResult of rawResults) {
      if (!isRecord(rawResult)) return null;
      const objectID = rawResult.objectID;
      if (typeof objectID !== 'string' || !objectID) return null;
      objectIDs.push(objectID);
    }
    groups.push({
      title,
      ...(typeof rawGroup.why === 'string' && rawGroup.why.trim() ? { why: rawGroup.why } : {}),
      objectIDs,
    });
  }
  const intro = typeof input.intro === 'string' ? input.intro : '';
  return { intro, groups };
}

/** Reads the arranged-groups tool output (Lane 1: the app renders tiles from
 * arrange_groups, whose output already dropped ineligible pieces). Returns
 * null for anything but a successful structured output; a later call
 * supersedes an earlier one on the same turn. */
function readArrangedOutput(output: unknown): NativeGroup[] | null {
  if (!isRecord(output) || output.status !== 'ok') return null;
  const rawGroups = output.groups;
  if (!Array.isArray(rawGroups)) return null;
  const groups: NativeGroup[] = [];
  for (const rawGroup of rawGroups) {
    if (!isRecord(rawGroup)) return null;
    const title = rawGroup.title;
    if (typeof title !== 'string' || !title.trim()) return null;
    if (!Array.isArray(rawGroup.items)) return null;
    const objectIDs: string[] = [];
    for (const item of rawGroup.items) {
      if (!isRecord(item)) return null;
      const objectID = item.objectID;
      if (typeof objectID !== 'string' || !objectID) return null;
      objectIDs.push(objectID);
    }
    if (objectIDs.length) groups.push({ title, objectIDs });
  }
  return groups;
}

/** Mobile anchored cards (chips-native cut): per assistant message, the
 * single-query search's own hits — up to four — become the anchored tiles the
 * conversation renders under the answer that found them. A multi-query
 * message anchors nothing, matching the tiles-path suppression. Search
 * records are NOT collected here; the hydration layer collects them across
 * the transcript. */
const MAX_ANCHOR_TILES = 4;

export function extractMessageAnchors(
  messages: readonly Message[],
): { messageId: string; groups: NativeGroup[] }[] {
  const anchors: { messageId: string; groups: NativeGroup[] }[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.parts || !message.id) continue;
    let queryText = '';
    const objectIDs: string[] = [];
    let multiScope = false;
    for (const part of message.parts as Part[]) {
      if (typeof part.type !== 'string' || !part.type.startsWith(SEARCH_TOOL_PREFIX)) continue;
      const input = isRecord(part.input) ? (part.input as Record<string, unknown>) : null;
      const queries = Array.isArray(input?.queries) ? (input!.queries as unknown[]) : null;
      if (!queries) continue;
      if (queries.length !== 1) multiScope = true;
      const first = queries[0];
      if (!queryText && isRecord(first) && typeof first.query === 'string')
        queryText = first.query;
      if (!isRecord(part.output)) continue;
      const hits = (part.output as Record<string, unknown>).hits;
      if (!Array.isArray(hits)) continue;
      for (const hit of hits) {
        if (!isRecord(hit) || typeof hit.objectID !== 'string' || !hit.objectID) continue;
        if (objectIDs.includes(hit.objectID)) continue;
        objectIDs.push(hit.objectID);
      }
    }
    if (queryText && objectIDs.length && !multiScope)
      anchors.push({
        messageId: message.id,
        groups: [{ title: queryText, objectIDs: objectIDs.slice(0, MAX_ANCHOR_TILES) }],
      });
  }
  return anchors;
}

/** Facet chips (chips-native cut 2026-10-24): the streamed search tool result
 * carries the aggregate `facets` counts, and the app derives the chip order
 * from that data itself — no model list, no static whitelist (Arijit's
 * standing rule: hard-coded attribute lists are a defect class). */
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

const MAX_FACET_VALUES = 20;
const MAX_FACET_ATTRIBUTES = 3;

/** Order the facet attributes the app renders as chips: drop degenerate
 * facets (a single-value facet is already narrowed; a very long tail reads as
 * identifier noise), then order survivors fewest distinct values first — the
 * narrow-fastest cascade — alphabetical on ties so the order is stable. */
export function deriveFacetPick(facets: Record<string, Record<string, number>>): string[] {
  return Object.entries(facets)
    .filter(([, values]) => {
      const distinct = Object.keys(values).length;
      return distinct >= 2 && distinct <= MAX_FACET_VALUES;
    })
    .sort((a, b) => {
      const delta = Object.keys(a[1]).length - Object.keys(b[1]).length;
      return delta !== 0 ? delta : a[0].localeCompare(b[0]);
    })
    .map(([attribute]) => attribute)
    .slice(0, MAX_FACET_ATTRIBUTES);
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
    for (const part of message.parts as Part[]) {
      if (typeof part.type !== 'string') continue;
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
     * the accumulated counts stay live for the messages that do. */
    const displayFacets = !sawSearch || multiScope ? [] : deriveFacetPick(facets);
    if (displayFacets.length && queryText)
      out.push({
        messageId: message.id,
        pick: { displayFacets, facets: { ...facets }, queryText },
        hits,
      });
  }
  return out;
}

/* Tiles from the streamed search output (chips-native cut): the hits are the
 * tiles, in Algolia's own relevancy order. One search per turn is the rule,
 * so a multi-query search part suppresses the whole presentation — a mixed
 * facet sheet cannot back a single funnel, and the app never invents a grid
 * from a turn that broke the shape. */
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
  const objectIDs: string[] = [];
  const records = new Map<string, Record<string, unknown>>();
  let queryText = '';
  for (const assistant of assistants) {
    if (!assistant?.parts) continue;
    for (const part of assistant.parts as Part[]) {
      if (typeof part.type !== 'string' || !part.type.startsWith(SEARCH_TOOL_PREFIX)) continue;
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
        objectIDs.push(hit.objectID);
      }
    }
  }
  if (!objectIDs.length || !queryText) return null;
  return { queryText, objectIDs: objectIDs.slice(0, MAX_SEARCH_TILES), records };
}

/**
 * Reads the native tool parts off the latest assistant turn. Returns null when
 * the turn presented no grouped results (held turns, service answers). A
 * grouped part whose input is unusable yields null — the app never invents a
 * grid from partial data. A later grouped call supersedes an earlier one on
 * the same turn; search records accumulate across the turn's calls.
 *
 * Lane 1: an arrange_groups output wins when present — its groups are already
 * eligibility-checked by the deterministic tool, so tiles can only contain
 * pieces the tools approved. The grouped-tool input path stays as the
 * fallback for turns arranged before the tool sheet changes.
 *
 * DIAG-11: the scan covers EVERY assistant message after the last shopper
 * message, newest first, instead of only the latest one. When the output
 * guardrail withholds an answer, the SDK replaces the LATEST assistant
 * message with the fixed notice, while an earlier message of the same turn
 * still holds a successful arrange_groups output — tool-verified, ready to
 * render. Reading only the latest message discarded exactly that output.
 */
export function extractNativePresentation(messages: readonly Message[]): NativePresentation | null {
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
  for (const assistant of assistants) {
    if (!assistant?.parts) continue;
    for (const part of assistant.parts as Part[]) {
      if (typeof part.type !== 'string') continue;
      if (part.type.startsWith(SEARCH_TOOL_PREFIX) && isRecord(part.output)) {
        const hits = (part.output as Record<string, unknown>).hits;
        if (Array.isArray(hits)) {
          for (const hit of hits) {
            if (isRecord(hit) && typeof hit.objectID === 'string' && hit.objectID) {
              if (!records.has(hit.objectID)) records.set(hit.objectID, hit);
            }
          }
        }
      }
    }
  }
  for (const assistant of [...assistants].reverse()) {
    if (!assistant?.parts) continue;
    let grouped: { intro: string; groups: NativeGroup[] } | null = null;
    let arranged: NativeGroup[] | null = null;
    for (const part of assistant.parts as Part[]) {
      if (typeof part.type !== 'string') continue;
      if (part.type === GROUPED_TOOL) {
        const parsed = readGroupedInput(part.input);
        if (parsed) grouped = parsed;
      }
      if (part.type === ARRANGE_TOOL) {
        const parsed = readArrangedOutput(part.output);
        if (parsed) arranged = parsed;
      }
    }
    if (arranged) return { intro: '', groups: arranged, records };
    if (grouped) return { intro: grouped.intro, groups: grouped.groups, records };
  }
  return null;
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
