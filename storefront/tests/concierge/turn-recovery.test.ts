import { describe, expect, it } from 'vitest';
import { getConnectedTurnSystemNotice } from '../../src/concierge/ConnectedConcierge';
import {
  getFailedToolDetails,
  hasFailedTool,
  isCompletedAssistantTurn,
  turnHasUsableResult,
} from '../../src/concierge/turnCompletion';

/**
 * Turn recovery after a mid-turn tool failure (exact24 temp4, N4 arm, raw SSE
 * captured 2026-10-21 from the frozen app against the temp agent on N4).
 *
 * The captures show the same defect class three times: one tool part fails
 * (tool-input-error + tool-output-error in the SSE), the model retries and
 * the turn STILL ends with successful tool outputs and a final answer text.
 * The app discarded all three turns (empty reply in q*.json, red notice
 * instead) because hasFailedTool() reads any output-error part as a failed
 * turn. These fixtures replay the captured event order and the captured
 * errorTexts verbatim; the captured question literals keep the provenance
 * checkable.
 *
 * Capture evidence (results/P4/exact24/temp4/{q10,q23,q24}/capture/):
 *   q10  failed algolia_grouped_results (malformed groups list), then 2
 *        successful prod_catalog searches, then 2 successful grouped calls.
 *   q23  failed algolia_search_index_prod_catalog (numericFilters rejected:
 *        "Additional properties are not allowed"), then 2 successful
 *        searches, then 1 successful grouped call.
 *   q24  same rejection, then 3 successful searches, then 1 successful
 *        grouped call.
 */

const Q10_QUESTION = 'Show me Judith Ripka jewelry';

const Q10_GROUPED_ERROR_TEXT =
  'groups: Input should be a valid list (got "\\n<parameter name=\\"title\\">Cocktail rings")';

const NUMERIC_FILTERS_ERROR_TEXT =
  "Additional properties are not allowed ('numericFilters' was unexpected)";

// The model's answer text from the capture's rawReply (q10.json), truncated.
// Fixture data quoting a captured model reply for evaluation; never runtime copy.
const Q10_ANSWER_SNIPPET =
  'We carry a full Judith Ripka collection, mostly rings, earrings, bracelets, necklaces and pendants, nearly all set with her signature Bella Luce cubic zirconia (a lab created diamond simulant)';

function failedToolPart(toolName: string, errorText: string) {
  return {
    type: `tool-${toolName}`,
    toolCallId: `call-failed-${toolName}`,
    state: 'output-error',
    input: {},
    errorText,
  };
}

function successfulToolPart(toolName: string, id: string, output: Record<string, unknown>) {
  return {
    type: `tool-${toolName}`,
    toolCallId: id,
    state: 'output-available',
    input: {},
    output,
  };
}

const groupedOutput = {
  status: 'success',
  groups: [
    {
      title: 'Judith Ripka rings',
      lines: [{ objectID: 'JTV-331782', explanation: 'Bella Luce halo ring' }],
    },
  ],
};

const searchOutput = {
  hits: [
    {
      objectID: 'JTV-331782',
      Catalog_TitleDescription: 'Judith Ripka Aurora Borealis Sterling Silver Ring',
      Pricing_ActivePrice: 89.99,
    },
  ],
  nbHits: 1,
};

const userMessage = {
  id: 'shopper-q10',
  role: 'user',
  parts: [{ type: 'text', text: Q10_QUESTION }],
};

/** q10 event order: searches land first, the grouped call fails, grouped retries succeed. */
function q10RecoveredParts() {
  return [
    successfulToolPart('algolia_search_index_prod_catalog', 'call-search-1', searchOutput),
    successfulToolPart('algolia_search_index_prod_catalog', 'call-search-2', searchOutput),
    failedToolPart('algolia_grouped_results', Q10_GROUPED_ERROR_TEXT),
    successfulToolPart('algolia_grouped_results', 'call-grouped-retry', groupedOutput),
    successfulToolPart('algolia_grouped_results', 'call-grouped-2', groupedOutput),
    { type: 'text', text: Q10_ANSWER_SNIPPET, state: 'done' },
  ];
}

/** q23/q24 event order: a search fails (numericFilters rejected), searches and a grouped call succeed after. */
function q23RecoveredParts() {
  return [
    failedToolPart('algolia_search_index_prod_catalog', NUMERIC_FILTERS_ERROR_TEXT),
    successfulToolPart('algolia_search_index_prod_catalog', 'call-search-retry', searchOutput),
    successfulToolPart('algolia_search_index_prod_catalog', 'call-search-retry-2', searchOutput),
    successfulToolPart('algolia_grouped_results', 'call-grouped', groupedOutput),
    { type: 'text', text: Q10_ANSWER_SNIPPET, state: 'done' },
  ];
}

const cleanFinish = { isAbort: false, isError: false } as const;

const FAILED_TOOL_NOTICE =
  '[System notice] A product step in this request failed or timed out, so the reply may be incomplete. Ask again and the conversation picks up right where it left off. Existing product choices remain.';

describe('turn recovery after a mid-turn tool failure (exact24 temp4 q10, q23, q24)', () => {
  it('counts a turn that ends with successful outputs and a final answer as usable despite the failed part (q10)', () => {
    const messages = [
      userMessage,
      { id: 'assistant-q10', role: 'assistant', parts: q10RecoveredParts() },
    ] as never;
    // The failed part is still recorded, for the diagnostic log.
    expect(getFailedToolDetails(messages)).toEqual([
      { toolName: 'algolia_grouped_results', errorText: Q10_GROUPED_ERROR_TEXT },
    ]);
    expect(hasFailedTool(messages)).toBe(true);
    expect(turnHasUsableResult(messages)).toBe(true);
  });

  it('counts the q23 numericFilters-rejection turn as usable (search retry + grouped result + answer)', () => {
    const messages = [
      userMessage,
      { id: 'assistant-q23', role: 'assistant', parts: q23RecoveredParts() },
    ] as never;
    expect(getFailedToolDetails(messages)).toEqual([
      { toolName: 'algolia_search_index_prod_catalog', errorText: NUMERIC_FILTERS_ERROR_TEXT },
    ]);
    expect(hasFailedTool(messages)).toBe(true);
    expect(turnHasUsableResult(messages)).toBe(true);
  });

  it('a recovered turn is a completed turn and does not raise the failure notice', () => {
    const messages = [
      userMessage,
      { id: 'assistant-q10', role: 'assistant', parts: q10RecoveredParts() },
    ] as never;
    expect(isCompletedAssistantTurn(messages, 'ready')).toBe(true);
    // A recovered turn must never be rewritten into the failure notice, even
    // if the notice helper is consulted directly.
    expect(getConnectedTurnSystemNotice(messages, cleanFinish)).not.toBe(FAILED_TOOL_NOTICE);
  });

  it('keeps the failure notice for a turn whose only tool outcomes failed (no usable result)', () => {
    const messages = [
      userMessage,
      {
        id: 'assistant-all-failed',
        role: 'assistant',
        parts: [
          failedToolPart('algolia_grouped_results', Q10_GROUPED_ERROR_TEXT),
          { type: 'text', text: 'Something did go through.', state: 'done' },
        ],
      },
    ] as never;
    expect(hasFailedTool(messages)).toBe(true);
    expect(turnHasUsableResult(messages)).toBe(false);
    expect(getConnectedTurnSystemNotice(messages, cleanFinish)).toBe(FAILED_TOOL_NOTICE);
  });

  it('keeps the failure notice when outputs exist but the turn never produced its answer', () => {
    const messages = [
      userMessage,
      {
        id: 'assistant-no-answer',
        role: 'assistant',
        parts: [
          failedToolPart('algolia_search_index_prod_catalog', NUMERIC_FILTERS_ERROR_TEXT),
          successfulToolPart('algolia_grouped_results', 'call-grouped', groupedOutput),
          { type: 'text', text: 'Partial thought', state: 'streaming' },
        ],
      },
    ] as never;
    expect(hasFailedTool(messages)).toBe(true);
    expect(turnHasUsableResult(messages)).toBe(false);
  });
});
