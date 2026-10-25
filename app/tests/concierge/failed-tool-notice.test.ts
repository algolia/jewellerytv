import { describe, expect, it } from 'vitest';
import { getConnectedTurnSystemNotice } from '../../src/concierge/ConnectedConcierge';
import { getFailedToolDetails, hasFailedTool } from '../../src/concierge/turnCompletion';

// The SDK's per-client-tool timeout wrapper commits this exact errorText
// (instantsearch.js es/connectors/chat/connectChat.js TOOL_TIMEOUT_ERROR_TEXT)
// into a tool part with state 'output-error' while the turn itself finishes
// cleanly. Server tool-input-error / tool-output-error chunks and the mid-tool
// abort path commit the same part shape with their own errorText.
const TOOL_TIMEOUT_ERROR_TEXT =
  'The tool call timed out before a result was received. The operation may have completed.';

const user = {
  id: 'shopper-1',
  role: 'user',
  parts: [{ type: 'text', text: 'Show me gold hoop earrings' }],
};

const assistantWithFailedTool = {
  id: 'assistant-1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-retrieve_evidence',
      toolCallId: 'call-1',
      state: 'output-error',
      input: {},
      errorText: TOOL_TIMEOUT_ERROR_TEXT,
    },
    { type: 'text', text: 'Here is what I found so far.', state: 'done' },
  ],
} as const;

// Observed receipt fingerprint (timeout-fix-2026-10-13/diagnosis.md): the SDK
// finished the turn normally (hasFinish: true, isError: false) while a tool
// part carried the failure.
const cleanFinish = { isAbort: false, isError: false } as const;

const FAILED_TOOL_NOTICE =
  '[System notice] A product step in this request failed or timed out, so the reply may be incomplete. Ask again and the conversation picks up right where it left off. Existing product choices remain.';

const TRANSPORT_NOTICE =
  '[System notice] That message did not go through. Send it again and the conversation picks up right where it left off. Existing product choices remain.';

describe('failedTool turn notice', () => {
  it('gives a cleanly finished turn with a failed tool its own honest notice, not the transport copy', () => {
    const notice = getConnectedTurnSystemNotice(
      [user, assistantWithFailedTool] as never,
      cleanFinish,
    );
    expect(notice).toBe(FAILED_TOOL_NOTICE);
  });

  it('keeps the failedTool notice labelled and free of internal tool details', () => {
    const notice = getConnectedTurnSystemNotice(
      [user, assistantWithFailedTool] as never,
      cleanFinish,
    );
    expect(notice).toContain('[System notice]');
    expect(notice).toContain('Existing product choices remain.');
    expect(notice).not.toContain('retrieve_evidence');
    expect(notice).not.toContain(TOOL_TIMEOUT_ERROR_TEXT);
    expect(notice).not.toContain('operations');
  });

  it('still reports a turn-level error as a transport failure even when a tool also failed', () => {
    const notice = getConnectedTurnSystemNotice(
      [user, assistantWithFailedTool] as never,
      { isAbort: false, isError: true },
    );
    expect(notice).toBe(TRANSPORT_NOTICE);
  });

  it('still reports an aborted turn as stopped before a complete response', () => {
    const notice = getConnectedTurnSystemNotice(
      [user, assistantWithFailedTool] as never,
      { isAbort: true, isError: false },
    );
    expect(notice).toBe(
      '[System notice] This request was stopped before a complete response. Existing product choices remain.',
    );
  });
});

// Every writer of a failed tool outcome converges on the same committed part:
// state 'output-error' with an errorText, on the latest assistant message.
// Writers, from the SDK sources:
//   1. per-client-tool 20s timeout wrapper (connectChat.js TOOL_TIMEOUT_ERROR_TEXT)
//   2. mid-tool response abort (connectChat.js TOOL_ABORTED_ERROR_TEXT)
//   3. server tool-input-error / tool-output-error chunks (abstract-chat.js, chunk.errorText)
//   4. restored-pending-part repair on resume (RESTORED_TOOL_*_ERROR_TEXT)
// One reader over that shape covers the whole class.
describe('failed tool details reader', () => {
  const serverChunkErrorText = 'operations [] rejected';

  it('reads the timeout writer shape from the latest assistant message', () => {
    const details = getFailedToolDetails([user, assistantWithFailedTool] as never);
    expect(details).toEqual([
      { toolName: 'retrieve_evidence', errorText: TOOL_TIMEOUT_ERROR_TEXT },
    ]);
    expect(hasFailedTool([user, assistantWithFailedTool] as never)).toBe(true);
  });

  it('reads the aborted writer and the server tool-error chunk shapes', () => {
    const aborted = {
      ...assistantWithFailedTool,
      parts: [
        {
          type: 'tool-present_choices',
          toolCallId: 'call-2',
          state: 'output-error',
          input: {},
          errorText: 'The tool call was cancelled before a result was received.',
        },
      ],
    };
    const serverChunk = {
      ...assistantWithFailedTool,
      parts: [
        {
          type: 'tool-retrieve_evidence',
          toolCallId: 'call-3',
          state: 'output-error',
          input: {},
          errorText: serverChunkErrorText,
        },
      ],
    };
    expect(getFailedToolDetails([user, aborted] as never)).toEqual([
      { toolName: 'present_choices', errorText: 'The tool call was cancelled before a result was received.' },
    ]);
    expect(getFailedToolDetails([user, serverChunk] as never)).toEqual([
      { toolName: 'retrieve_evidence', errorText: serverChunkErrorText },
    ]);
  });

  it('reads every failed tool in one turn, in part order, for the serial-queue breach case', () => {
    const queued = {
      ...assistantWithFailedTool,
      parts: [
        {
          type: 'tool-retrieve_evidence',
          toolCallId: 'call-1',
          state: 'output-error',
          input: {},
          errorText: TOOL_TIMEOUT_ERROR_TEXT,
        },
        {
          type: 'tool-update_shopping_state',
          toolCallId: 'call-2',
          state: 'output-error',
          input: {},
          errorText: TOOL_TIMEOUT_ERROR_TEXT,
        },
      ],
    };
    expect(getFailedToolDetails([user, queued] as never)).toEqual([
      { toolName: 'retrieve_evidence', errorText: TOOL_TIMEOUT_ERROR_TEXT },
      { toolName: 'update_shopping_state', errorText: TOOL_TIMEOUT_ERROR_TEXT },
    ]);
  });

  it('returns nothing for healthy turns, older turns, and non-tool parts', () => {
    const healthy = {
      ...assistantWithFailedTool,
      parts: [
        { type: 'tool-retrieve_evidence', toolCallId: 'call-1', state: 'output-available', input: {}, output: {} },
        { type: 'text', text: 'Done', state: 'done' },
      ],
    };
    expect(getFailedToolDetails([user, healthy] as never)).toEqual([]);
    expect(hasFailedTool([user, healthy] as never)).toBe(false);
    expect(getFailedToolDetails([])).toEqual([]);
    expect(
      getFailedToolDetails([user, { ...assistantWithFailedTool, parts: [{ type: 'text', state: 'output-error', text: 'x' }] }] as never),
    ).toEqual([]);
  });

  it('keeps hasFailedTool and the details reader in agreement on older assistant messages', () => {
    // A newer user message means the failed tool belongs to an earlier turn;
    // the reader and the gate both scope to the latest assistant turn.
    const messages = [user, assistantWithFailedTool, {
      id: 'shopper-2',
      role: 'user',
      parts: [{ type: 'text', text: 'Now show me rings' }],
    }] as never;
    expect(hasFailedTool(messages)).toBe(false);
    expect(getFailedToolDetails(messages)).toEqual([]);
  });
});
