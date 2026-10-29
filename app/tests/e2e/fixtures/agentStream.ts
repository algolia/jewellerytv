import type { Page, Route } from '@playwright/test';

/*
 * Agent Studio stream fixture.
 *
 * The rebuilt Concierge (`src/concierge/chat/JtvChat.tsx`) posts straight from
 * the browser to
 * `https://{appId}.algolia.net/agent-studio/1/agents/{agentId}/completions`,
 * so there is no app server left to stub. Every e2e spec that needs a reply
 * scripts one here instead: no live agent, no tokens, no network.
 *
 * The event vocabulary below is the AI-SDK-5 compatibility stream the widget's
 * own parser reads (`instantsearch.js/es/lib/ai-lite/stream-parser.js`): SSE
 * lines of `data: {json}`.
 */

/** Every request the panel can make, whatever app id or agent id is configured. */
export const AGENT_STUDIO_ROUTE = /\/agent-studio\//;

/* A transparent 1x1 GIF. Real `Media_Images` entries are jtv.com URLs; a data
 * URI keeps the tiles hermetic, so an image assertion never depends on a CDN. */
export const PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** The subset of a `prod_catalog` record the chat tiles and the gate read. */
export type CatalogRecord = {
  objectID: string;
  Catalog_TitleDescription: string;
  /* Empty means "no imagery": `src/concierge/chat/gatedGroupedResults.tsx`
   * refuses the piece rather than rendering a placeholder tile. */
  Media_Images: string[];
  Inventory_InStock: boolean;
  /* Carried deliberately. The panel must never print it. */
  Pricing_ActivePrice: number;
};

export const RING: CatalogRecord = {
  objectID: 'XTP21',
  Catalog_TitleDescription: 'Sterling Silver Tanzanite Halo Ring',
  Media_Images: [PIXEL],
  Inventory_InStock: true,
  Pricing_ActivePrice: 189.99,
};

export const EARRINGS: CatalogRecord = {
  objectID: 'MFP256C',
  Catalog_TitleDescription: 'Moissanite Fire Yellow Gold Hoop Earrings',
  Media_Images: [PIXEL],
  Inventory_InStock: true,
  Pricing_ActivePrice: 94.99,
};

/** In the catalogue, in stock, and unphotographed: the gate must refuse it. */
export const UNPHOTOGRAPHED: CatalogRecord = {
  objectID: 'NOIMG01',
  Catalog_TitleDescription: 'Cultured Pearl Drop Pendant',
  Media_Images: [],
  Inventory_InStock: true,
  Pricing_ActivePrice: 249.99,
};

export const CATALOG_RECORDS: CatalogRecord[] = [RING, EARRINGS, UNPHOTOGRAPHED];

/** One shelf of the display call. Repeat an objectID to exercise the gate. */
export type GroupSpec = {
  title: string;
  objectIDs: string[];
  why?: string;
};

export type AgentTurn = {
  /** Assistant prose. Markdown is rendered by the widget, so `**bold**` works. */
  text?: string;
  /** Prose split into deltas, for specs that need the reply to arrive in parts. */
  textDeltas?: string[];
  /** Records the search tool returns. Grouped results can only show these. */
  hits?: CatalogRecord[];
  /** Caption above the shelves. */
  intro?: string;
  /** The display call. Omit it and the turn is prose only. */
  groups?: GroupSpec[];
  /** End the stream on an `error` event instead of `finish`. */
  errorText?: string;
  messageId?: string;
  indexName?: string;
  query?: string;
};

export type AgentEvent = Record<string, unknown>;

/** The scripted turn as the ordered chunks the widget's parser consumes. */
export function agentTurnEvents(turn: AgentTurn = {}): AgentEvent[] {
  const messageId = turn.messageId ?? 'alg_msg_fixture';
  const events: AgentEvent[] = [
    /* `groupedResultsEnabled` is what stops the search tool from drawing its
     * own carousel of the same records next to the grouped shelves
     * (`shouldSearchToolRenderResults` in instantsearch-ui-components). */
    { type: 'start', messageId, messageMetadata: { groupedResultsEnabled: true } },
    { type: 'start-step' },
  ];

  if (turn.hits?.length) {
    const toolName = `algolia_search_index_${turn.indexName ?? 'prod_catalog'}`;
    events.push({ type: 'tool-input-start', toolCallId: 'call_search', toolName });
    events.push({
      type: 'tool-input-available',
      toolCallId: 'call_search',
      toolName,
      input: { queries: [{ query: turn.query ?? '' }] },
    });
    /* The record store the grouped tool hydrates from is built from tool
     * outputs that carry `hits` (`collectChatRecords`). A piece the agent
     * names but never searched up renders as nothing at all. */
    events.push({
      type: 'tool-output-available',
      toolCallId: 'call_search',
      output: { hits: turn.hits, nbHits: turn.hits.length },
    });
  }

  const deltas = turn.textDeltas ?? (turn.text === undefined ? [] : [turn.text]);
  if (deltas.length) {
    events.push({ type: 'text-start', id: 'text_1' });
    for (const delta of deltas) events.push({ type: 'text-delta', id: 'text_1', delta });
    events.push({ type: 'text-end', id: 'text_1' });
  }

  if (turn.groups) {
    events.push({
      type: 'tool-input-start',
      toolCallId: 'call_display',
      toolName: 'algolia_grouped_results',
    });
    events.push({
      type: 'tool-input-available',
      toolCallId: 'call_display',
      toolName: 'algolia_grouped_results',
      input: {
        ...(turn.intro === undefined ? {} : { intro: turn.intro }),
        groups: turn.groups.map((group) => ({
          title: group.title,
          ...(group.why === undefined ? {} : { why: group.why }),
          results: group.objectIDs.map((objectID) => ({
            objectID,
            why: `${objectID} suits the brief.`,
          })),
        })),
      },
    });
  }

  events.push({ type: 'finish-step' });
  events.push(
    turn.errorText === undefined
      ? { type: 'finish' }
      : { type: 'error', errorText: turn.errorText },
  );
  return events;
}

/** The SSE body for a list of chunks. */
export function toEventStream(events: AgentEvent[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}

function fulfilStream(route: Route, body: string) {
  return route.fulfill({
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      /* The panel is cross-origin to the page; Playwright adds the CORS
       * headers a fulfilled response needs, but the hint costs nothing. */
      'x-vercel-ai-ui-message-stream': 'v1',
    },
    body,
  });
}

/**
 * Answers every Agent Studio completion with one scripted turn.
 *
 * ```ts
 * await stubAgentTurn(page, {
 *   text: 'Two **bright** options.',
 *   hits: [RING, EARRINGS],
 *   groups: [{ title: 'Halo rings', objectIDs: ['XTP21'] }],
 * });
 * ```
 */
export async function stubAgentTurn(page: Page, turn: AgentTurn = {}): Promise<void> {
  const body = toEventStream(agentTurnEvents(turn));
  await page.route(AGENT_STUDIO_ROUTE, (route) => fulfilStream(route, body));
}

/** Answers with a stream whose chunks you supply verbatim. */
export async function stubAgentEvents(page: Page, events: AgentEvent[]): Promise<void> {
  const body = toEventStream(events);
  await page.route(AGENT_STUDIO_ROUTE, (route) => fulfilStream(route, body));
}

/** The connection never completes: the panel sees a failed `fetch`. */
export async function stubAgentNetworkFailure(page: Page): Promise<void> {
  await page.route(AGENT_STUDIO_ROUTE, (route) => route.abort('failed'));
}

/**
 * Keeps a scripted turn open so a spec can release it chunk by chunk, which a
 * fulfilled route cannot do: Playwright delivers a fulfilled body in one go.
 *
 * Install it before `page.goto`. It replaces `window.fetch` for Agent Studio
 * requests only; everything else still goes through the real one.
 */
export type ManualAgentStream = {
  /** Pushes chunks into the open response. */
  emit: (...events: AgentEvent[]) => Promise<void>;
  /** Ends the response, settling the turn. */
  close: () => Promise<void>;
};

type StreamWindow = Window & {
  __jtvAgentEmit?: (event: unknown) => void;
  __jtvAgentClose?: () => void;
};

export async function installManualAgentStream(page: Page): Promise<ManualAgentStream> {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!raw.includes('/agent-studio/')) return originalFetch(input, init);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          (window as StreamWindow).__jtvAgentEmit = (event) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          (window as StreamWindow).__jtvAgentClose = () => controller.close();
        },
      });
      return Promise.resolve(
        new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'x-vercel-ai-ui-message-stream': 'v1',
          },
        }),
      );
    };
  });
  return {
    emit: async (...events: AgentEvent[]) => {
      await page.evaluate((queued) => {
        const emit = (window as StreamWindow).__jtvAgentEmit;
        for (const event of queued) emit?.(event);
      }, events);
    },
    close: async () => {
      await page.evaluate(() => (window as StreamWindow).__jtvAgentClose?.());
    },
  };
}
