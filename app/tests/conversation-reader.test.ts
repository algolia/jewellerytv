import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { activeWithin, analyzeConversation } from '../scripts/conversation-reader/analysis.ts';
import {
  ConversationListSchema,
  ConversationSchema,
  isRecord,
  type Conversation,
  type ToolCallPart,
  type ToolResultPart,
} from '../scripts/conversation-reader/schema.ts';
import { conversationJson, renderConversation } from '../scripts/conversation-reader/render.ts';

/**
 * Brief A2 tests: real saved Agent Studio conversation JSON as fixtures, not
 * hand-written mocks. The expected counts come from the architect session's
 * hand reading of the raw JSON on 2026-10-17 (brief expected-answers table).
 */

const FIXTURE_DIR = new URL('./fixtures/conversation-reader/', import.meta.url);

function loadConversation(shortId: string): Conversation {
  const name = readdirSync(FIXTURE_DIR, 'utf8').find((file) =>
    file.startsWith(`raw-mission-${shortId}`),
  );
  if (name === undefined) throw new Error(`No fixture for conversation ${shortId}`);
  return ConversationSchema.parse(JSON.parse(readFileSync(new URL(name, FIXTURE_DIR), 'utf8')));
}

function loadList() {
  return ConversationListSchema.parse(
    JSON.parse(readFileSync(new URL('raw-list.json', FIXTURE_DIR), 'utf8')),
  );
}

function rejectionsOf(analysis: ReturnType<typeof analyzeConversation>) {
  return analysis.turns.flatMap((turn) =>
    turn.steps.filter(
      (step) => step.outcome === 'platform-rejected' || step.outcome === 'server-rejected',
    ),
  );
}

describe('brief A2 expected answers (hand-counted from raw JSON, 2026-10-17)', () => {
  it('brooch conversation: 1 PLATFORM on retrieve_evidence turn 4, 1 SERVER on update_shopping_state turn 2', () => {
    const conversation = loadConversation('4f1fa9f5');
    expect(conversation.messages).toHaveLength(10);
    const analysis = analyzeConversation(conversation);
    // A2b: verdict now also counts SERVER rejections by headline code.
    expect(analysis.verdict).toBe('FAILURES: 1 PLATFORM, 1 SERVER; SERVER: 1 quote_mismatch');

    const platform = analysis.turns
      .flatMap((turn) => turn.steps)
      .filter((step) => step.outcome === 'platform-rejected');
    expect(platform).toHaveLength(1);
    expect(platform[0]?.toolName).toBe('retrieve_evidence');
    expect(platform[0]?.errorText).toContain('is not valid under any of the given schemas');
    const turn4 = analysis.turns.find((turn) => turn.turn === 4);
    expect(
      turn4?.steps.some(
        (step) => step.outcome === 'platform-rejected' && step.toolName === 'retrieve_evidence',
      ),
    ).toBe(true);

    const failingInput = JSON.stringify(platform[0]?.failingInput) ?? '';
    expect(failingInput).toContain('Catalog_Motif');
    expect(failingInput).toContain('Flower');
    expect(failingInput).toContain('Clover');
    expect(failingInput).toContain('Halloween');

    const server = analysis.turns
      .flatMap((turn) => turn.steps)
      .filter((step) => step.outcome === 'server-rejected');
    expect(server).toHaveLength(1);
    expect(server[0]?.toolName).toBe('update_shopping_state');
    expect(server[0]?.status).toBe('invalid_input');
    const turn2 = analysis.turns.find((turn) => turn.turn === 2);
    expect(
      turn2?.steps.some(
        (step) => step.outcome === 'server-rejected' && step.toolName === 'update_shopping_state',
      ),
    ).toBe(true);
  });

  it('second conversation: 1 PLATFORM turn 3 and 4 SERVER (turn 2 x3, turn 3 x1), all update_shopping_state; reasoning part counted', () => {
    const conversation = loadConversation('1df505de');
    expect(conversation.messages).toHaveLength(6);
    const analysis = analyzeConversation(conversation);
    expect(analysis.verdict).toBe(
      'FAILURES: 1 PLATFORM, 4 SERVER; SERVER: 2 quote_mismatch, 1 UNSUPPORTED_FACT_ENCODING, 1 UNSUPPORTED_REQUIREMENT_ENCODING',
    );

    const server = analysis.turns
      .flatMap((turn) => turn.steps)
      .filter((step) => step.outcome === 'server-rejected');
    expect(server).toHaveLength(4);
    expect(server.every((step) => step.toolName === 'update_shopping_state')).toBe(true);
    const turn2 = analysis.turns.find((turn) => turn.turn === 2);
    expect(turn2?.steps.filter((step) => step.outcome === 'server-rejected')).toHaveLength(3);
    const turn3 = analysis.turns.find((turn) => turn.turn === 3);
    expect(turn3?.steps.filter((step) => step.outcome === 'server-rejected')).toHaveLength(1);

    const platform = analysis.turns
      .flatMap((turn) => turn.steps)
      .filter((step) => step.outcome === 'platform-rejected');
    expect(platform).toHaveLength(1);
    expect(platform[0]?.toolName).toBe('update_shopping_state');
    expect(analysis.turns.find((turn) => turn.turn === 3)?.steps).toContainEqual(
      expect.objectContaining({ outcome: 'platform-rejected' }),
    );

    expect(analysis.unknownPartTypes).toEqual({ reasoning: 1 });
  });

  it('third conversation: 0 PLATFORM, 4 SERVER in turn 1 (one update_shopping_state, three present_choices)', () => {
    const conversation = loadConversation('29a05964');
    expect(conversation.messages).toHaveLength(2);
    const analysis = analyzeConversation(conversation);
    expect(analysis.verdict).toBe(
      'FAILURES: 0 PLATFORM, 4 SERVER; SERVER: 3 semantic_presentation_invalid, 1 UNSUPPORTED_REQUIREMENT_ENCODING',
    );

    const turn1 = analysis.turns.find((turn) => turn.turn === 1);
    const server = turn1?.steps.filter((step) => step.outcome === 'server-rejected') ?? [];
    expect(server).toHaveLength(4);
    expect(server.map((step) => step.toolName).sort()).toEqual([
      'present_choices',
      'present_choices',
      'present_choices',
      'update_shopping_state',
    ]);
  });

  it('every rejection carries its full failing input', () => {
    for (const shortId of ['4f1fa9f5', '1df505de', '29a05964']) {
      const analysis = analyzeConversation(loadConversation(shortId));
      for (const step of rejectionsOf(analysis)) {
        expect(step.failingInput).not.toBeNull();
        expect(step.failingInput).not.toBeUndefined();
      }
    }
  });
});

describe('conversation list fixture', () => {
  it('parses real saved list responses and filters by since', () => {
    const list = loadList();
    expect(list.data.length).toBeGreaterThan(0);
    const first = list.data[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(activeWithin(first, 0)).toBe(true);
    expect(activeWithin(first, Date.now() + 365 * 24 * 3_600_000)).toBe(false);
  });
});

/**
 * Brief A2c: full tool inputs and outputs. The fixture is a real saved
 * conversation slice (messages 2-3 of the 1df505de capture): one shopper turn
 * whose assistant message carries successful retrieve_evidence results with
 * records and a successful present_choices result, next to server-rejected
 * update_shopping_state calls.
 */
describe('brief A2c: complete tool outputs and the turn filter', () => {
  const RETRIEVE_OBJECT_ID = '19G58A';
  const RETRIEVE_QUERY = 'gold hoop earrings office modest size around $150';

  function loadSlice(): Conversation {
    return ConversationSchema.parse(
      JSON.parse(readFileSync(new URL('raw-tools-slice-1df505de.json', FIXTURE_DIR), 'utf8')),
    );
  }

  function rawToolOutput(conversation: Conversation, toolCallId: string | null): unknown {
    for (const message of conversation.messages) {
      for (const part of message.parts) {
        if (part.type !== 'tool-result' || toolCallId === null || part.toolCallId !== toolCallId) {
          continue;
        }
        return (part as ToolResultPart).output ?? null;
      }
    }
    throw new Error(`no raw tool-result for toolCallId ${toolCallId}`);
  }

  function rawToolArgs(conversation: Conversation, toolCallId: string | null): unknown {
    for (const message of conversation.messages) {
      for (const part of message.parts) {
        if (part.type !== 'tool-call' || toolCallId === null || part.toolCallId !== toolCallId) {
          continue;
        }
        const call = part as ToolCallPart;
        return isRecord(call.args) && Object.keys(call.args).length > 0
          ? call.args
          : (call.rawArgs ?? null);
      }
    }
    throw new Error(`no raw tool-call for toolCallId ${toolCallId}`);
  }

  it('every tool result captures the complete output and complete input, equal to the raw record', () => {
    const conversation = loadSlice();
    const analysis = analyzeConversation(conversation);
    const steps = analysis.turns.flatMap((turn) => turn.steps);
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      if (step.outcome === 'no-result') {
        expect(step.toolOutput).toBeNull();
        continue;
      }
      expect(step.toolOutput).toEqual(rawToolOutput(conversation, step.toolCallId));
      expect(step.fullInput).toEqual(rawToolArgs(conversation, step.toolCallId));
    }
    const retrieve = steps.find(
      (step) => step.toolName === 'retrieve_evidence' && step.outcome === 'ok',
    );
    expect(retrieve?.toolOutput?.type).toBe('json');
    const present = steps.find(
      (step) => step.toolName === 'present_choices' && step.outcome === 'ok',
    );
    expect((present?.toolOutput?.value as Record<string, unknown>)?.['status']).toBe('staged');
  });

  it('--full text shows the complete input and complete output of successful calls; the default text does not', () => {
    const conversation = loadSlice();
    const analysis = analyzeConversation(conversation);
    const full = renderConversation(conversation, analysis, { full: true, noCap: true });
    expect(full).toContain('input (full):');
    expect(full).toContain(RETRIEVE_QUERY);
    expect(full).toContain('output (complete, json):');
    expect(full).toContain(RETRIEVE_OBJECT_ID);
    expect(full).toContain('"status": "staged"');
    const plain = renderConversation(conversation, analysis);
    // The A2 label "Failing input (full):" exists in the default text, so the
    // full-mode block is asserted with its exact indentation instead.
    expect(plain).not.toContain('\n      input (full):');
    expect(plain).not.toContain('output (complete, json):');
    expect(plain).not.toContain(RETRIEVE_OBJECT_ID);
  });

  it('one printed output is capped at the stated size with an explicit marker; --no-cap lifts the cap', () => {
    const conversation = loadSlice();
    const analysis = analyzeConversation(conversation);
    const capped = renderConversation(conversation, analysis, { full: true, maxOutputChars: 200 });
    const present = analysis.turns
      .flatMap((turn) => turn.steps)
      .find((step) => step.toolName === 'present_choices' && step.outcome === 'ok');
    expect(present?.toolOutput).not.toBeNull();
    if (present?.toolOutput === undefined || present.toolOutput === null) return;
    const omitted = JSON.stringify(present.toolOutput.value, null, 2).length - 200;
    expect(capped).toContain(`[truncated, ${omitted} characters omitted]`);
    const uncapped = renderConversation(conversation, analysis, {
      full: true,
      noCap: true,
      maxOutputChars: 200,
    });
    expect(uncapped).not.toContain('[truncated,');
    expect(uncapped).toContain(RETRIEVE_OBJECT_ID);
  });

  it('--turn N shows one turn in text and json and errors on an unknown turn', () => {
    const conversation = loadConversation('1df505de');
    const analysis = analyzeConversation(conversation);
    const text = renderConversation(conversation, analysis, { turn: 2 });
    expect(text).toContain('Turn 2 - shopper:');
    expect(text).not.toContain('Turn 3 - shopper:');
    expect(text).toContain('Turn filter: 2 (conversation has 3 turns)');
    const json = conversationJson(conversation, analysis, { turn: 2 }) as {
      turns: Array<{ turn: number }>;
    };
    expect(json.turns).toHaveLength(1);
    expect(json.turns[0]?.turn).toBe(2);
    expect(() => renderConversation(conversation, analysis, { turn: 9 })).toThrow('no turn 9');
  });

  it('--json: the full option adds complete fullInput and toolOutput; without it the step shape is unchanged', () => {
    const conversation = loadSlice();
    const analysis = analyzeConversation(conversation);
    const plain = conversationJson(conversation, analysis) as {
      turns: Array<{ steps: Array<Record<string, unknown>> }>;
    };
    const plainStep = plain.turns[0]?.steps[0];
    expect(plainStep).toBeDefined();
    if (plainStep === undefined) return;
    expect('fullInput' in plainStep).toBe(false);
    expect('toolOutput' in plainStep).toBe(false);
    const full = conversationJson(conversation, analysis, { full: true }) as {
      turns: Array<{ steps: Array<Record<string, unknown>> }>;
    };
    const fullStep = full.turns[0]?.steps[0];
    expect(fullStep).toBeDefined();
    if (fullStep === undefined) return;
    expect(fullStep['fullInput']).toEqual(
      rawToolArgs(conversation, fullStep['toolCallId'] as string),
    );
    expect(fullStep['toolOutput']).toEqual(
      rawToolOutput(conversation, fullStep['toolCallId'] as string),
    );
  });
});
