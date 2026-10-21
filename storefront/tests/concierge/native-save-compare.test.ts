import { describe, expect, it } from 'vitest';

/* pin/compare commit through an async store transact; the snapshot lands a
 * tick later. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
import { createConciergeWorkspaceSession } from '../../src/concierge/ConciergeWorkspaceProvider';
import { V3_SESSION_KEY, type StorageLike } from '../../src/concierge/sessionPersistence';

/* H1 (Arijit, 2026-10-20 night): Save and Compare stay and must work on
 * native cards. The staged native records enter the session store as
 * legacy_unbound — the identity guarantee is the verified hydrated record
 * (record.objectID must equal the requested objectID), not the old
 * client-tool evidence-binding cross-check. */

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const record = (objectID: string, title = `Product ${objectID}`) => ({
  objectID,
  Catalog_TitleDescription: title,
  Pricing_ActivePrice: 125,
  Inventory_InStock: true,
  Media_Images: [],
});

const groupedMessage = (ids: string[]) => ({
  id: 'a1',
  role: 'assistant',
  parts: [
    {
      type: 'tool-algolia_grouped_results',
      toolCallId: 'call-1',
      state: 'output-available',
      input: {
        intro: 'A first look',
        groups: [{ title: 'One column', results: ids.map((objectID) => ({ objectID })) }],
      },
      output: { status: 'success' },
    },
  ],
});

function makeSession() {
  const storage = new MemoryStorage();
  const session = createConciergeWorkspaceSession({
    storage,
    initialMissionId: 'mission-h1',
    fetchProductRecord: async (id: string) => record(id),
  });
  return { storage, session };
}

async function stage(session: ReturnType<typeof makeSession>['session'], ids: string[]) {
  return session.stageNativePresentation([
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'show me rings' }] },
    groupedMessage(ids),
  ]);
}

describe('Save and Compare on native cards (H1)', () => {
  it('Save pins a native card into the Save tab as a legacy_unbound record', async () => {
    const { session } = makeSession();
    const groups = await stage(session, ['NAT1']);
    expect(groups).not.toBeNull();
    const model = session.getModel(groups ?? undefined);
    model.pin(model.discoveries[0].items[0].product.raw);
    await flush();
    const state = session.store.getSnapshot()!;
    expect(state.products.map((item) => item.objectID)).toContain('NAT1');
    expect(state.products.find((item) => item.objectID === 'NAT1')?.binding).toBe(
      'legacy_unbound',
    );
  });

  it('Compare accepts two native cards', async () => {
    const { session } = makeSession();
    const groups = await stage(session, ['NAT1', 'NAT2']);
    const model = session.getModel(groups ?? undefined);
    model.toggleCompare('NAT1');
    model.toggleCompare('NAT2');
    await flush();
    const state = session.store.getSnapshot()!;
    expect(state.compareIds).toEqual(['NAT1', 'NAT2']);
  });

  it('a second Save of the same native product is idempotent', async () => {
    const { session } = makeSession();
    const groups = await stage(session, ['NAT1']);
    const model = session.getModel(groups ?? undefined);
    model.pin(model.discoveries[0].items[0].product.raw);
    model.pin(model.discoveries[0].items[0].product.raw);
    await flush();
    const state = session.store.getSnapshot()!;
    expect(state.products.filter((item) => item.objectID === 'NAT1')).toHaveLength(1);
  });

  it('rejects a hydrated record whose objectID does not match the requested id', async () => {
    const storage = new MemoryStorage();
    const session = createConciergeWorkspaceSession({
      storage,
      initialMissionId: 'mission-h1',
      fetchProductRecord: async () => record('OTHER-ID'),
    });
    const groups = await session.stageNativePresentation([
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'show me rings' }] },
      groupedMessage(['NAT1']),
    ]);
    expect(groups).toBeNull();
    const state = session.store.getSnapshot()!;
    expect(state.selectionRecords.map((item) => item.objectID)).not.toContain('NAT1');
    expect(storage.getItem(V3_SESSION_KEY) ?? '').not.toContain('NAT1');
  });
});
