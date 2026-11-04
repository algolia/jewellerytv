import { compiler } from 'markdown-to-jsx';

/* Display contract for assistant text (presentation only — the agent, tools
 * and transcript are untouched).
 *
 * Measured live 2026-11-04: this model writes ALL of its text before the
 * display tool — the shopper's opening moment and its own processing
 * narration interleaved in the same stream ("Congratulations on your
 * engagement! … Let me show you…", "That search returned just one result…",
 * "The search gave me ornaments…") — and nothing after it. A reply-only
 * position filter therefore renders nothing, and keeping whole parts leaks
 * the processing. The contract that survives both is sentence-level:
 *
 *  - sentences that narrate the model's own work (search reports, curation
 *    talk, "Let me show you") never render;
 *  - everything else (the human moment, the guidance, the closing question)
 *    renders exactly as written.
 *
 * The sentence classes come from Arijit's callouts ("Who cares?" — the model
 * declaring what it is about to do) and the prompt's own narration bans,
 * which this model violates even with worked examples. Dropping is render
 * filtering, not rewriting: the words are the model's, the transcript keeps
 * every part. */

/* No trailing `\b` on purpose: after a punctuation-bearing alternative such
 * as `great!` a word boundary can never hold — "!" and the space (or end of
 * string) after it are both non-word — so "Great!" at the end of a sentence
 * run would slip through the filter. Every alternative is a phrase or ends
 * in "!", so a bare prefix match is already exact enough. */
const PROCESS_SENTENCE =
  /^\s*(i'll search|i'll find|i will search|i will find|i will show|let me|let's|great!|that search returned|the search gave|the search returned|the search picked|the results (?:are|show|lean)|now i have|now i'll|now i will)/i;

export function keepSentence(sentence: string): boolean {
  return !PROCESS_SENTENCE.test(sentence);
}

export function displayText(raw: string | undefined): string {
  if (!raw) return '';
  /* Split keeping the trailing delimiter with each sentence. */
  const pieces = raw.match(/[^.!?]+[.!?]*\s*/g) ?? [raw];
  const kept = pieces.filter(keepSentence);
  if (!kept.length) return '';
  return kept.join('').trim();
}

type ChatTextProps = {
  part: { type?: string; text?: string };
};

export function ChatText({ part }: ChatTextProps) {
  const text = displayText(part?.text);
  if (!text) return null;
  return <span>{compiler(text, { disableParsingRawHTML: true })}</span>;
}
