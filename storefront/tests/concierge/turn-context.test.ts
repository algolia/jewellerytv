import { describe, expect, it } from 'vitest';
import { applyBriefOperationsV3, createBriefStateV3 } from '../../shared/briefState.js';
import { validateConciergeSession } from '../../shared/concierge/sessionContract.js';
import { buildTurnContext } from '../../src/concierge/turnContext.js';

const encoder = new TextEncoder();
const fact = (index: number, value = `Preference ${index}`) => ({
  type: 'add' as const,
  fact: {
    id: `fact-${index}`,
    field: 'style' as const,
    value: { kind: 'text' as const, text: value },
    scope: { kind: 'mission' as const, key: null },
    strength: 'preference' as const,
    certainty: 'explicit' as const,
    origin: 'ui' as const,
    evidence: { messageId: `message-${index}`, quote: value, explicit: true, verified: true },
  },
});
function session(values: string[]) {
  const brief = applyBriefOperationsV3(createBriefStateV3('mission'), {
    missionId: 'mission',
    expectedRevision: 0,
    turnId: 'accepted-turn',
    operations: values.map((value, index) => fact(index, value)),
  });
  const record = {
    sourceIndex: 'prod_catalog',
    objectID: 'watch-1',
    binding: 'evidence_bound',
    contentHash: 'hash-1',
    evidenceRef: 'ref-1',
    raw: { objectID: 'watch-1' },
    quantity: 1,
    observedAt: null,
  };
  return validateConciergeSession({
    version: 3,
    missionId: 'mission',
    brief,
    selectionRecords: [record],
    receipts: [],
    evidence: [
      {
        evidenceRef: 'ref-1',
        sourceIndex: 'prod_catalog',
        objectID: 'watch-1',
        contentHash: 'hash-1',
      },
    ],
  })!;
}
function decoded(context: Record<string, string>) {
  return JSON.parse(
    Array.from(
      { length: Number(context.shoppingStateChunks) },
      (_, index) => context[`shoppingState${index}`],
    ).join(''),
  );
}

describe('latest-turn shopping context', () => {
  it('carries accepted facts and nothing from the retired save and compare surfaces', () => {
    const context = buildTurnContext(
      session(['blue dial', 'metal bracelet', 'restrained size', 'under $300', 'watch']),
      { page: 'home' },
      { turnId: 'turn-2', sourceMessageId: 'shopper-2' },
    );
    const state = decoded(context);
    expect(state.facts).toHaveLength(5);
    expect(state.factColumns).toBe('id,field,value,scope,strength,certainty,status');
    expect(state.facts[0].slice(3)).toEqual([['m', null], 'p', 'e', 'a']);
    // Simplification 2026-10-22 (D1 to D3): saved lists, compare selections and
    // the active view no longer exist, so the context cannot echo them.
    expect('saved' in state).toBe(false);
    expect('compareIds' in state).toBe(false);
    expect('activeView' in state).toBe(false);
    expect('currentGroups' in state).toBe(false);
    expect(context).toMatchObject({
      page: 'home',
      missionId: 'mission',
      turnId: 'turn-2',
    });
    expect('briefRevision' in context).toBe(false);
    expect(Object.values(context).every((value) => encoder.encode(value).length <= 1024)).toBe(
      true,
    );
    expect(encoder.encode(JSON.stringify(context)).length).toBeLessThanOrEqual(4096);
  });
  it('keeps multibyte preference values intact across chunks', () => {
    const value = '💎'.repeat(200);
    expect(
      decoded(buildTurnContext(session([value]), {}, { turnId: 't', sourceMessageId: 'u' }))
        .facts[0][2].text,
    ).toBe(value);
  });
  it('keeps a long accepted brief within the bounded field shape', () => {
    const current = session(
      Array.from({ length: 11 }, (_, index) => `Preference ${index}: ${'blue '.repeat(8)}`),
    );
    current.brief.facts.forEach((item, index) => {
      item.id = `call_${'x'.repeat(24)}-fact-${index}`;
    });
    const context = buildTurnContext(
      current,
      { route: '/' },
      { turnId: `turn-${'x'.repeat(36)}`, sourceMessageId: `shopper-${'x'.repeat(36)}` },
    );
    const state = decoded(context);
    expect(state.facts).toHaveLength(11);
    expect(encoder.encode(JSON.stringify(context)).length).toBeLessThanOrEqual(4096);
  });
  it('does not reject a valid multi-turn brief solely for exceeding 4 KB total', () => {
    const current = session(
      Array.from({ length: 30 }, (_, index) => `Preference ${index}: ${'blue '.repeat(15)}`),
    );
    current.brief.facts.forEach((item, index) => {
      item.id = `call_${'x'.repeat(24)}-fact-${index}`;
    });
    const context = buildTurnContext(
      current,
      { route: '/' },
      { turnId: `turn-${'x'.repeat(36)}`, sourceMessageId: `shopper-${'x'.repeat(36)}` },
    );
    expect(decoded(context).facts).toHaveLength(30);
    expect(encoder.encode(JSON.stringify(context)).length).toBeGreaterThan(4096);
    expect(Object.values(context).every((value) => encoder.encode(value).length <= 1024)).toBe(
      true,
    );
  });
  it('rejects an oversized brief instead of silently omitting it', () => {
    const current = session(['seed']);
    current.brief.facts = Array.from({ length: 80 }, (_, index) => ({
      ...current.brief.facts[0],
      id: `fact-${index}`,
      value: { kind: 'text' as const, text: 'x'.repeat(400) },
    }));
    expect(() => buildTurnContext(current, {}, { turnId: 't', sourceMessageId: 'u' })).toThrow(
      'exceeds',
    );
  });
});
