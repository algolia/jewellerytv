/* Whether the turn status stays up.
 *
 * The library hides the loader as soon as a text part is the last thing that
 * rendered, on the reasonable assumption that visible words are their own
 * sign of progress. This model writes all of its text before it calls the
 * display tool and none after, so that assumption inverts: the words land
 * early, the loader goes, and then the display tool spends seconds writing a
 * tool call that renders nothing (the measured stall is four seconds between
 * its first characters and its first group).
 *
 * Sampled at 200ms through "Show me opal jewelry", 2026-11-05:
 *
 *   3510ms  loader gone, no skeleton, eight characters of text, no tiles
 *   3712ms  the display tool starts streaming and the shelf skeleton appears
 *
 * Two tenths of a second there, because the search was fast. The window is
 * the gap between the model finishing its sentence and the display tool
 * emitting its first byte, and that is exactly the gap that stretches when
 * the platform buffers the tool call.
 *
 * So a text part that has FINISHED no longer ends the turn: if the stream is
 * still open, something is still coming, and the status says so. A text part
 * still arriving does end it, because the shopper can see the words appear
 * and a spinner under them would be saying what the text already says.
 *
 * The display tool is the other half, and the bigger one. Sampled at 100ms
 * through "What did Misty feature this week?", the shelf skeleton stood on
 * screen from 4731ms to 8895ms with no loader over it: four seconds of grey
 * outlines that do not move and do not say anything. The first cut of this
 * file left a running tool alone on the grounds that the skeleton was its
 * affordance, and that was wrong — a skeleton shows the shape of what is
 * coming, not that anything is happening. So the status holds over it too,
 * until the first group lands and real tiles start filling in. The label is
 * already written for this case: `loaderText` says "Choosing pieces…" when
 * the display tool is the one in flight. */

type Part = { type?: string; state?: string; text?: string; input?: unknown };

/** The display tool reports its groups on the part it is still streaming;
 * the library types the input as `unknown`, so it is narrowed here. */
function groupsSoFar(part: Part): number {
  const groups = (part.input as { groups?: unknown[] } | undefined)?.groups;
  return Array.isArray(groups) ? groups.length : 0;
}

const DISPLAY_TOOL = 'tool-algolia_grouped_results';

export type LoaderDecision = {
  defaultValue: boolean;
  status?: string;
  message?: { parts?: Part[]; role?: string };
};

/** A part the shopper can see land. Reasoning and metadata parts render
 * nothing here, so they cannot answer for the turn's progress. */
function isVisible(part: Part | undefined): boolean {
  const type = String(part?.type ?? '');
  return type === 'text' || type.startsWith('tool-');
}

export function keepLoaderUp({ defaultValue, status, message }: LoaderDecision): boolean {
  if (defaultValue) return true;
  /* `submitted` and `streaming` are the only in-flight states; anything else
   * is a finished turn and the loader has no business on screen. */
  if (status !== 'streaming') return false;
  const parts = (message?.parts ?? []).filter(isVisible);
  const last = parts[parts.length - 1];
  if (!last) return false;
  /* The display tool before its first group: the skeleton is on screen and
   * nothing in it moves, so the status is the only thing saying the turn is
   * alive. Once a group lands, tiles are filling in and it can stand down. */
  if (last.type === DISPLAY_TOOL) return groupsSoFar(last) === 0;
  /* Any text, finished or still arriving. The first cut kept the status down
   * while words were flowing, on the grounds that they are their own sign of
   * progress — but the transport emits a sentence at a time, so between
   * sentences nothing moves either. Measured on the same turn: 8 characters
   * at 10691ms, 26 at 11418ms, and no status over the 700ms in between. */
  return last.type === 'text';
}
