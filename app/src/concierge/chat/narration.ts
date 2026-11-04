/* Narration the shopper should never read.
 *
 * The prompt bans it and the ban does not hold on every model: measured
 * 2026-11-04 on five never-asked questions with caching off, three of five
 * turns still opened with "I'll search for garnet pendants for you." and the
 * like. That is down from five such lines in a single turn before the prompt
 * block, so the prompt is doing most of the work — this is the backstop for
 * what it does not catch.
 *
 * Decided on content, not on position. An earlier attempt hid any text a tool
 * call followed, which could only be known once the tool arrived, so the
 * words streamed in and vanished; a flicker is worse than the sentence. A
 * content test is available the moment the text is, so nothing appears that
 * then disappears.
 *
 * Two conditions, both required, because the cost of a false positive is a
 * hidden reply:
 *
 *   1. It opens with the model announcing its own action — "I'll search",
 *      "Let me check", "Now let me display".
 *   2. It is short. A real reply is about the jewelry and runs longer than a
 *      sentence of throat-clearing.
 *
 * "I'd love to help you find something for this milestone" is not caught, and
 * should not be: responding to the person before the shopping work is asked
 * for by the instructions. */

/* "Let me know what you think" is an invitation, not an announcement — the
 * one idiom that opens like narration and is not. */
const ANNOUNCES =
  /^\s*(?:ok(?:ay)?[,!.]?\s+)?(?:now\s+)?(?:i'?ll|i will|i'?m going to|let me(?!\s+know\b)|i need to|i should|first,?\s+i'?ll)\b/i;
const ACTION =
  /\b(search|look|check|find|pull|display|show|run|query|browse|correct|retry|try|start)\w*\b/i;
const MAX_LENGTH = 160;
/* A dangling colon is the tell that the text is introducing work rather than
 * saying something: a reply to the shopper does not end on one, because
 * whatever the colon promised is a tool call rather than a sentence. It only
 * ever widens the length guard, so a long block still has to announce an
 * action before it is dropped. */
const INTRODUCES_WORK = /:\s*$/;
const MAX_LENGTH_WITH_COLON = 240;

/** Whether a block of assistant text is the model narrating its own work. */
export function isNarration(text: string | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  const limit = INTRODUCES_WORK.test(trimmed) ? MAX_LENGTH_WITH_COLON : MAX_LENGTH;
  if (!trimmed || trimmed.length > limit) return false;
  /* Any sentence, not only the first. Measured 2026-11-04: on a four-search
   * turn the announcement arrived second, behind a verdict on the search that
   * had just run ("These results are mostly pendants and charms. Let me search
   * specifically for mothers rings"). Judging the opening alone passed every
   * one of those through.
   *
   * The action verb has to be in the same sentence as the announcement.
   * "Let me know what you think once you have had a look" announces nothing. */
  return trimmed
    .split(/(?<=[.!?])\s+/)
    .some((sentence) => ANNOUNCES.test(sentence) && ACTION.test(sentence));
}
