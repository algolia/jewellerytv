import type {
  Conversation,
  ConversationListItem,
  Part,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from './schema.ts';
import { isRecord } from './schema.ts';
import { countByReasonCode, reasonCode, reasonHeadline } from './rejection.ts';

/**
 * Failure analysis over one parsed conversation (brief A2).
 *
 * Two rejection kinds, kept apart:
 * - PLATFORM: Agent Studio rejected the call before our server saw it. The
 *   tool-result has output.type "error-text"; the matching tool-call has empty
 *   args and the real input in rawArgs.
 * - SERVER: our own app server rejected the call. The tool-result value is an
 *   object with status "invalid_input" or "invalid_evidence".
 *
 * Unknown part types are counted and surfaced, never dropped.
 */

export type StepOutcome = 'ok' | 'platform-rejected' | 'server-rejected' | 'no-result';

export interface StepAnalysis {
  toolName: string;
  toolCallId: string | null;
  outcome: StepOutcome;
  inputSummary: string;
  status: string | null;
  /** Complete server response for a server rejection, unmodified (brief A2b). */
  serverResponse: Record<string, unknown> | null;
  reasonHeadline: string | null;
  reasonCode: string | null;
  errorText: string | null;
  failingInput: unknown;
  /** Complete input as sent (args if non-empty, else rawArgs), unmodified (brief A2c). */
  fullInput: unknown;
  /** Complete tool output as the agent received it, unmodified (brief A2c). Null when no result arrived. */
  toolOutput: { type: string | null; value: unknown } | null;
}

export interface TurnAnalysis {
  turn: number;
  shopperText: string;
  steps: StepAnalysis[];
  reply: string;
  replyFull: string;
  unknownPartTypes: string[];
}

export interface ConversationAnalysis {
  platformRejections: number;
  serverRejections: number;
  totalTokens: number | null;
  turns: TurnAnalysis[];
  unknownPartTypes: Record<string, number>;
  verdict: string;
}

export interface ListRow {
  item: ConversationListItem;
  verdict: string;
  platformRejections: number;
  serverRejections: number;
}

const SERVER_STATUSES = new Set(['invalid_input', 'invalid_evidence']);
const KNOWN_PART_TYPES = new Set(['text', 'start-step', 'tool-call', 'tool-result']);
const REPLY_PREVIEW_LENGTH = 240;
const INPUT_SUMMARY_LENGTH = 140;

function isToolCall(part: Part): part is ToolCallPart {
  return part.type === 'tool-call';
}

function isToolResult(part: Part): part is ToolResultPart {
  return part.type === 'tool-result';
}

function isTextPart(part: Part): part is TextPart {
  return part.type === 'text';
}

function fullInputOf(call: ToolCallPart | null): unknown {
  const args = call?.args;
  if (isRecord(args) && Object.keys(args).length > 0) return args;
  return call?.rawArgs ?? null;
}

function summarizeInput(call: ToolCallPart | null): string {
  const source = fullInputOf(call);
  if (source === null) return '(no input recorded)';
  const text = JSON.stringify(source) ?? String(source);
  return text.length > INPUT_SUMMARY_LENGTH ? `${text.slice(0, INPUT_SUMMARY_LENGTH)}...` : text;
}

function toolOutputOf(result: ToolResultPart): { type: string | null; value: unknown } | null {
  if (result.output === undefined || result.output === null) return null;
  return {
    type: typeof result.output.type === 'string' ? result.output.type : null,
    value: result.output.value,
  };
}

function platformErrorText(part: ToolResultPart): string | null {
  if (part.output?.type !== 'error-text') return null;
  const value = part.output.value;
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
}

function serverRejectionOf(
  part: ToolResultPart,
): { status: string; value: Record<string, unknown> } | null {
  const value = part.output?.value;
  if (!isRecord(value)) return null;
  const status = value['status'];
  if (typeof status !== 'string' || !SERVER_STATUSES.has(status)) return null;
  return { status, value };
}

function buildStep(call: ToolCallPart | null, result: ToolResultPart): StepAnalysis {
  const base: StepAnalysis = {
    toolName: call?.toolName ?? result.toolName ?? '(unknown tool)',
    toolCallId: result.toolCallId ?? call?.toolCallId ?? null,
    outcome: 'ok',
    inputSummary: summarizeInput(call),
    status: null,
    serverResponse: null,
    reasonHeadline: null,
    reasonCode: null,
    errorText: null,
    failingInput: null,
    fullInput: fullInputOf(call),
    toolOutput: toolOutputOf(result),
  };
  const platform = platformErrorText(result);
  if (platform !== null) {
    return {
      ...base,
      outcome: 'platform-rejected',
      errorText: platform,
      failingInput: call?.rawArgs ?? null,
    };
  }
  const server = serverRejectionOf(result);
  if (server !== null) {
    const args = call?.args;
    return {
      ...base,
      outcome: 'server-rejected',
      status: server.status,
      serverResponse: server.value,
      reasonHeadline: reasonHeadline(server.value),
      reasonCode: reasonCode(server.value),
      failingInput: isRecord(args) && Object.keys(args).length > 0 ? args : (call?.rawArgs ?? null),
    };
  }
  return base;
}

export function analyzeConversation(conversation: Conversation): ConversationAnalysis {
  const callsByToolCallId = new Map<string, ToolCallPart>();
  for (const message of conversation.messages) {
    for (const part of message.parts) {
      if (isToolCall(part) && part.toolCallId && !callsByToolCallId.has(part.toolCallId)) {
        callsByToolCallId.set(part.toolCallId, part);
      }
    }
  }

  const unknownPartTypes: Record<string, number> = {};
  const turns: TurnAnalysis[] = [];
  let current: TurnAnalysis | null = null;
  let turnCount = 0;
  let pendingCalls: ToolCallPart[] = [];

  function ensureTurn(): TurnAnalysis {
    if (current === null) {
      current = {
        turn: turnCount,
        shopperText: '(no shopper message yet)',
        steps: [],
        reply: '',
        replyFull: '',
        unknownPartTypes: [],
      };
      turns.push(current);
    }
    return current;
  }

  for (const message of conversation.messages) {
    if (message.role === 'user') {
      turnCount += 1;
      current = {
        turn: turnCount,
        shopperText: message.parts
          .filter(isTextPart)
          .map((part) => part.text)
          .filter((text): text is string => typeof text === 'string' && text.trim().length > 0)
          .join(' ')
          .trim(),
        steps: [],
        reply: '',
        replyFull: '',
        unknownPartTypes: [],
      };
      turns.push(current);
      continue;
    }
    const turn = ensureTurn();
    for (const part of message.parts) {
      if (!KNOWN_PART_TYPES.has(part.type)) {
        unknownPartTypes[part.type] = (unknownPartTypes[part.type] ?? 0) + 1;
        turn.unknownPartTypes.push(part.type);
        continue;
      }
      if (isTextPart(part)) {
        const text = part.text;
        if (typeof text === 'string' && text.trim().length > 0) {
          turn.replyFull = turn.replyFull ? `${turn.replyFull}\n${text}` : text;
        }
        continue;
      }
      if (isToolCall(part)) {
        if (part.toolCallId) pendingCalls.push(part);
        continue;
      }
      if (isToolResult(part)) {
        const call = part.toolCallId ? (callsByToolCallId.get(part.toolCallId) ?? null) : null;
        if (call?.toolCallId) {
          pendingCalls = pendingCalls.filter((entry) => entry.toolCallId !== call.toolCallId);
        }
        turn.steps.push(buildStep(call, part));
      }
    }
  }

  for (const call of pendingCalls) {
    ensureTurn().steps.push({
      toolName: call.toolName ?? '(unknown tool)',
      toolCallId: call.toolCallId ?? null,
      outcome: 'no-result',
      inputSummary: summarizeInput(call),
      status: null,
      serverResponse: null,
      reasonHeadline: null,
      reasonCode: null,
      errorText: null,
      failingInput: null,
      fullInput: fullInputOf(call),
      toolOutput: null,
    });
  }

  for (const turn of turns) {
    turn.reply =
      turn.replyFull.length > REPLY_PREVIEW_LENGTH
        ? `${turn.replyFull.slice(0, REPLY_PREVIEW_LENGTH)}...`
        : turn.replyFull;
  }

  const platformRejections = turns.reduce(
    (sum, turn) => sum + turn.steps.filter((step) => step.outcome === 'platform-rejected').length,
    0,
  );
  const serverRejections = turns.reduce(
    (sum, turn) => sum + turn.steps.filter((step) => step.outcome === 'server-rejected').length,
    0,
  );
  const counts = countByReasonCode(
    turns.flatMap((turn) =>
      turn.steps
        .filter((step) => step.outcome === 'server-rejected')
        .map((step) => step.reasonCode),
    ),
  );
  const countSummary =
    counts.length > 0
      ? `; SERVER: ${counts.map((entry) => `${entry.count} ${entry.code}`).join(', ')}`
      : '';

  return {
    platformRejections,
    serverRejections,
    totalTokens:
      typeof conversation.totalTokens === 'number'
        ? conversation.totalTokens
        : conversation.messages.reduce((sum, message) => sum + (message.totalTokens ?? 0), 0) ||
          null,
    turns,
    unknownPartTypes,
    verdict:
      platformRejections === 0 && serverRejections === 0
        ? 'NO FAILURES'
        : `FAILURES: ${platformRejections} PLATFORM, ${serverRejections} SERVER${countSummary}`,
  };
}

export function analyzeListItem(
  item: ConversationListItem,
  analysis: ConversationAnalysis,
): ListRow {
  return {
    item,
    verdict: analysis.verdict,
    platformRejections: analysis.platformRejections,
    serverRejections: analysis.serverRejections,
  };
}

export function activeWithin(item: ConversationListItem, cutoffMs: number): boolean {
  const stamp = item.lastActivityAt ?? item.createdAt;
  if (stamp === undefined) return true;
  const parsed = Date.parse(stamp);
  return Number.isNaN(parsed) ? true : parsed >= cutoffMs;
}
