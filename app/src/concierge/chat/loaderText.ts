/* What the panel says while a turn is in flight.
 *
 * The widget hands the loader a phase — `submitted`, `tool`, `reasoning` or
 * `thinking` — and lets `loaderText` be a function of it. That is enough to
 * alternate the way the team asked for, and better than alternating on a
 * timer: the words change because the turn changed, so they are true.
 *
 * `tool` is too coarse on its own. A turn calls two tools and they take very
 * different lengths of time: the search answers in tens of milliseconds, and
 * the display tool stalls for about four seconds between writing its intro
 * and emitting a group (platform questions, item 2). Saying "Searching" for
 * both would name the fast half and mislabel the slow one, so the in-flight
 * tool is read from the message and named. */

export type LoaderPhase = 'submitted' | 'tool' | 'reasoning' | 'thinking';

type Part = { type?: string; state?: string };
export type LoaderContext = {
  phase?: LoaderPhase;
  message?: { parts?: Part[] };
};

const SEARCHING = 'Searching…';
const CHOOSING = 'Choosing pieces…';
const THINKING = 'Thinking…';

/** The tool part still running, if any. A part is done once its output has
 * arrived, so anything before `output-available` is still in flight. */
function runningTool(message: LoaderContext['message']): string | undefined {
  const parts = message?.parts ?? [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    const type = String(part?.type ?? '');
    if (!type.startsWith('tool-')) continue;
    if (part?.state === 'output-available' || part?.state === 'output-error') continue;
    return type.slice('tool-'.length);
  }
  return undefined;
}

export function loaderTextFor(context: LoaderContext | undefined): string {
  const tool = runningTool(context?.message);
  if (tool?.startsWith('algolia_search_index')) return SEARCHING;
  if (tool?.startsWith('algolia_search_for_facet_values')) return SEARCHING;
  if (tool === 'algolia_grouped_results') return CHOOSING;
  /* A tool we do not recognise is still work, and "Thinking" is the honest
   * label for work we cannot name. */
  return context?.phase === 'tool' ? THINKING : THINKING;
}
