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
 * Presentation only: raw transcript state, the agent and the tools are
 * untouched — the same line the original commit drew. */

type MessagePart = { type?: string; text?: string };

export function isReplyPart(parts: MessagePart[] | undefined, index: number): boolean {
  if (!parts) return true;
  return !parts.slice(index + 1).some((p) => typeof p?.type === 'string' && p.type.startsWith('tool-'));
}

type ChatTextProps = {
  part: { type?: string; text?: string };
  message?: { parts?: MessagePart[] };
  partIndex?: number;
};

export function ChatText({ part, message, partIndex = -1 }: ChatTextProps) {
  if (!isReplyPart(message?.parts, partIndex)) return null;
  return <span>{compiler(part.text ?? '', { disableParsingRawHTML: true })}</span>;
}
