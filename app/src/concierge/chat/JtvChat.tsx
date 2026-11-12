import { forwardRef, useCallback, useMemo, useState } from 'react';
import type { ComponentProps, MouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronUp, Plus, Sparkles, X } from 'lucide-react';
import { liteClient } from 'algoliasearch/lite';
import { Chat, ChatInlineLayout, InstantSearch, CompareBar } from 'react-instantsearch';
import type { ChatHandle } from 'react-instantsearch';
import { Chat as ChatInstance } from 'instantsearch.js/es/lib/chat';
import type { UIMessage } from 'instantsearch.js/es/lib/chat';
import { NarrationFilteringTransport } from './narrationFilter';
import { ChatActions } from './chatActions';
import { ChatLoader } from './chatLoader';
import { keepLoaderUp } from './loaderVisibility';
import { linkIntent } from './linkTarget';
import type { PanelSize } from '../panelSize';
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
  size: PanelSize = 'normal',
  onRestore?: () => void,
  onMinimize?: () => void,
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void,
  onNewDeal?: () => void,
) {
  const minimized = size === 'minimized';
  return function JtvChatHeader({ onClose, onClear, canClear: _canClear }: HeaderProps) {
    return (
      <div
        className="jtv-concierge-header"
        onPointerDown={onHeaderPointerDown}
        /* The whole bar is the way back. Dragging is gated to the expanded
         * panel, so a click here while collapsed can only have been a click.
         * No role or tabindex: the chevron is already the keyboard path, and
         * a second focus stop announcing the same action is noise. */
        onClick={minimized ? onRestore : undefined}
      >
        <h2 className="jtv-concierge-header-title">
          Ask JTV
          <Sparkles size={14} aria-hidden="true" />
        </h2>
        <button
          type="button"
          className="jtv-concierge-new-search"
          /* The visible words are the accessible name, so the control reads
           * the same aloud as on screen, and the locator stops colliding with
           * the identically named button on the error card. */
          onClick={() => {
            onClear?.();
            onNewDeal?.();
          }}
        >
          <Plus size={14} aria-hidden="true" />
          New search
        </button>
        <div className="jtv-concierge-header-actions">
          {/* Two steps along one axis rather than two toggles, so the pair is
            * never in a state that contradicts itself. The unavailable end is
            * disabled rather than hidden: dropping a button shifts the others
            * sideways under a cursor that is about to click. */}
          <button
            type="button"
            className="jtv-concierge-header-button"
            aria-label="Restore the panel"
            title="Restore"
            disabled={!minimized}
            onClick={onRestore}
          >
            <ChevronUp size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="jtv-concierge-header-button"
            aria-label="Minimize the panel to its title bar"
            title="Minimize"
            disabled={minimized}
            onClick={onMinimize}
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="jtv-concierge-header-button jtv-concierge-close"
            aria-label="Close the jewelry concierge"
            title="Close"
            onClick={() => {
              onClose();
              onPanelClose?.();
            }}
          >
            <X size={18} aria-hidden="true" />
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
  /** Whether the shell is the docked card or collapsed to its title bar. */
  size?: PanelSize;
  /** Opens a collapsed panel back up. */
  onRestore?: () => void;
  /** Collapses the panel to its title bar. */
  onMinimize?: () => void;
  /** Drags the panel from the header (shell window controls). */
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  /** Follows a storefront link from inside the panel without a page load,
   * so the conversation survives opening a product. */
  onNavigate?: (path: string) => void;
};

/* The ref exposes the widget's own handle (`setOpen`, `setInput`,
 * `sendMessage`), which is how the storefront's "Ask JTV" chip hands the
 * current search text to the panel. */
export const JtvChat = forwardRef<ChatHandle, JtvChatProps>(function JtvChat(
  { context, onClose, size, onRestore, onMinimize, onHeaderPointerDown, onNavigate },
  ref,
) {
  const { appId, apiKey, agentId } = useMemo(readConfig, []);

  /* Bumped by "New search" so the starter chips re-deal. */
  const [deal, setDeal] = useState(0);

  /* One instance per mount. Recreating it on every render would drop the
   * conversation and restart the stream. */
  const chat = useMemo(
    () =>
      new ChatInstance<UIMessage>({
        transport: new NarrationFilteringTransport({
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
  const followLink = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a[href]');
      const intent = linkIntent(
        event,
        anchor instanceof HTMLAnchorElement ? anchor : null,
        window.location.host,
      );
      if (intent.kind === 'external') {
        event.preventDefault();
        window.open(intent.href, '_blank', 'noopener,noreferrer');
        return;
      }
      /* A product tile is a route, not a page load. Without the host's
       * router the anchor reloads the storefront and the panel comes back
       * closed and empty, so the tile that opened a product used to cost the
       * conversation. Where no router was given — the standalone embed — the
       * default stands. */
      if (intent.kind === 'internal' && onNavigate) {
        event.preventDefault();
        onNavigate(intent.path);
      }
    },
    [onNavigate],
  );

  return (
    <InstantSearch indexName={INDEX_NAME} searchClient={searchClient} insights={false}>
      <div className="jtv-chat-panel" onClick={followLink}>
        {/* The inline layout is always visible, which is what lets the panel
         * live on its own route without a `<ChatTrigger />` next to it. The
         * default tools, built from `itemComponent`, render the search
         * carousels, grouped results and comparisons. */}
        <CompareBar
          minItems={2}
          maxItems={4}
          configurationId="algolia_comparison_fab671ca-870d-49bd-bd7b-ddf7293bc095"
        />
        <Chat<JtvHit>
          ref={ref}
          chat={chat}
          context={context}
          itemComponent={ProductCard}
          /* Drops the library's default "Regenerate" action under every
           * reply; copy and feedback actions pass through unchanged. */
          actionsComponent={ChatActions}
          /* Text progress in the conversation, not the library's skeleton
           * bars. Inline in the stream, right under the shopper's question —
           * the loaderPosition the reference UX uses (Arijit, 2026-11-05). */
          loaderComponent={ChatLoader}
          loaderPosition="message-inline"
          /* The status holds through the gap between the model's last
           * sentence and the display tool's first byte — see
           * `loaderVisibility.ts`, where that gap is measured. */
          messagesProps={useMemo(() => ({ shouldShowLoader: keepLoaderUp }), [])}
          /* No display-side text filter. Narration is dropped upstream by the
           * transport (`narrationFilter.ts`), which is the only place it can
           * be dropped without the shopper watching it appear and vanish, and
           * a second filter at render would be a second definition of the same
           * word. The library's own text component renders what survives. */
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
          /* Every dependency must be listed: this memo returns a component
           * *type*, so a new identity remounts the whole header subtree. */
          headerComponent={useMemo(
            () =>
              createHeader(onClose, size, onRestore, onMinimize, onHeaderPointerDown, () =>
                setDeal((d) => d + 1),
              ),
            [onClose, size, onRestore, onMinimize, onHeaderPointerDown],
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
