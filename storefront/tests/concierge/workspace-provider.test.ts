import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBriefStateV3 } from '../../shared/briefState';
type RefreshRequest = {
  missionId: string;
  expectedRevision: number;
  turnId: string;
  exactObjectIDs: string[];
};
import { createConciergeWorkspaceSession } from '../../src/concierge/ConciergeWorkspaceProvider';
import { V3_SESSION_KEY, type StorageLike } from '../../src/concierge/sessionPersistence';
import { ProductWorkspace } from '../../src/ProductWorkspace';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function session(binding: 'evidence_bound' | 'legacy_unbound' = 'evidence_bound') {
  const raw = {
    objectID: 'saved-1',
    Catalog_TitleDescription: 'Saved necklace',
    Pricing_ActivePrice: 125,
    Media_Images: [],
  };
  return {
    version: 3,
    missionId: 'mission-provider',
    brief: createBriefStateV3('mission-provider'),
    products: [
      {
        sourceIndex: 'prod_catalog',
        objectID: 'saved-1',
        raw,
        quantity: 1,
        observedAt: null,
        binding,
        contentHash: binding === 'evidence_bound' ? 'hash-1' : null,
        evidenceRef: binding === 'evidence_bound' ? 'ref-1' : null,
      },
    ],
    selectionRecords: [
      {
        sourceIndex: 'prod_catalog',
        objectID: 'saved-1',
        raw,
        quantity: 1,
        observedAt: null,
        binding,
        contentHash: binding === 'evidence_bound' ? 'hash-1' : null,
        evidenceRef: binding === 'evidence_bound' ? 'ref-1' : null,
      },
    ],
    compareIds: ['saved-1'],
    activeView: 'compare',
    receipts: [],
    evidence:
      binding === 'evidence_bound'
        ? [
            {
              evidenceRef: 'ref-1',
              sourceIndex: 'prod_catalog',
              objectID: 'saved-1',
              contentHash: 'hash-1',
            },
          ]
        : [],
  };
}

describe('v3 workspace session adapter', () => {
  it('labels a persisted Discover proposal as previous after the accepted brief changes', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      V3_SESSION_KEY,
      JSON.stringify({
        ...session(),
        brief: { ...createBriefStateV3('mission-provider'), revision: 1 },
        activeView: 'discover',
        committedProposal: {
          missionId: 'mission-provider',
          stateRevision: 0,
          evidenceBatchRevision: 0,
          turnId: 'old-turn',
          proposalId: 'old-proposal',
          kind: 'product_groups',
          mode: null,
          groups: [
            {
              title: 'Earring style: Hoop',
              itemSubtotalCents: null,
              lines: [
                {
                  evidenceRef: 'ref-1',
                  objectID: 'saved-1',
                  contentHash: 'hash-1',
                  quantity: 1,
                  componentSlot: 'earrings',
                  explanation: 'Previously supported choice',
                  unitPriceCents: 12500,
                  lineSubtotalCents: 12500,
                },
              ],
            },
          ],
          combinedItemSubtotalCents: null,
          assessment: { perItem: 'accepted', total: 'accepted', reasons: [] },
        },
      }),
    );
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
    });
    expect(adapter.getModel().discoveries).toHaveLength(1);
    expect(adapter.getModel().discoveriesStale).toBe(true);
    expect(
      renderToStaticMarkup(createElement(ProductWorkspace, { model: adapter.getModel() })),
    ).toContain('Showing your previous choices.');
  });

  it('rehydrates Saved-only Compare from the canonical store', () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(session()));
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
    });
    const model = adapter.getModel();
    expect(model.activeView).toBe('compare');
    expect(model.compareIds).toEqual(['saved-1']);
    expect(model.products[0].product.id).toBe('saved-1');
  });
  it('withholds Discover cards until every displayed product passes item eligibility', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      V3_SESSION_KEY,
      JSON.stringify({
        ...session(),
        committedProposal: {
          missionId: 'mission-provider',
          stateRevision: 0,
          evidenceBatchRevision: 0,
          turnId: 'uncertain-turn',
          proposalId: 'uncertain-proposal',
          kind: 'product_groups',
          groups: [
            {
              title: 'Halo',
              itemSubtotalCents: null,
              lines: [
                {
                  evidenceRef: 'ref-1',
                  objectID: 'saved-1',
                  contentHash: 'hash-1',
                  quantity: 1,
                  componentSlot: 'ring',
                  explanation: 'Supported by the source record',
                  unitPriceCents: 12500,
                  lineSubtotalCents: 12500,
                },
              ],
            },
          ],
          combinedItemSubtotalCents: null,
          assessment: { perItem: 'unresolved', total: 'unresolved', reasons: ['fit:unknown'] },
        },
      }),
    );
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
    });
    expect(adapter.getModel().discoveries).toEqual([]);
    expect(adapter.getModel().discoveryUnavailable).toBe(true);
    // Existing saved state remains intact while an unresolved Discover proposal is withheld.
    expect(adapter.getModel().products.map((item) => item.product.id)).toEqual(['saved-1']);
  });
  it('marks legacy unbound Saved records as needing verification', () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(session('legacy_unbound')));
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
    });
    const model = adapter.getModel();
    expect(model.assessment?.(model.products[0].product)).toBe('Needs verification');
  });
  it('refreshes a compared item from exact source-bound evidence without changing its selection', async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      V3_SESSION_KEY,
      JSON.stringify({
        ...session(),
        committedProposal: {
          missionId: 'mission-provider',
          stateRevision: 0,
          evidenceBatchRevision: 0,
          turnId: 'original-turn',
          proposalId: 'original-proposal',
          kind: 'product_groups',
          groups: [
            {
              title: 'Original choice',
              itemSubtotalCents: 12500,
              lines: [
                {
                  evidenceRef: 'ref-1',
                  objectID: 'saved-1',
                  contentHash: 'hash-1',
                  quantity: 1,
                  componentSlot: 'necklace',
                  explanation: 'Original record',
                  unitPriceCents: 12500,
                  lineSubtotalCents: 12500,
                },
              ],
            },
          ],
          combinedItemSubtotalCents: 12500,
          assessment: { perItem: 'accepted', total: 'accepted', reasons: [] },
        },
      }),
    );
    const fetchExactProducts = vi.fn(async (body: unknown) => {
      const input = body as RefreshRequest;
      return {
        status: 'ok' as const,
        source: 'prod_catalog' as const,
        missionId: input.missionId,
        revision: input.expectedRevision,
        expectedRevision: input.expectedRevision,
        turnId: input.turnId,
        effectiveFilters: [],
        unresolved: [],
        records: [
          {
            source: 'prod_catalog' as const,
            objectID: 'saved-1',
            contentHash: 'hash-2',
            evidenceRef: 'prod_catalog/saved-1/hash-2',
            retrievedAt: '2026-10-06T23:00:00.000Z',
            record: {
              objectID: 'saved-1',
              Catalog_TitleDescription: 'Updated necklace',
              Pricing_ActivePrice: 130,
              Media_Images: [],
            },
          },
        ],
      };
    });
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
      fetchExactProducts,
    });
    await adapter.getModel().refreshProducts(['saved-1']);
    const updated = adapter.store.getSnapshot();
    expect(fetchExactProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        exactObjectIDs: ['saved-1'],
      }),
    );
    expect(updated?.compareIds).toEqual(['saved-1']);
    expect(updated?.products[0]).toEqual(updated?.selectionRecords[0]);
    expect(updated?.products[0]).toMatchObject({
      contentHash: 'hash-2',
      evidenceRef: 'prod_catalog/saved-1/hash-2',
    });
    expect(updated?.evidence?.[0]).toMatchObject({
      contentHash: 'hash-2',
      evidenceRef: 'prod_catalog/saved-1/hash-2',
    });
    expect(updated?.committedProposal).toBeFalsy();
    expect(adapter.getModel().products[0].product.price).toBe(130);
    expect(adapter.getModel().refreshError).toBe('');
  });
  it('keeps prior product data when exact refresh returns the wrong identity', async () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(session()));
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
      fetchExactProducts: async (body: unknown) => ({
        status: 'ok',
        source: 'prod_catalog',
        missionId: (body as RefreshRequest).missionId,
        revision: (body as RefreshRequest).expectedRevision,
        expectedRevision: (body as RefreshRequest).expectedRevision,
        turnId: (body as RefreshRequest).turnId,
        effectiveFilters: [],
        unresolved: [],
        records: [
          {
            source: 'prod_catalog',
            objectID: 'other',
            contentHash: 'wrong',
            evidenceRef: 'prod_catalog/other/wrong',
            retrievedAt: '2026-10-06T23:00:00.000Z',
            record: { objectID: 'other', Catalog_TitleDescription: 'Wrong item' },
          },
        ],
      }),
    });
    await adapter.getModel().refreshProducts(['saved-1']);
    expect(adapter.store.getSnapshot()?.products[0].contentHash).toBe('hash-1');
    expect(adapter.getModel().refreshError).toMatch(/could not be refreshed/i);
  });
  it('does not write an in-flight refresh into a newly reset mission', async () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(session()));
    let release: (() => void) | undefined;
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
      fetchExactProducts: (body: unknown) =>
        new Promise((resolve) => {
          const input = body as RefreshRequest;
          markStarted?.();
          release = () =>
            resolve({
              status: 'ok',
              source: 'prod_catalog',
              missionId: input.missionId,
              revision: input.expectedRevision,
              expectedRevision: input.expectedRevision,
              turnId: input.turnId,
              effectiveFilters: [],
              unresolved: [],
              records: [
                {
                  source: 'prod_catalog',
                  objectID: 'saved-1',
                  contentHash: 'hash-new',
                  evidenceRef: 'prod_catalog/saved-1/hash-new',
                  retrievedAt: '2026-10-06T23:00:00.000Z',
                  record: {
                    objectID: 'saved-1',
                    Catalog_TitleDescription: 'New title',
                    Pricing_ActivePrice: 130,
                  },
                },
              ],
            });
        }),
    });
    const pending = adapter.getModel().refreshProducts(['saved-1']);
    await started;
    await adapter.store.resetMission('next-mission');
    release?.();
    await pending;
    expect(adapter.store.getSnapshot()?.missionId).toBe('next-mission');
    expect(adapter.store.getSnapshot()?.products[0].raw.Catalog_TitleDescription).toBe(
      'Saved necklace',
    );
  });
});
