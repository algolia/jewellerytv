import { forwardRef, useCallback, useMemo, useState } from 'react';
import type { ComponentProps, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Maximize2, Minimize2, Plus, X } from 'lucide-react';
import { liteClient } from 'algoliasearch/lite';
import { Chat, ChatInlineLayout, InstantSearch } from 'react-instantsearch';
import type { ChatHandle } from 'react-instantsearch';
import { Chat as ChatInstance } from 'instantsearch.js/es/lib/chat';
import type { UIMessage } from 'instantsearch.js/es/lib/chat';
import { DefaultChatTransport } from 'instantsearch.js/es/lib/ai-lite';
import { ChatActions } from './chatActions';
import { ChatLoader } from './chatLoader';
import { ChatText } from './chatText';
import { ProductCard, type JtvHit } from './ProductCard';
import { StarterChips } from './StarterChips';
import { createGatedTools } from './gatedGroupedResults';
import { loaderTextFor } from './loaderText';
import './jtv-chat.css';

const INDEX_NAME = 'prod_catalog';

/* Step 1 of the migration: this panel talks to Agent Studio straight from the
 * browser, so the only credentials it can hold are the public ones. Missing
 * configuration fails at mount instead of producing a chat that silently
 * never answers. */
function readConfig() {
  const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
  const apiKey = import.meta.env.VITE_ALGOLIA_SEARCH_API_KEY;
  const agentId = import.meta.env.VITE_JTV_AGENT_ID;
  const missing = [
    appId ? '' : 'VITE_ALGOLIA_APP_ID',
    apiKey ? '' : 'VITE_ALGOLIA_SEARCH_API_KEY',
    agentId ? '' : 'VITE_JTV_AGENT_ID',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(
      `JtvChat is missing required environment variables: ${missing.join(', ')}. ` +
        'Set them in app/.env.local and restart the dev server.',
    );
  }
  return { appId, apiKey, agentId };
}

type HeaderProps = {
  onClose: () => void;
  onClear?: () => void;
  canClear?: boolean;
  /** Drags the panel: the shell's window controls, attached to the header. */
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/* The widget owns `clearMessages` and hands it to whatever header it is given,
 * so the panel header lives inside the widget rather than beside it. A second
 * header outside would have had no way to reach it. */
function createHeader(
  onPanelClose?: () => void,
  maximized?: boolean,
  onToggleMaximized?: () => void,
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void,
  onNewDeal?: () => void,
) {
  return function JtvChatHeader({ onClose, onClear, canClear: _canClear }: HeaderProps) {
    return (
      <div className="jtv-concierge-header" onPointerDown={onHeaderPointerDown}>
        <h2>JTV Concierge</h2>
        <div className="jtv-concierge-header-actions">
          {onToggleMaximized ? (
            <button
              type="button"
              className="jtv-concierge-header-button"
              aria-label={maximized ? 'Shrink the panel' : 'Expand the panel to full height'}
              title={maximized ? 'Shrink' : 'Expand'}
              aria-pressed={maximized}
              onClick={onToggleMaximized}
            >
              {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          ) : null}
          <button
            type="button"
            className="jtv-concierge-header-button jtv-concierge-new-chat"
            aria-label="Start a new conversation"
            title="New conversation"
            /* Always active: on an empty panel there is nothing to clear, but
             * the click still deals a fresh set of starter questions, which is
             * how the previous panel behaved. */
            onClick={() => {
              onClear?.();
              onNewDeal?.();
            }}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            className="jtv-concierge-header-button jtv-concierge-close"
            aria-label="Close the jewelry concierge"
            onClick={() => {
              onClose();
              onPanelClose?.();
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>
    );
  };
}

export type JtvChatProps = {
  /** Ambient page facts attached to the user turn (Agent Studio grounding). */
  context?: Record<string, string> | (() => Record<string, string>);
  /** Lets the header's close control dismiss the panel shell around it. */
  onClose?: () => void;
  /** Whether the shell is at full height; drives the header's control. */
  maximized?: boolean;
  /** Toggles the shell between the default panel and full height. */
  onToggleMaximized?: () => void;
  /** Drags the panel from the header (shell window controls). */
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
};

/* The ref exposes the widget's own handle (`setOpen`, `setInput`,
 * `sendMessage`), which is how the storefront's "Ask JTV" chip hands the
 * current search text to the panel. */
export const JtvChat = forwardRef<ChatHandle, JtvChatProps>(function JtvChat(
  { context, onClose, maximized, onToggleMaximized, onHeaderPointerDown },
  ref,
) {
  const { appId, apiKey, agentId } = useMemo(readConfig, []);

  /* Bumped by "New conversation" so the starter chips re-deal. */
  const [deal, setDeal] = useState(0);

  /* One instance per mount. Recreating it on every render would drop the
   * conversation and restart the stream. */
  const chat = useMemo(
    () =>
      new ChatInstance<UIMessage>({
        transport: new DefaultChatTransport({
          /* cache=true is the platform default, stated here so it reads as a
           * decision. It caches the whole response, not the prompt prefix:
           * measured 2026-10-29, an identical question returns a byte-identical
           * reply with identical product ids in 0.2 to 0.4s against 13.4s
           * uncached. `cache=false` bypasses it at full cost. The tradeoff is
           * freshness: on-air data refreshes daily and stock moves, so a cached
           * answer can outlive what it describes. */
          api: `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-5&cache=true`,
          headers: {
            'x-algolia-application-id': appId,
            'x-algolia-api-key': apiKey,
          },
        }),
      }),
    [appId, apiKey, agentId],
  );

  const searchClient = useMemo(() => liteClient(appId, apiKey), [appId, apiKey]);

  /* Replies link out to jtv.com: the live stream, the on-air item, a show's
   * on-demand page. The widget renders markdown anchors with no target, so a
   * plain click would navigate the storefront away and take the conversation
   * with it, since the transcript lives in this component's state.
   *
   * Delegated rather than handled per link: the message renderer is the
   * library's, and `parseMarkdown` is a boolean with no hook for anchor
   * attributes, so the alternative was forking the text component. Modified
   * and non-primary clicks are left alone, since the browser already opens
   * those in a new tab or window. */
  const openExternally = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (!/^https?:/i.test(anchor.getAttribute('href') ?? '')) return;
    if (anchor.host === window.location.host) return;
    event.preventDefault();
    window.open(anchor.href, '_blank', 'noopener,noreferrer');
  }, []);

  return (
    <InstantSearch indexName={INDEX_NAME} searchClient={searchClient} insights={false}>
      <div className="jtv-chat-panel" onClick={openExternally}>
        {/* The inline layout is always visible, which is what lets the panel
         * live on its own route without a `<ChatTrigger />` next to it. The
         * default tools, built from `itemComponent`, render the search
         * carousels, grouped results and comparisons. */}
        <Chat<JtvHit>
          ref={ref}
          chat={chat}
          context={context}
          itemComponent={ProductCard}
          /* Drops the library's default "Regenerate" action under every
           * reply; copy and feedback actions pass through unchanged. */
          actionsComponent={ChatActions}
          /* Text progress in the conversation, not the library's skeleton
           * bars. */
          loaderComponent={ChatLoader}
          /* Reply-only display (the pre-merge contract): text the model
           * writes before or between its tool calls is working narration and
           * never renders; only the reply after the last tool call does. */
          messagesProps={useMemo(
            () => ({ assistantMessageProps: { textComponent: ChatText } }),
            [],
          )}
          /* The model's reasoning ("thinking") stream never shows to a
           * shopper: it renders while streaming and auto-collapses on
           * completion — text that appears and then clears, which reads as a
           * broken panel. Off also matches the old panel, which never showed
           * it. */
          showReasoning={false}
          tools={useMemo(() => createGatedTools(), [])}
          layoutComponent={ChatInlineLayout}
          /* `key` on the starter chips: React keeps component state across the
           * widget's clear (same element slot, same type), so "New
           * conversation" showed the same nine questions every time. A deal
           * counter bumped by the header's clear remounts the chips and
           * re-rolls the set. */
          emptyComponent={useMemo(
            () =>
              function JtvStarters(props: ComponentProps<typeof StarterChips>) {
                return <StarterChips key={deal} {...props} />;
              },
            [deal],
          )}
          headerComponent={useMemo(
            () =>
              createHeader(onClose, maximized, onToggleMaximized, onHeaderPointerDown, () =>
                setDeal((d) => d + 1),
              ),
            [onClose, maximized, onToggleMaximized, onHeaderPointerDown],
          )}
          requiresSearch={false}
          /* Positions the chips as optional rather than as the only way in.
           * "Ask about jewellery" competed with them; this invites the
           * shopper past them. */
          translations={{
            prompt: { textareaPlaceholder: 'Shall we find something delighting?' },
            /* The widget calls this with the loader's own context on every
             * render, so the words track the turn rather than a timer. */
            messages: { loaderText: loaderTextFor },
          }}
        />
      </div>
    </InstantSearch>
  );
});

export default JtvChat;
