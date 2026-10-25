import type { Conversation } from './schema.ts';
import { isRecord } from './schema.ts';
import type { ConversationAnalysis, ListRow } from './analysis.ts';

/**
 * Output rendering for the conversation reader (briefs A2, A2b and A2c).
 * Text form follows the briefs' layout; JSON form carries the same facts
 * for machine consumption (--json). A2b: every SERVER rejection shows a
 * one-line reason headline plus the complete server response — every field,
 * nothing selected away. Unknown fields render like any other; only the
 * three noisy state fields below may be collapsed onto one line.
 * A2c: with --full every tool call additionally shows its complete input and
 * the complete output the agent received; without --full the output is today's
 * short form, unchanged. A2c also filters the shown turns with --turn N.
 */

const OUTCOME_LABELS: Record<string, string> = {
  ok: 'ok',
  'platform-rejected': 'PLATFORM REJECTED',
  'server-rejected': 'SERVER REJECTED',
  'no-result': 'CALL WITHOUT RESULT',
};

export interface RenderOptions {
  /** --full: print the complete input and the complete tool output of every step. */
  full?: boolean;
  /** --no-cap: lift the per-output character cap in --full mode. */
  noCap?: boolean;
  /** --full cap for one printed output, in characters (default 4000). */
  maxOutputChars?: number;
  /** --turn N: show only this turn (1-based). */
  turn?: number | null;
}

const DEFAULT_MAX_OUTPUT_CHARS = 4000;

function selectedTurns<T extends { turn: number }>(
  turns: T[],
  turn: number | null | undefined,
): T[] {
  if (turn === null || turn === undefined) return turns;
  const found = turns.filter((entry) => entry.turn === turn);
  if (found.length === 0) {
    throw new Error(`no turn ${turn} in this conversation (it has ${turns.length} turns)`);
  }
  return found;
}

/** One pretty-printed block, capped with an explicit omission marker (brief A2c item 4). */
function blockLines(label: string, text: string, cap: number | null): string[] {
  const lines = [`${label}:`];
  let body = text;
  let omitted = 0;
  if (cap !== null && body.length > cap) {
    omitted = body.length - cap;
    body = body.slice(0, cap);
  }
  for (const line of body.split('\n')) {
    lines.push(`  ${line}`);
  }
  if (omitted > 0) {
    lines.push(`  [truncated, ${omitted} characters omitted]`);
  }
  return lines;
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? String(value);
}

const COLLAPSED_RESPONSE_FIELDS = new Set([
  'currentStateDigest',
  'appliedFactIds',
  'retractedFactIds',
]);

function renderResponseField(key: string, value: unknown): string[] {
  if (COLLAPSED_RESPONSE_FIELDS.has(key)) {
    return [`${key}: ${JSON.stringify(value) ?? String(value)}`];
  }
  if (isRecord(value) || Array.isArray(value)) {
    const lines = [`${key}:`];
    for (const line of JSON.stringify(value, null, 2).split('\n')) {
      lines.push(`  ${line}`);
    }
    return lines;
  }
  return [`${key}: ${String(value)}`];
}

function renderServerResponse(response: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(response)) {
    lines.push(...renderResponseField(key, value));
  }
  return lines;
}

export function renderConversation(
  conversation: Conversation,
  analysis: ConversationAnalysis,
  options: RenderOptions = {},
): string {
  const full = options.full === true;
  const cap =
    full && options.noCap !== true ? (options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS) : null;
  const turns = selectedTurns(analysis.turns, options.turn);
  const lines: string[] = [
    `Conversation: ${conversation.id}`,
    `Agent: ${conversation.agentId ?? '(unknown)'}`,
    `Started: ${conversation.createdAt ?? '(unknown)'}`,
    `Messages: ${conversation.messages.length}`,
    `Total tokens: ${analysis.totalTokens ?? '(unknown)'}`,
    `Verdict: ${analysis.verdict}`,
  ];
  if (options.turn !== null && options.turn !== undefined) {
    lines.push(
      `Turn filter: ${options.turn} (conversation has ${analysis.turns.length} turns); verdict covers the whole conversation`,
    );
  }
  if (Object.keys(analysis.unknownPartTypes).length > 0) {
    lines.push(
      `Unrecognised part types (counted, not dropped): ${JSON.stringify(analysis.unknownPartTypes)}`,
    );
  }
  for (const turn of turns) {
    lines.push('');
    lines.push(`Turn ${turn.turn} - shopper: ${turn.shopperText || '(no text part)'}`);
    for (const step of turn.steps) {
      const label = OUTCOME_LABELS[step.outcome] ?? step.outcome;
      lines.push(`  [${label}] ${step.toolName} - input: ${step.inputSummary}`);
      if (full && step.fullInput !== null && step.fullInput !== undefined) {
        lines.push(...blockLines('      input (full)', pretty(step.fullInput), null));
      }
      if (full && step.outcome !== 'server-rejected') {
        // Server rejections already print their complete output below as the
        // A2b "server response (complete)" block — same bytes, no duplicate.
        if (step.toolOutput === null) {
          lines.push('      output (complete): (none - no result arrived)');
        } else {
          const kind = step.toolOutput.type ?? 'unknown';
          const body =
            kind === 'error-text' && typeof step.toolOutput.value === 'string'
              ? step.toolOutput.value
              : pretty(step.toolOutput.value);
          lines.push(...blockLines(`      output (complete, ${kind})`, body, cap));
        }
      }
      if (step.outcome === 'server-rejected') {
        lines.push(`      status: ${step.status}`);
        lines.push(
          `      reason: ${step.reasonHeadline ?? 'no explanation fields in the response'}`,
        );
        if (step.serverResponse !== null) {
          lines.push(`      server response (complete):`);
          for (const line of renderServerResponse(step.serverResponse)) {
            lines.push(`        ${line}`);
          }
        }
      }
      if (step.outcome === 'platform-rejected' && step.errorText !== null) {
        lines.push(`      platform error: ${step.errorText}`);
      }
      if (step.outcome !== 'ok' && step.failingInput !== null && step.failingInput !== undefined) {
        lines.push(`      Failing input (full):`);
        for (const line of JSON.stringify(step.failingInput, null, 2).split('\n')) {
          lines.push(`        ${line}`);
        }
      }
    }
    if (turn.unknownPartTypes.length > 0) {
      lines.push(`  Unrecognised parts in this turn: ${turn.unknownPartTypes.join(', ')}`);
    }
    if (turn.reply) {
      lines.push(`  Reply: ${turn.reply.replace(/\n/g, ' ')}`);
    }
  }
  return lines.join('\n');
}

export function renderList(rows: ListRow[], agentId: string, since: string): string {
  const lines: string[] = [
    `Conversations for agent ${agentId} active since ${since}: ${rows.length}`,
  ];
  for (const row of rows) {
    const when = row.item.lastActivityAt ?? row.item.createdAt ?? '(unknown time)';
    const title = row.item.title ?? '(untitled)';
    lines.push(
      `${when}  ${row.item.id}  "${title}"  messages=${row.item.messageCount ?? '?'}  ${row.verdict}`,
    );
  }
  return lines.join('\n');
}

export function conversationJson(
  conversation: Conversation,
  analysis: ConversationAnalysis,
  options: RenderOptions = {},
): unknown {
  const full = options.full === true;
  const turns = selectedTurns(analysis.turns, options.turn);
  return {
    id: conversation.id,
    agent: conversation.agentId ?? null,
    title: conversation.title ?? null,
    createdAt: conversation.createdAt ?? null,
    messages: conversation.messages.length,
    totalTokens: analysis.totalTokens ?? null,
    verdict: analysis.verdict,
    platformRejections: analysis.platformRejections,
    serverRejections: analysis.serverRejections,
    unknownPartTypes: analysis.unknownPartTypes,
    turns: turns.map((turn) => ({
      turn: turn.turn,
      shopper: turn.shopperText,
      steps: turn.steps.map((step) => ({
        tool: step.toolName,
        toolCallId: step.toolCallId,
        outcome: step.outcome,
        input: step.inputSummary,
        status: step.status,
        serverResponse: step.serverResponse,
        reasonHeadline: step.reasonHeadline,
        reasonCode: step.reasonCode,
        errorText: step.errorText,
        failingInput: step.failingInput ?? null,
        ...(full ? { fullInput: step.fullInput, toolOutput: step.toolOutput } : {}),
      })),
      reply: turn.replyFull,
      unknownPartTypes: turn.unknownPartTypes,
    })),
  };
}

export function listJson(rows: ListRow[], agentId: string, since: string): unknown {
  return {
    agent: agentId,
    since,
    count: rows.length,
    conversations: rows.map((row) => ({
      id: row.item.id,
      title: row.item.title ?? null,
      createdAt: row.item.createdAt ?? null,
      lastActivityAt: row.item.lastActivityAt ?? null,
      messageCount: row.item.messageCount ?? null,
      totalTokens: row.item.totalTokens ?? null,
      verdict: row.verdict,
      platformRejections: row.platformRejections,
      serverRejections: row.serverRejections,
    })),
  };
}
