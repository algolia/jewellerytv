import { describe, expect, it } from 'vitest';
import { createBriefStateV3 } from '../../shared/briefState';
import { createConciergeWorkspaceSession } from '../../src/concierge/ConciergeWorkspaceProvider';
import { V3_SESSION_KEY, type StorageLike } from '../../src/concierge/sessionPersistence';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
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

function rawRecord(objectID: string, price = 125) {
  return {
    objectID,
    Catalog_TitleDescription: `Necklace ${objectID}`,
    Pricing_ActivePrice: price,
    Media_Images: [],
  };
}

function sessionWithoutRetiredFields() {
  return {
    version: 3,
    missionId: 'mission-provider',
    brief: createBriefStateV3('mission-provider'),
    selectionRecords: [
      {
        sourceIndex: 'prod_catalog',
        objectID: 'kept-1',
        raw: rawRecord('kept-1'),
        quantity: 1,
        observedAt: null,
        binding: 'legacy_unbound',
        contentHash: null,
        evidenceRef: null,
      },
    ],
    receipts: [],
  };
}

function searchTurn(objectIDs: string[]) {
  return [
    { role: 'user', parts: [] },
    {
      role: 'assistant',
      parts: [
        {
          type: 'tool-algolia_search_index_prod_catalog',
          state: 'output-available',
          input: { queries: [{ query: 'opal necklaces' }] },
          output: { hits: objectIDs.map((objectID) => rawRecord(objectID)) },
        },
      ],
    },
  ];
}

describe('simplified workspace session adapter', () => {
  it('hands the workspace the single search group and renders tiles as PDP links', async () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(sessionWithoutRetiredFields()));
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
      fetchProductRecord: async (id) => rawRecord(id),
    });
    const groups = await adapter.stageSearchPresentation(searchTurn(['a-1', 'b-1']));
    expect(groups).not.toBeNull();
    const model = adapter.getModel(groups ?? []);
    expect(model.discoveries).toHaveLength(1);
    expect('products' in model).toBe(false);
    expect('compareIds' in model).toBe(false);
    expect('activeView' in model).toBe(false);
    expect('pin' in model).toBe(false);
    expect('toggleCompare' in model).toBe(false);
    const html = renderToStaticMarkup(createElement(ProductWorkspace, { model }));
    expect(html).toContain('href="/product/a-1"');
    expect(html).toContain('Necklace a-1');
    expect(html).not.toContain('Save');
    expect(html).not.toContain('Compare');
    expect(html).not.toContain('In stock');
  });
  it('renders the welcome state when the turn showed nothing', () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(sessionWithoutRetiredFields()));
    const adapter = createConciergeWorkspaceSession({ storage, initialMissionId: 'unused' });
    const html = renderToStaticMarkup(
      createElement(ProductWorkspace, { model: adapter.getModel() }),
    );
    expect(html).toContain('Discover a new favorite');
  });
  it('stays honest when the persisted session is unavailable', () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, 'corrupt-v3');
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
    });
    const model = adapter.getModel();
    expect(model.discoveries).toEqual([]);
    expect(model.discoveryUnavailable).toBe(true);
  });
  it('registers identity-verified staged records for the agent tools', async () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(sessionWithoutRetiredFields()));
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
      fetchProductRecord: async (id) => rawRecord(id),
    });
    await adapter.stageSearchPresentation(searchTurn(['new-1']));
    const session = adapter.store.getSnapshot();
    expect(session?.selectionRecords.map((r) => r.objectID)).toContain('new-1');
    expect(session?.selectionRecords.find((r) => r.objectID === 'new-1')?.binding).toBe(
      'legacy_unbound',
    );
  });
  it('shows one of a variant pair: same family number keeps the first hit only', async () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(sessionWithoutRetiredFields()));
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
      fetchProductRecord: async (id) => rawRecord(id),
    });
    const variantOf = (objectID: string, productNumber: string) => ({
      ...rawRecord(objectID),
      Catalog_ProductNumber: productNumber,
    });
    const messages = [
      { role: 'user', parts: [] },
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-algolia_search_index_prod_catalog',
            state: 'output-available',
            input: { queries: [{ query: 'huggie hoops' }] },
            output: {
              hits: [variantOf('a-1', 'F1'), variantOf('a-2', 'F1'), variantOf('a-3', 'F2')],
            },
          },
        ],
      },
    ];
    const groups = await adapter.stageSearchPresentation(messages);
    expect(groups?.[0].items.map((item) => item.product.id)).toEqual(['a-1', 'a-3']);
  });
  it('loads a pre-simplification session by stripping the retired fields', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      V3_SESSION_KEY,
      JSON.stringify({
        ...sessionWithoutRetiredFields(),
        products: [
          {
            sourceIndex: 'prod_catalog',
            objectID: 'old-saved',
            raw: rawRecord('old-saved'),
            quantity: 1,
            observedAt: null,
            binding: 'legacy_unbound',
            contentHash: null,
            evidenceRef: null,
          },
        ],
        compareIds: ['old-saved'],
        activeView: 'saved',
        committedProposal: { missionId: 'mission-provider', groups: [] },
      }),
    );
    const adapter = createConciergeWorkspaceSession({ storage, initialMissionId: 'unused' });
    const session = adapter.store.getSnapshot();
    expect(session).not.toBeNull();
    expect(session?.selectionRecords.map((r) => r.objectID)).toEqual(['kept-1']);
    expect('products' in (session ?? {})).toBe(false);
    expect('compareIds' in (session ?? {})).toBe(false);
    expect('committedProposal' in (session ?? {})).toBe(false);
  });
});

/* Mobile anchored cards (2026-10-23): each turn's tool-verified groups hydrate
 * per message, so the conversation can render cards under the answer that
 * found them. */

describe('stageMessageAnchors', () => {
  const searchMessage = (id: string, hits: string[]) => ({
    id,
    role: 'assistant',
    parts: [
      {
        type: 'tool-algolia_search_index_prod_catalog',
        toolCallId: `search-${id}`,
        state: 'output-available',
        input: { queries: [{ query: `query ${id}` }] },
        output: { hits: hits.map((objectID) => rawRecord(objectID)) },
      },
    ],
  });

  it('hydrates every anchored turn and registers the verified records', async () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(sessionWithoutRetiredFields()));
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
      fetchProductRecord: async (id) => rawRecord(id),
    });
    const anchors = await adapter.stageMessageAnchors([
      { role: 'user', parts: [] },
      searchMessage('a1', ['a-1']),
      { role: 'user', parts: [] },
      searchMessage('a2', ['a-2']),
    ]);
    expect([...anchors.keys()]).toEqual(['a1', 'a2']);
    expect(anchors.get('a1')?.[0].items[0].product.id).toBe('a-1');
    expect(anchors.get('a2')?.[0].items[0].product.id).toBe('a-2');
    const records = adapter.store.getSnapshot()?.selectionRecords.map((r) => r.objectID);
    expect(records).toContain('a-1');
    expect(records).toContain('a-2');
  });

  it('anchors nothing when the streamed hits carry no usable objectID', async () => {
    /* Anchors derive from the streamed search hits, so the identity check is
     * inherent; the surviving failure mode is a hit without a usable id. */
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(sessionWithoutRetiredFields()));
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
      fetchProductRecord: async () => rawRecord('somebody-elses-record'),
    });
    const anchors = await adapter.stageMessageAnchors([
      { role: 'user', parts: [] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-algolia_search_index_prod_catalog',
            toolCallId: 'search-a1',
            state: 'output-available',
            input: { queries: [{ query: 'query a1' }] },
            output: { hits: [{ Catalog_TitleDescription: 'No id here' }] },
          },
        ],
      },
    ]);
    expect(anchors.has('a1')).toBe(false);
  });

  it('returns an empty map when no assistant message carries grouped output', async () => {
    const storage = new MemoryStorage();
    storage.setItem(V3_SESSION_KEY, JSON.stringify(sessionWithoutRetiredFields()));
    const adapter = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'unused',
      fetchProductRecord: async (id) => rawRecord(id),
    });
    const anchors = await adapter.stageMessageAnchors([
      { role: 'user', parts: [] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Plain answer.' }] },
    ]);
    expect(anchors.size).toBe(0);
  });
});
