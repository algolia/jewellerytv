import { compiler } from 'markdown-to-jsx';

/* Reply-only display, ported from the pre-merge panel (commit 78aa714,
 * `displayTextParts`): text the model writes before or between its tool
 * calls is working narration — progress talk like "That search returned
 * just one result, let me search again" — and the old panel never rendered
 * it. The simplification deleted that enforcement, so the library streamed
 * every text part straight to the shopper. This component restores the
 * contract on the new widget: a text part renders only when no tool part
 * comes after it in the message, i.e. it is part of the reply. Turns with
 * no tool call keep all their text.
 *
 * Streaming rule (2026-11-04, the flash fix): while the turn is still
 * streaming and no tool part exists yet, the text cannot be classified —
 * it may be narration about to be followed by a tool. Rendering it live
 * flashed narration on screen and cleared it when the tool arrived. So an
 * unclassifiable streaming text renders nothing (the loader covers the
 * window); when the stream completes with no tools, the full text renders.
 *
 * Presentation only: raw transcript state, the agent and the tools are
 * untouched — the same line the original commit drew. */

type MessagePart = { type?: string; text?: string };

const isToolPart = (p: MessagePart | undefined) =>
  typeof p?.type === 'string' && p.type.startsWith('tool-');

export function isReplyPart(
  parts: MessagePart[] | undefined,
  index: number,
  status?: string,
): boolean {
  if (!parts) return true;
  if (parts.slice(index + 1).some(isToolPart)) return false;
  if (parts.some(isToolPart)) return true;
  return status !== 'streaming';
}

type ChatTextProps = {
  part: { type?: string; text?: string };
  message?: { parts?: MessagePart[] };
  partIndex?: number;
  status?: string;
};

export function ChatText({ part, message, partIndex = -1, status }: ChatTextProps) {
  if (!isReplyPart(message?.parts, partIndex, status)) return null;
  return <span>{compiler(part.text ?? '', { disableParsingRawHTML: true })}</span>;
}
