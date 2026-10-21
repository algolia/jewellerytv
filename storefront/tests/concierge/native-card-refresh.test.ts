import { describe, expect, it } from 'vitest';
import { createBriefStateV3 } from '../../shared/briefState.js';
import { createExactProductRefresh } from '../../src/concierge/exactProductRefresh.js';
import { createSessionStore } from '../../src/concierge/sessionStore.js';
import { V3_SESSION_KEY, type StorageLike } from '../../src/concierge/sessionPersistence.js';
import type { RetrieveEvidenceResult } from '../../shared/concierge/retrieval/types.js';

/* H2 (briefs/H2-fixer-card-click-banner-and-images): clicking a native card
 * refreshes through the exact read path. Native cards are component state, so
 * the clicked id may be absent from the session store — the old "known" gate
 * rejected it before any request and showed the red refresh banner. The gate
 * on id SHAPE and batch size stays; identity is enforced on the returned
 * record (its own objectID must match the request), and an adopted record
 * enters the store as legacy_unbound exactly like H1 staging. */

type Request = {
  missionId: string;
  expectedRevision: number;
  turnId: string;
  exactObjectIDs: string[];
};
class Storage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const record = (objectID: string, price = 125) => ({
  objectID,
  Catalog_TitleDescription: `Product ${objectID}`,
  Pricing_ActivePrice: price,
  Inventory_InStock: true,
  Media_Images: [`https://images.jtv.com/jewelry/JTV-${objectID}-1.jpg`],
});

function okResult(request: Request, prices: Record<string, number> = {}): RetrieveEvidenceResult {
  return {
    status: 'ok',
    source: 'prod_catalog',
    missionId: request.missionId,
    revision: request.expectedRevision,
    expectedRevision: request.expectedRevision,
    turnId: request.turnId,
    effectiveFilters: [],
    unresolved: [],
    records: request.exactObjectIDs.map((objectID) => {
      const hash = `hash-${objectID}`;
      return {
        source: 'prod_catalog' as const,
        objectID,
        contentHash: hash,
        evidenceRef: `prod_catalog/${encodeURIComponent(objectID)}/${hash}`,
        retrievedAt: '2026-10-21T00:00:00.000Z',
        record: record(objectID, prices[objectID] ?? 130),
      };
    }),
  };
}

const zeroHits = (request: Request): RetrieveEvidenceResult => ({
  status: 'zero_hits',
  source: 'prod_catalog',
  missionId: request.missionId,
  revision: request.expectedRevision,
  expectedRevision: request.expectedRevision,
  turnId: request.turnId,
  effectiveFilters: [],
  unresolved: [],
  records: [],
});

function setup(extras: Record<string, unknown> = {}) {
  const storage = new Storage();
  storage.setItem(
    V3_SESSION_KEY,
    JSON.stringify({
      version: 3,
      missionId: 'mission',
      brief: createBriefStateV3('mission'),
      products: [],
      selectionRecords: [],
      compareIds: [],
      activeView: 'discover',
      receipts: [],
      ...extras,
    }),
  );
  const store = createSessionStore(storage, 'unused');
  let calls = 0;
  let responder: (request: Request) => RetrieveEvidenceResult = (request) =>
    okResult(request);
  const refresh = createExactProductRefresh(store, async (body) => {
    calls += 1;
    return responder(body as Request);
  });
  return {
    storage,
    store,
    refresh,
    calls: () => calls,
    respondWith: (next: (request: Request) => RetrieveEvidenceResult) => {
      responder = next;
    },
  };
}

describe('native card refresh without the known-id gate (H2)', () => {
  it('refreshes and adopts a card id the store does not hold, with no banner', async () => {
    const { store, refresh, calls } = setup();
    const outcome = await refresh.refreshProducts(['VG271']);
    expect(calls()).toBe(1);
    expect(refresh.getError()).toBe('');
    expect(outcome.refreshed).toEqual(['VG271']);
    expect(outcome.missing).toEqual([]);
    const state = store.getSnapshot()!;
    expect(state.selectionRecords.map((item) => item.objectID)).toEqual(['VG271']);
    expect(state.selectionRecords[0].binding).toBe('legacy_unbound');
    expect(state.selectionRecords[0].contentHash).toBeNull();
    expect(state.selectionRecords[0].raw.Pricing_ActivePrice).toBe(130);
  });

  it('keeps the legacy_unbound shape valid for the persisted session schema', async () => {
    const { storage, refresh } = setup();
    await refresh.refreshProducts(['VG271']);
    const stored = JSON.parse(storage.getItem(V3_SESSION_KEY) ?? '{}');
    expect(stored.selectionRecords?.[0]?.contentHash ?? null).toBeNull();
    expect(stored.selectionRecords?.[0]?.evidenceRef ?? null).toBeNull();
  });

  it('reports an unresolved unknown id as missing without a banner', async () => {
    const { refresh, respondWith, calls } = setup();
    respondWith(zeroHits);
    const outcome = await refresh.refreshProducts(['VG271']);
    expect(calls()).toBe(1);
    expect(refresh.getError()).toBe('');
    expect(outcome.refreshed).toEqual([]);
    expect(outcome.missing).toEqual(['VG271']);
  });

  it('still raises the banner when a held record cannot be refreshed', async () => {
    const saved = {
      sourceIndex: 'prod_catalog',
      objectID: 'SAVED1',
      raw: record('SAVED1'),
      quantity: 1,
      observedAt: null,
      binding: 'legacy_unbound',
      contentHash: null,
      evidenceRef: null,
    };
    const { refresh, respondWith } = setup({ products: [saved], selectionRecords: [saved] });
    respondWith(zeroHits);
    const outcome = await refresh.refreshProducts(['SAVED1']);
    expect(refresh.getError()).toMatch(/could not be refreshed/i);
    expect(outcome.missing).toEqual(['SAVED1']);
  });

  it('does not adopt a record whose own objectID does not match the request', async () => {
    const { store, refresh, respondWith } = setup();
    respondWith((request) => {
      const result = okResult(request);
      result.records[0] = {
        ...result.records[0],
        record: record('OTHER-ID'),
      };
      return result;
    });
    const outcome = await refresh.refreshProducts(['VG271']);
    expect(store.getSnapshot()!.selectionRecords).toHaveLength(0);
    expect(refresh.getError()).toBe('');
    expect(outcome.missing).toEqual(['VG271']);
  });

  it('still refuses oversized or malformed requests before any fetch', async () => {
    const { refresh, calls } = setup();
    await refresh.refreshProducts(Array.from({ length: 13 }, (_, i) => `ID${i}`));
    expect(calls()).toBe(0);
    expect(refresh.getError()).toMatch(/could not be refreshed/i);
    const second = setup();
    await second.refresh.refreshProducts(['bad id with spaces']);
    expect(second.calls()).toBe(0);
    expect(second.refresh.getError()).toMatch(/could not be refreshed/i);
  });
});
