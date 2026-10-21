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
function latestAssistant(messages: readonly Message[]) {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') {
      lastUser = index;
      break;
    }
  }
  if (lastUser < 0) return undefined;
  return [...messages]
    .slice(lastUser + 1)
    .reverse()
    .find((message) => message.role === 'assistant');
}

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
      ...(typeof rawGroup.why === 'string' && rawGroup.why.trim()
        ? { why: rawGroup.why }
        : {}),
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
 */
export function extractNativePresentation(
  messages: readonly Message[],
): NativePresentation | null {
  const assistant = latestAssistant(messages);
  if (!assistant?.parts) return null;
  const records = new Map<string, Record<string, unknown>>();
  let grouped: { intro: string; groups: NativeGroup[] } | null = null;
  let arranged: NativeGroup[] | null = null;
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
      continue;
    }
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
  if (!grouped) return null;
  return { intro: grouped.intro, groups: grouped.groups, records };
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
