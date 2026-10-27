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
import { createPresentProducts, type PresentProductsOutput } from './tools/presentProducts';
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
  options?: {
    vocabulary?: () => Promise<{ values: Record<string, string[]> } | null>;
    /** The shopper's own message text for the current turn (see
     * presentProducts — the requirement's only source). */
    shopperMessage?: () => string | null | undefined;
    /** The streamed search's remaining hit objectIDs for the current turn
     * (see presentProducts — the shelf floor's backfill pool). */
    searchPool?: () => readonly string[] | null | undefined;
    /** The app's read-only search proxy (see presentProducts — the shelf
     * floor's last resort when the streamed pool is exhausted). */
    appSearch?: (facetFilters: readonly string[]) => Promise<readonly string[]>;
    /** One multi-get for N records (the /api/products/batch route) — the
     * curation tool's latency fix for the platform's client-tool wait
     * budget (the cancelled present_products events, 2026-10-26). */
    batchFetchRawRecords?: (objectIDs: readonly string[]) => Promise<unknown[]>;
  },
): Record<string, ClientToolExecutor> {
  const getRecords: CatalogRecordFetcher = createCatalogRecordFetcher(fetchRawRecord, {
    batchFetchRawRecords: options?.batchFetchRawRecords,
  });
  const refreshProducts = createRefreshProducts(getRecords);
  const presentProducts = createPresentProducts(getRecords, {
    vocabulary: options?.vocabulary,
    shopperMessage: options?.shopperMessage,
    searchPool: options?.searchPool,
    appSearch: options?.appSearch,
  });
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
    present_products: { onToolCall: (params) => presentProductsExecutor(presentProducts, params), timeout: 20000 },
  };
}

/* The model's own words, twice on 2026-10-27: "the display tool is telling me
 * these don't read as pearl by its material-name check… so the pieces the
 * shopper actually wants can pass through." The forensics in the tool result
 * (`enforced`, `dropped`, the declaration fields) were the fuel — the model
 * paraphrased them to the shopper. The model now sees the shelf only; the
 * shadow diagnostics ride a side channel the model never reads, so the gate
 * keeps its measurement while the shopper keeps the persona. */
export type ModelVisiblePresentOutput = Pick<
  PresentProductsOutput,
  'status' | 'objectIDs' | 'displayFacets'
>;

export function modelVisiblePresentOutput(output: PresentProductsOutput): ModelVisiblePresentOutput {
  return {
    status: output.status,
    objectIDs: output.objectIDs,
    displayFacets: output.displayFacets,
  };
}

export function presentShadowReceipt(input: unknown, output: PresentProductsOutput) {
  const understood =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as { understood?: unknown }).understood ?? null
      : null;
  return {
    at: new Date().toISOString(),
    status: output.status,
    understood,
    declared: output.declared ?? null,
    declaredVerbatim: output.declaredVerbatim ?? null,
    priceOverBudget: output.priceOverBudget ?? null,
    enforced: output.enforced ?? null,
    dropped: output.dropped,
    returned: output.objectIDs.length,
  };
}

const SHADOW_KEY = 'jtv-present-shadow';
const SHADOW_CAP = 50;
type StorageLike = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

export function stashPresentShadowReceipt(receipt: unknown, storage: StorageLike) {
  try {
    const existing = JSON.parse(storage.getItem(SHADOW_KEY) ?? '[]') as unknown[];
    const next = [...existing, receipt].slice(-SHADOW_CAP);
    storage.setItem(SHADOW_KEY, JSON.stringify(next));
  } catch {
    /* The shadow log is diagnostic only; a blocked storage never breaks the
     * tool call. */
  }
}

function stashShadowFromSession(input: unknown, output: PresentProductsOutput) {
  if (typeof sessionStorage === 'undefined') return;
  stashPresentShadowReceipt(presentShadowReceipt(input, output), sessionStorage);
}

async function presentProductsExecutor(
  run: (input: never) => Promise<PresentProductsOutput>,
  params: { toolCallId: string; toolName: string; input: unknown; addToolResult: (r: { state: 'output-available'; output: unknown } | { state: 'output-error'; errorText: string }) => Promise<unknown>; signal: AbortSignal },
) {
  try {
    const output = await run(params.input as never);
    stashShadowFromSession(params.input, output);
    await params.addToolResult({ state: 'output-available', output: modelVisiblePresentOutput(output) });
  } catch {
    await params.addToolResult({ state: 'output-error', errorText: 'The tool call could not be completed.' });
  }
}
