/* Lane 1: registration of the four deterministic client tools with the Chat
 * SDK (TOOLS-DESIGN-V1.md, Lane 1 brief step 4).
 *
 * The tool declarations the model sees live in the Agent Studio tool sheet
 * (candidates/p4-native-2026-10-20/tools-candidate-*.json), never here. This
 * module only binds each declared tool name to its executor: the pure tool
 * function over the shared read-only record fetcher. Outputs are the typed
 * structured outcomes the tools return, never shopper-facing text. The SDK
 * supplies the timeout wrapper and the abort signal. */

import { createCatalogRecordFetcher, type CatalogRecordFetcher } from './tools/catalogRecord';
import { createCheckPrice } from './tools/checkPrice';
import { createCheckStock } from './tools/checkStock';
import { createRefreshProducts } from './tools/refreshProducts';
import { createArrangeGroups } from './tools/arrangeGroups';

export type ClientToolExecutor = {
  onToolCall: (params: {
    toolCallId: string;
    toolName: string;
    input: unknown;
    addToolResult: (result: { state: 'output-available'; output: unknown } | { state: 'output-error'; errorText: string }) => Promise<unknown>;
    signal: AbortSignal;
  }) => void | Promise<void>;
  timeout?: number | false;
};

/** Tool names as declared in the tool sheet; snake_case like production's. */
export const CLIENT_TOOL_NAMES = ['check_price', 'check_stock', 'refresh_products', 'arrange_groups'] as const;

export function buildClientTools(
  fetchRawRecord: (objectID: string) => Promise<unknown>,
): Record<string, ClientToolExecutor> {
  const getRecords: CatalogRecordFetcher = createCatalogRecordFetcher(fetchRawRecord);
  const checkPrice = createCheckPrice(getRecords);
  const checkStock = createCheckStock(getRecords);
  const refreshProducts = createRefreshProducts(getRecords);
  const arrangeGroups = createArrangeGroups(getRecords);
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
    check_price: { onToolCall: executorFor(checkPrice), timeout: 20000 },
    check_stock: { onToolCall: executorFor(checkStock), timeout: 20000 },
    refresh_products: { onToolCall: executorFor(refreshProducts), timeout: 20000 },
    arrange_groups: { onToolCall: executorFor(arrangeGroups), timeout: 20000 },
  };
}
