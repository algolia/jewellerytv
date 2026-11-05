import type { JSX } from 'react';

/* The chat library's default assistant actions are Copy and Regenerate.
 * Both are gone: the regenerate button (the circular-arrows icon) replayed a
 * paid turn the shopper did not ask for, and copy-to-clipboard has no job in
 * a shopping conversation. Arijit, 2026-11-03: "that is that freaking copy
 * icon, for what joy is that there for?" Remaining library actions (error
 * retry, feedback) pass through unchanged, rendered the way the library
 * renders its defaults. When nothing survives the filter this renders null
 * so no empty action row appears under the reply. */

type MessageAction = {
  title?: string;
  disabled?: boolean;
  icon?: () => JSX.Element;
  /* `never` keeps the component structurally assignable to the library's
   * action type whatever message type the library hands the handler. */
  onClick?: (message: never) => void;
};

type ChatActionsProps = {
  actions: MessageAction[];
  message: unknown;
};

const DROPPED = new Set(['Regenerate', 'Copy', 'Copy to clipboard']);

export function ChatActions({ actions, message }: ChatActionsProps) {
  const visible = actions.filter((action) => !DROPPED.has(action.title ?? ''));
  if (!visible.length) return null;
  return (
    <>
      {visible.map((action, index) => (
        <button
          key={index}
          type="button"
          className="ais-ChatMessage-action"
          aria-label={action.title}
          title={action.title}
          disabled={action.disabled}
          onClick={() => action.onClick?.(message as never)}
        >
          {action.icon ? action.icon() : null}
        </button>
      ))}
    </>
  );
}
