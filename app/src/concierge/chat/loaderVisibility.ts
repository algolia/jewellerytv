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
 * and a spinner under them would be saying what the text already says. */

type Part = { type?: string; state?: string; text?: string };

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
  if (last?.type !== 'text') return false;
  /* Mid-sentence: the words are the progress. Finished: the stream is open
   * and the next thing has not arrived yet. */
  return last.state !== 'streaming';
}
