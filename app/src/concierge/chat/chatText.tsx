import { compiler } from 'markdown-to-jsx';

/* Display contract for assistant text, settled from Arijit's screenshots
 * (2026-11-04): the opening voice above the shelf stays, the closing line
 * after the shelf stays, and the model's mid-turn processing narration
 * ("That search returned just one result, let me search again", "Great! Now
 * I have a strong selection") never renders — it is the model talking about
 * its work, and the shopper does not care. The pre-merge panel enforced
 * this in code (78aa714); the simplification deleted the enforcement.
 *
 * Rules per text part:
 *  - no tool part before it  -> the opening voice: always renders.
 *  - a tool part before AND after -> narration between tool calls: never renders.
 *  - a tool part before, none after -> the closing: renders once the stream
 *    completes (holding it while streaming hides narration that is about to
 *    be followed by another tool, so nothing flashes on and then clears).
 *
 * Presentation only: raw transcript state, the agent and the tools are
 * untouched. */

type MessagePart = { type?: string; text?: string };

const isToolPart = (p: MessagePart | undefined) =>
  typeof p?.type === 'string' && p.type.startsWith('tool-');

/* Process-talk openings, measured live 2026-11-04: "I'll search for
 * engagement rings within your budget", "Let me show you some classic gift
 * directions", "Great! Now I have a strong selection". The prompt bans them
 * (rule, worked example, verbatim test) and the model writes them anyway;
 * the display drops the sentence class the way it drops between-tool
 * narration. First-sentence match only: a genuine opening never starts with
 * a verb phrase about the model's own work. */
const PROCESS_OPENING =
  /^\s*(i'll search|i will search|let me|let's |i will show|great!|that search returned)/i;

export function isProcessOpening(part: MessagePart | undefined): boolean {
  const firstSentence = (part?.text ?? '').split(/[.!?]/)[0] ?? '';
  return PROCESS_OPENING.test(firstSentence);
}

export function textDisplay(
  parts: MessagePart[] | undefined,
  index: number,
  status?: string,
): 'open' | 'narration' | 'closing' {
  if (!parts) return 'open';
  const part = parts[index];
  const before = parts.slice(0, index).some(isToolPart);
  const after = parts.slice(index + 1).some(isToolPart);
  if (!before) {
    /* The opening voice — unless it opens with process talk. */
    return isProcessOpening(part) ? 'narration' : 'open';
  }
  if (after) return 'narration';
  /* Closing text: hidden only while the stream could still add another tool
   * call; a narration part would then be reclassified, a reply part stays. */
  return status === 'streaming' ? 'narration' : 'closing';
}

type ChatTextProps = {
  part: { type?: string; text?: string };
  message?: { parts?: MessagePart[] };
  partIndex?: number;
  status?: string;
};

export function ChatText({ part, message, partIndex = -1, status }: ChatTextProps) {
  if (textDisplay(message?.parts, partIndex, status) === 'narration') return null;
  return <span>{compiler(part.text ?? '', { disableParsingRawHTML: true })}</span>;
}
