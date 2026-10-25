/* Lane 1: registration of the deterministic client tools with the Chat
 * SDK (TOOLS-DESIGN-V1.md, Lane 1 brief step 4; the two check tools were
 * removed per Arijit's D2 decision, 2026-10-21).
 *
 * The tool declarations the model sees live in the Agent Studio tool sheet
 * (candidates/p4-native-2026-10-20/tools-candidate-*.json), never here. This
 * module only binds each declared tool name to its executor: the pure tool
 * function over the shared read-only record fetcher. Outputs are the typed
 * structured outcomes the tools return, never shopper-facing text. The SDK
 * supplies the timeout wrapper and the abort signal. */

import { createCatalogRecordFetcher, type CatalogRecordFetcher } from './tools/catalogRecord';
import { createRefreshProducts } from './tools/refreshProducts';
import { createPresentProducts } from './tools/presentProducts';
import { APP_ANSWERED_TOOL_NAMES, SEARCH_TOOL_PREFIX } from '../../shared/concierge/toolSheetGuard';

export type ClientToolExecutor = {
  /** Claims tool names this entry can answer; an entry without onToolCall is
   * a pure claim: the connector leaves the tool result to its owner. */
  matchesToolName?: (toolName: string) => boolean;
  onToolCall?: (params: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    addToolResult: (result: { state: 'output-available'; output: unknown } | { state: 'output-error'; errorText: string }) => Promise<unknown>;
    signal: AbortSignal;
  }) => void | Promise<void>;
  timeout?: number | false;
};

/** Tool names as declared in the tool sheet; snake_case like production's.
 * The check tools were removed (Arijit's D2 decision, 2026-10-21) and
 * arrange_groups followed (chips-native cut, 2026-10-24): the tiles render
 * from the streamed search output, so refresh_products is the only client
 * executor left. */
/* The list lives in shared/concierge/toolSheetGuard.ts so the server's
 * tool-sheet check and this registry cannot drift apart. */
export const CLIENT_TOOL_NAMES = APP_ANSWERED_TOOL_NAMES;

export function buildClientTools(
  fetchRawRecord: (objectID: string) => Promise<unknown>,
  options?: { vocabulary?: () => Promise<{ values: Record<string, string[]> } | null> },
): Record<string, ClientToolExecutor> {
  const getRecords: CatalogRecordFetcher = createCatalogRecordFetcher(fetchRawRecord);
  const refreshProducts = createRefreshProducts(getRecords);
  const presentProducts = createPresentProducts(getRecords, { vocabulary: options?.vocabulary });
  const executorFor =
    <I, O>(run: (input: I) => Promise<O>) =>
    async ({ toolName, input, addToolResult }: { toolName: string; input: unknown; addToolResult: (r: { state: 'output-available'; output: unknown } | { state: 'output-error'; errorText: string }) => Promise<unknown> }) => {
      try {
        const output = await run(input as I);
        await addToolResult({ state: 'output-available', output });
      } catch (error) {
        // The tools validate their own input to structured outcomes; this
        // covers an unexpected failure without leaking internals to the turn.
        await addToolResult({ state: 'output-error', errorText: 'The tool call could not be completed.' });
        if (import.meta.env.DEV) console.warn('JTV client tool failed', toolName, error);
      }
    };
  return {
    /* The native search tool's result is streamed by Agent Studio itself; the
     * connector must not answer it client-side. Claiming the name WITHOUT an
     * executor makes findTool resolve it so the connector's "No tool
     * implemented for <name>" fallback never fires — that fallback replaced
     * the real streamed search output in the follow-up history and the model
     * searched again from scratch (DIAG-6, measured 2026-10-21). */
    algolia_search_index: {
      matchesToolName: (toolName: string) => toolName.startsWith(SEARCH_TOOL_PREFIX),
    },
    refresh_products: { onToolCall: executorFor(refreshProducts), timeout: 20000 },
    present_products: { onToolCall: executorFor(presentProducts), timeout: 20000 },
  };
}
