import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeConversation } from '../scripts/conversation-reader/analysis.ts';
import {
  ConversationSchema,
  type Conversation,
  type ToolResultPart,
} from '../scripts/conversation-reader/schema.ts';
import { conversationJson, renderConversation } from '../scripts/conversation-reader/render.ts';
import {
  NO_EXPLANATION_HEADLINE,
  reasonHeadline,
} from '../scripts/conversation-reader/rejection.ts';

const FIXTURE_DIR = new URL('./fixtures/conversation-reader/', import.meta.url);

function loadConversation(shortId: string): Conversation {
  const name = readdirSync(FIXTURE_DIR, 'utf8').find((file) =>
    file.startsWith(`raw-mission-${shortId}`),
  );
  if (name === undefined) throw new Error(`No fixture for conversation ${shortId}`);
  return ConversationSchema.parse(JSON.parse(readFileSync(new URL(name, FIXTURE_DIR), 'utf8')));
}

/**
 * Brief A2b expected answers (hand-read from the raw JSON by the architect
 * session, 2026-10-18). Every row is asserted from the real saved fixtures —
 * no hand-written mocks. Headline order rule: `failure` code+message first,
 * then joined `reasons` with the first path and its code, then the literal
 * fallback. Verdict counts sort by count descending, ties alphabetical.
 */
describe('brief A2b: complete server response and reason headline for every SERVER rejection', () => {
  function loadAnalysis(shortId: string) {
    const conversation = loadConversation(shortId);
    const analysis = analyzeConversation(conversation);
    const steps = analysis.turns
      .flatMap((turn) => turn.steps)
      .filter((step) => step.outcome === 'server-rejected');
    return { conversation, analysis, steps };
  }

  function rawServerValue(conversation: Conversation, toolCallId: string | null): unknown {
    for (const message of conversation.messages) {
      for (const part of message.parts) {
        if (part.type !== 'tool-result' || part.toolCallId !== toolCallId) continue;
        const result = part as ToolResultPart;
        return result.output?.value;
      }
    }
    throw new Error(`no raw tool-result for toolCallId ${toolCallId}`);
  }

  it('every server rejection carries the complete response, byte-for-byte from the raw API data', () => {
    for (const shortId of ['4f1fa9f5', '1df505de', '29a05964']) {
      const { conversation, steps } = loadAnalysis(shortId);
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.serverResponse).not.toBeNull();
        expect(step.serverResponse).toEqual(rawServerValue(conversation, step.toolCallId));
      }
    }
  });

  it('brooch turn 2: headline `quote_mismatch: sourceQuote is not an exact substring...`, failure object with currentRevision 0', () => {
    const { analysis, steps } = loadAnalysis('4f1fa9f5');
    expect(steps).toHaveLength(1);
    const step = steps[0];
    expect(step?.toolName).toBe('update_shopping_state');
    expect(step?.reasonHeadline).toBe(
      'quote_mismatch: sourceQuote is not an exact substring of the current shopper message',
    );
    expect(step?.reasonCode).toBe('quote_mismatch');
    expect(step?.serverResponse?.['failure']).toEqual({
      code: 'quote_mismatch',
      message: 'sourceQuote is not an exact substring of the current shopper message',
      currentRevision: 0,
    });
    expect(Object.keys(step?.serverResponse ?? {})).toEqual(
      expect.arrayContaining([
        'appliedFactIds',
        'currentStateDigest',
        'retractedFactIds',
        'failure',
        'missionId',
        'operationId',
        'previousRevision',
        'revision',
        'status',
      ]),
    );
    expect(analysis.verdict).toBe('FAILURES: 1 PLATFORM, 1 SERVER; SERVER: 1 quote_mismatch');
  });

  it('1df505de: four headlines in table order (budget encoding, two quote mismatches, exclusion); long message truncated in the headline only, full text in the response', () => {
    const { analysis, steps } = loadAnalysis('1df505de');
    expect(steps).toHaveLength(4);
    expect(steps[0]?.toolName).toBe('update_shopping_state');
    expect(steps[0]?.reasonHeadline).toContain('UNSUPPORTED_REQUIREMENT_ENCODING:call_');
    expect(steps[0]?.reasonHeadline).toContain(
      'an explicit budget requirement with a money value has no supported catalogue encoding',
    );
    expect(steps[0]?.reasonCode).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    const budgetFailure = steps[0]?.serverResponse?.['failure'];
    expect(budgetFailure && (budgetFailure as Record<string, unknown>)['message']).toEqual(
      expect.stringContaining('Supported alternatives: an exact USD money bound'),
    );
    expect(steps[1]?.reasonHeadline).toBe(
      'quote_mismatch: sourceQuote is not an exact substring of the current shopper message',
    );
    expect(steps[2]?.reasonHeadline).toBe(
      'quote_mismatch: sourceQuote is not an exact substring of the current shopper message',
    );
    expect(steps[3]?.reasonHeadline).toBe(
      'UNSUPPORTED_FACT_ENCODING: UNSUPPORTED_FACT_ENCODING:call_fExFMT8mk3mfxVHVnzOFl1H5-fact-1:exclusion',
    );
    expect(steps[3]?.reasonCode).toBe('UNSUPPORTED_FACT_ENCODING');
    expect(analysis.verdict).toBe(
      'FAILURES: 1 PLATFORM, 4 SERVER; SERVER: 2 quote_mismatch, 1 UNSUPPORTED_FACT_ENCODING, 1 UNSUPPORTED_REQUIREMENT_ENCODING',
    );
  });

  it('29a05964: gemstone encoding headline; three present_choices rejections headline the joined reasons with the first path and code, and keep paths and expected unmodified', () => {
    const { analysis, steps } = loadAnalysis('29a05964');
    expect(steps).toHaveLength(4);
    const update = steps.find((step) => step.toolName === 'update_shopping_state');
    expect(update?.reasonHeadline).toContain(
      'UNSUPPORTED_REQUIREMENT_ENCODING:call_8QOnuyaxMnIOBSifQ5CmdP9X-fact-4:gemstone:text: an explicit gemstone requirement with a text value has no supported catalogue encoding',
    );
    expect(update?.reasonCode).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');

    const present = steps.filter((step) => step.toolName === 'present_choices');
    expect(present).toHaveLength(3);
    for (const step of present) {
      expect(step.reasonHeadline).toBe(
        'semantic_presentation_invalid (first path body.groups.0.items: too_big)',
      );
      expect(step.reasonCode).toBe('semantic_presentation_invalid');
      expect(step.serverResponse?.['paths']).toEqual([
        { path: 'body.groups.0.items', code: 'too_big' },
      ]);
      expect(step.serverResponse?.['expected']).toEqual([
        'body.kind=product_groups with mode three_style_grid (exactly three distinct style columns, two or three items each) or mode focused_choice (one confirmed narrow column), and alternatives=null',
        'body.kind=complete_looks with groups=null and non-empty alternatives',
      ]);
    }
    expect(analysis.verdict).toBe(
      'FAILURES: 0 PLATFORM, 4 SERVER; SERVER: 3 semantic_presentation_invalid, 1 UNSUPPORTED_REQUIREMENT_ENCODING',
    );
  });

  it('text output shows the headline, every field of the response (noisy fields collapsed on one line), and the platform rejection unchanged', () => {
    const conversation = loadConversation('1df505de');
    const analysis = analyzeConversation(conversation);
    const text = renderConversation(conversation, analysis);
    expect(text).toContain(
      'reason: quote_mismatch: sourceQuote is not an exact substring of the current shopper message',
    );
    expect(text).toContain('reason: UNSUPPORTED_REQUIREMENT_ENCODING:');
    expect(text).toContain('reason: UNSUPPORTED_FACT_ENCODING:');
    expect(text).toContain('server response (complete):');
    expect(text).toContain(
      'Supported alternatives: an exact USD money bound (operator lt, lte, gt or gte with basis total or per_item)',
    );
    for (const key of [
      'status',
      'revision',
      'failure',
      'missionId',
      'operationId',
      'previousRevision',
      'appliedFactIds',
      'currentStateDigest',
      'retractedFactIds',
    ]) {
      expect(text).toContain(`${key}:`);
    }
    expect(text).toMatch(/appliedFactIds: \[.*\]$/m);
    // Top-level field names print bare; nested objects render as pretty JSON (quoted keys, brace on its own line).
    expect(text).toMatch(/failure:\n\s+\{\n\s+"code": /);
    expect(text).toContain('platform error:');
  });

  it('--json output carries the complete unmodified server response (paths and expected included) for the rejected present_choices steps', () => {
    const conversation = loadConversation('29a05964');
    const analysis = analyzeConversation(conversation);
    const json = conversationJson(conversation, analysis) as {
      turns: Array<{
        steps: Array<{
          outcome: string;
          toolCallId: string | null;
          serverResponse: Record<string, unknown> | null;
          reasonHeadline: string | null;
          reasonCode: string | null;
        }>;
      }>;
    };
    const rejected = json.turns
      .flatMap((turn) => turn.steps)
      .filter(
        (step) =>
          step.outcome === 'server-rejected' && step.serverResponse?.['paths'] !== undefined,
      );
    expect(rejected).toHaveLength(3);
    for (const step of rejected) {
      expect(step.serverResponse).toEqual(rawServerValue(conversation, step.toolCallId));
      expect(step.reasonHeadline).toBe(
        'semantic_presentation_invalid (first path body.groups.0.items: too_big)',
      );
      expect(step.reasonCode).toBe('semantic_presentation_invalid');
    }
  });

  it('fallback: a response with neither failure nor reasons gets the literal fallback headline (no fixture exercises this)', () => {
    expect(reasonHeadline({ status: 'invalid_input' })).toBe(NO_EXPLANATION_HEADLINE);
    expect(reasonHeadline({ status: 'invalid_input', reasons: [], paths: [] })).toBe(
      NO_EXPLANATION_HEADLINE,
    );
  });
});
