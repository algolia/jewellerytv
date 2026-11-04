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
const ACTION = /\b(search|look|check|find|pull|display|show|run|query|browse|correct|retry|start)\w*\b/i;
const MAX_LENGTH = 160;

/** Whether a block of assistant text is the model narrating its own work. */
export function isNarration(text: string | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_LENGTH) return false;
  if (!ANNOUNCES.test(trimmed)) return false;
  /* The action verb has to be in the opening clause. "Let me know what you
   * think once you have had a look" announces nothing. */
  const opening = trimmed.split(/[.!?]/, 1)[0] ?? '';
  return ACTION.test(opening);
}
