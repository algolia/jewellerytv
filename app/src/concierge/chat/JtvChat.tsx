import { forwardRef, useMemo } from 'react';
import { liteClient } from 'algoliasearch/lite';
import { Chat, ChatInlineLayout, InstantSearch } from 'react-instantsearch';
import type { ChatHandle } from 'react-instantsearch';
import { Chat as ChatInstance } from 'instantsearch.js/es/lib/chat';
import type { UIMessage } from 'instantsearch.js/es/lib/chat';
import { DefaultChatTransport } from 'instantsearch.js/es/lib/ai-lite';
import { ProductCard, type JtvHit } from './ProductCard';
import { createGatedTools } from './gatedGroupedResults';
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

export type JtvChatProps = {
  /** Ambient page facts attached to the user turn (Agent Studio grounding). */
  context?: Record<string, string> | (() => Record<string, string>);
};

/* The ref exposes the widget's own handle (`setOpen`, `setInput`,
 * `sendMessage`), which is how the storefront's "Ask JTV" chip hands the
 * current search text to the panel. */
export const JtvChat = forwardRef<ChatHandle, JtvChatProps>(function JtvChat({ context }, ref) {
  const { appId, apiKey, agentId } = useMemo(readConfig, []);

  /* One instance per mount. Recreating it on every render would drop the
   * conversation and restart the stream. */
  const chat = useMemo(
    () =>
      new ChatInstance<UIMessage>({
        transport: new DefaultChatTransport({
          api: `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-5`,
          headers: {
            'x-algolia-application-id': appId,
            'x-algolia-api-key': apiKey,
          },
        }),
      }),
    [appId, apiKey, agentId],
  );

  const searchClient = useMemo(() => liteClient(appId, apiKey), [appId, apiKey]);

  return (
    <InstantSearch indexName={INDEX_NAME} searchClient={searchClient} insights={false}>
      <div className="jtv-chat-panel">
        {/* The inline layout is always visible, which is what lets the panel
         * live on its own route without a `<ChatTrigger />` next to it. The
         * default tools, built from `itemComponent`, render the search
         * carousels, grouped results and comparisons. */}
        <Chat<JtvHit>
          ref={ref}
          chat={chat}
          context={context}
          itemComponent={ProductCard}
          tools={createGatedTools()}
          layoutComponent={ChatInlineLayout}
          requiresSearch={false}
          translations={{ prompt: { textareaPlaceholder: 'Ask about jewellery' } }}
        />
      </div>
    </InstantSearch>
  );
});

export default JtvChat;
