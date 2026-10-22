import { describe, expect, it } from 'vitest';
import {
  validateConciergeSession,
  type SourceBoundProduct,
} from '../../shared/concierge/sessionContract.js';
import {
  createSessionPersistence,
  LEGACY_SESSION_KEY,
  LEGACY_BACKUP_KEY,
  V3_SESSION_KEY,
} from '../../src/concierge/sessionPersistence.js';

class Memory {
  values = new Map<string, string>();
  writes = 0;
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.writes++;
    this.values.set(k, v);
  }
}
const brief = (m = 'm') => ({
  version: 2,
  missionId: m,
  revision: 0,
  facts: [],
  processedTurns: [],
  tombstones: [],
  events: [],
});
const v1 = () =>
  JSON.stringify({
    version: 1,
    missionId: 'm',
    brief: brief(),
    products: [
      {
        product: {
          raw: { objectID: 'saved-1', title: 'Saved ring', image: 'img', Pricing_ActivePrice: 99 },
        },
        quantity: 2,
        observedAt: '2026-10-06',
      },
    ],
    selectionRecords: [],
    compareIds: ['saved-1'],
  });
describe('simplified session contract', () => {
  it('migrates a v1 session to a fresh selection set without inventing evidence', () => {
    const s = new Memory();
    s.values.set(LEGACY_SESSION_KEY, v1());
    const p = createSessionPersistence(s, 'm');
    const loaded = p.load();
    expect(loaded.state).not.toBeNull();
    // Simplification 2026-10-22 (D1, D2): legacy saved products and compare
    // selections are dropped, not carried into the new session.
    const migrated = loaded.state as unknown as { selectionRecords: unknown[] };
    expect(migrated.selectionRecords).toEqual([]);
    expect(s.writes).toBe(0);
  });
  it('backs up exact v1 bytes on first successful v3 mutation', () => {
    const s = new Memory();
    const raw = v1();
    s.values.set(LEGACY_SESSION_KEY, raw);
    const p = createSessionPersistence(s, 'm');
    p.load().state;
    p.commitMutation((state) => ({ ...state, brief: { ...state.brief, revision: 1 } }));
    expect(s.values.get(LEGACY_BACKUP_KEY)).toBe(raw);
    expect(s.values.get(V3_SESSION_KEY)).toBeTruthy();
  });
  const base = () => ({
    version: 3,
    missionId: 'm',
    brief: {
      version: 3,
      missionId: 'm',
      revision: 0,
      facts: [],
      processedTurns: [],
      tombstones: [],
      events: [],
    },
    selectionRecords: [],
    receipts: [],
  });
  const boundProduct = (objectID: string, evidenceRef = `ref-${objectID}`) => ({
    sourceIndex: 'prod_catalog' as const,
    objectID,
    contentHash: `hash-${objectID}`,
    evidenceRef,
    binding: 'evidence_bound' as const,
    raw: { objectID, Catalog_TitleDescription: `Product ${objectID}` },
    quantity: 1,
    observedAt: '2026-10-06T12:00:00.000Z',
  });
  const legacyProduct = (objectID: string) => ({
    sourceIndex: 'prod_catalog' as const,
    objectID,
    contentHash: null,
    evidenceRef: null,
    binding: 'legacy_unbound' as const,
    raw: { objectID, Catalog_TitleDescription: `Legacy ${objectID}` },
    quantity: 1,
    observedAt: null,
  });
  it('keeps identity-verified selection records with or without evidence', () => {
    const bound = boundProduct('selected-1');
    const parsed = validateConciergeSession({
      ...base(),
      selectionRecords: [bound, legacyProduct('staged-1')],
    });
    expect(parsed?.selectionRecords).toHaveLength(2);
    expect(parsed?.evidence).toBeUndefined();
  });
  it('requires raw object identity for legacy-unbound products', () => {
    const legacy = { ...legacyProduct('staged-1'), raw: { objectID: 'other' } };
    expect(validateConciergeSession({ ...base(), selectionRecords: [legacy] })).toBeNull();
  });
  it('validates every evidence entry against the exact selection record', () => {
    const selected = boundProduct('selected-1');
    expect(
      validateConciergeSession({
        ...base(),
        selectionRecords: [selected],
        evidence: [
          {
            evidenceRef: selected.evidenceRef,
            sourceIndex: 'prod_catalog',
            objectID: selected.objectID,
            contentHash: selected.contentHash,
          },
        ],
      }),
    ).not.toBeNull();
    expect(
      validateConciergeSession({
        ...base(),
        selectionRecords: [selected],
        evidence: [
          {
            evidenceRef: selected.evidenceRef,
            sourceIndex: 'prod_catalog',
            objectID: selected.objectID,
            contentHash: 'different',
          },
        ],
      }),
    ).toBeNull();
    expect(
      validateConciergeSession({
        ...base(),
        selectionRecords: [selected],
        evidence: [
          {
            evidenceRef: 'ref-unknown',
            sourceIndex: 'prod_catalog',
            objectID: 'unknown-id',
            contentHash: 'hash-x',
          },
        ],
      }),
    ).toBeNull();
  });
  it('rejects the retired save, compare, view and proposal fields at the contract layer', () => {
    expect(validateConciergeSession({ ...base(), products: [] })).toBeNull();
    expect(validateConciergeSession({ ...base(), compareIds: ['x'] })).toBeNull();
    expect(validateConciergeSession({ ...base(), activeView: 'discover' })).toBeNull();
    expect(validateConciergeSession({ ...base(), committedProposal: null })).toBeNull();
  });
  it('declares the same discriminated product fields that runtime validation requires', () => {
    const bound: SourceBoundProduct = boundProduct('bound');
    const legacy: SourceBoundProduct = legacyProduct('legacy');
    expect(bound.binding).toBe('evidence_bound');
    expect(bound.raw.objectID).toBe('bound');
    expect(legacy.binding).toBe('legacy_unbound');
    expect(legacy.contentHash).toBeNull();
  });
  it.each([
    [
      'blog source',
      {
        sourceIndex: 'blog',
        objectID: 'x',
        contentHash: 'h',
        evidenceRef: 'e',
        binding: 'evidence_bound',
        raw: { objectID: 'x' },
        quantity: 1,
        observedAt: '',
      },
    ],
    [
      'missing hash',
      {
        sourceIndex: 'prod_catalog',
        objectID: 'x',
        contentHash: null,
        evidenceRef: null,
        binding: 'evidence_bound',
        raw: { objectID: 'x' },
        quantity: 1,
        observedAt: '',
      },
    ],
    [
      'raw mismatch',
      {
        sourceIndex: 'prod_catalog',
        objectID: 'x',
        contentHash: 'h',
        evidenceRef: 'e',
        binding: 'evidence_bound',
        raw: { objectID: 'other' },
        quantity: 1,
        observedAt: '',
      },
    ],
    [
      'quantity zero',
      {
        sourceIndex: 'prod_catalog',
        objectID: 'x',
        contentHash: 'h',
        evidenceRef: 'e',
        binding: 'evidence_bound',
        raw: { objectID: 'x' },
        quantity: 0,
        observedAt: '',
      },
    ],
    [
      'quantity eleven',
      {
        sourceIndex: 'prod_catalog',
        objectID: 'x',
        contentHash: 'h',
        evidenceRef: 'e',
        binding: 'evidence_bound',
        raw: { objectID: 'x' },
        quantity: 11,
        observedAt: '',
      },
    ],
  ])('rejects %s selection records', (_name, product) =>
    expect(validateConciergeSession({ ...base(), selectionRecords: [product] })).toBeNull(),
  );
  it('rejects duplicate ids, over-cap selections and malformed receipts', () => {
    const p = {
      sourceIndex: 'prod_catalog',
      objectID: 'x',
      contentHash: 'h',
      evidenceRef: 'e',
      binding: 'evidence_bound',
      raw: { objectID: 'x' },
      quantity: 1,
      observedAt: '',
    };
    expect(validateConciergeSession({ ...base(), selectionRecords: [p, p] })).toBeNull();
    expect(
      validateConciergeSession({
        ...base(),
        selectionRecords: Array.from({ length: 13 }, (_, i) => ({
          ...p,
          objectID: String(i),
          raw: { objectID: String(i) },
        })),
      }),
    ).toBeNull();
    expect(validateConciergeSession({ ...base(), receipts: [{ bad: true }] })).toBeNull();
  });
  it('reloads a stored evidence record and clears everything on reset', async () => {
    const s = new Memory();
    s.values.set(LEGACY_SESSION_KEY, v1());
    const p = createSessionPersistence(s, 'm');
    const selected = boundProduct('selected-reset');
    p.commitMutation((state) => ({
      ...state,
      selectionRecords: [selected],
      evidence: [
        {
          evidenceRef: selected.evidenceRef,
          sourceIndex: selected.sourceIndex,
          objectID: selected.objectID,
          contentHash: selected.contentHash,
        },
      ],
    }));
    const reloaded = createSessionPersistence(s, 'm');
    const reloadedState = validateConciergeSession(reloaded.load().state);
    expect(reloadedState?.selectionRecords[0]).toMatchObject({
      objectID: 'selected-reset',
      observedAt: '2026-10-06T12:00:00.000Z',
    });
    const reset = await reloaded.resetMission('new');
    expect(reset.ok).toBe(true);
    if (reset.ok) {
      const resetState = validateConciergeSession(reset.state);
      expect(resetState?.selectionRecords).toEqual([]);
      expect(resetState?.evidence).toEqual([]);
    }
  });
});
