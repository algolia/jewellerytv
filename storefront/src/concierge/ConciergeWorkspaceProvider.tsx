import { normalizeProduct, type Product } from '../catalog';
import type { WorkspaceViewModel } from '../ProductWorkspace';
import type { WorkspaceGroup } from '../workspaceResults';
import { extractNativePresentation } from './nativeResults';
import { createSessionStore } from './sessionStore.js';
import { createConciergeToolRuntime } from './toolRuntime';
import type { StorageLike } from './sessionPersistence.js';

type Runtime = ReturnType<typeof createConciergeToolRuntime>;
type Store = ReturnType<typeof createSessionStore>;

function normalize(raw: unknown): Product | null {
  try {
    return normalizeProduct(raw);
  } catch {
    return null;
  }
}

export type ConciergeWorkspaceSession = {
  store: Store;
  runtime: Runtime;
  getModel: (nativeGroups?: WorkspaceGroup[]) => WorkspaceViewModel;
  stageNativePresentation: (messages: readonly unknown[]) => Promise<WorkspaceGroup[] | null>;
};

export function createConciergeWorkspaceSession(options: {
  storage: StorageLike;
  initialMissionId: string;
  fetchProductRecord?: (id: string) => Promise<unknown>;
}): ConciergeWorkspaceSession {
  const store = createSessionStore(options.storage, options.initialMissionId);
  const runtime = createConciergeToolRuntime({
    storage: options.storage,
    initialMissionId: options.initialMissionId,
  });
  const fetchProductRecord =
    options.fetchProductRecord ??
    (async (id: string) => {
      const response = await fetch(`/api/products/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error('Product details could not be loaded.');
      return await response.json();
    });
  /* F1 native adapter: cards from the agent's own grouped tool call. The agent
   * decides the groups and the products; this only reads the objectIDs off the
   * stream, hydrates full records through the existing read-only exact-product
   * path, and hands the workspace columns the same shape the tools produce.
   * No conversation logic, no agent speech, no new model calls.
   *
   * The staged, identity-verified records enter the session store as
   * `legacy_unbound` so the agent's refresh tool can reference them: a record
   * is only used when its own objectID equals the objectID the agent named
   * and the card hydration requested. */
  async function stageNativePresentation(
    messages: readonly unknown[],
  ): Promise<WorkspaceGroup[] | null> {
    const presentation = extractNativePresentation(messages as never);
    if (!presentation) return null;
    const records = new Map(presentation.records);
    const needed: string[] = [];
    for (const group of presentation.groups)
      for (const objectID of group.objectIDs) if (!records.has(objectID)) needed.push(objectID);
    // Same per-presentation ceiling as the exact-product refresh path.
    for (const objectID of [...new Set(needed)].slice(0, 12)) {
      try {
        const record = await fetchProductRecord(objectID);
        if (record && typeof record === 'object' && !Array.isArray(record))
          records.set(objectID, record as Record<string, unknown>);
      } catch {
        // A record that will not hydrate is skipped; the column shows what loaded.
      }
    }
    // Identity check: a record represents the named product only when its own
    // objectID matches what the agent named and what was requested.
    const verified = new Map<string, Record<string, unknown>>();
    for (const group of presentation.groups)
      for (const objectID of group.objectIDs) {
        const record = records.get(objectID);
        if (record && record.objectID === objectID) verified.set(objectID, record);
      }
    const groups = presentation.groups.flatMap((group) => {
      const items = group.objectIDs.flatMap((objectID) => {
        const product = normalize(verified.get(objectID));
        return product ? [{ product, why: group.why }] : [];
      });
      return items.length ? [{ title: group.title, items }] : [];
    });
    if (!groups.length) return null;
    // Register the verified records so the agent's refresh tool can reference
    // them (the session contract requires referenced ids to be stored records).
    const session = store.getSnapshot();
    if (session) {
      const additions = [...verified.entries()]
        .filter(([objectID]) => !session.selectionRecords.some((r) => r.objectID === objectID))
        .map(([objectID, raw]) => ({
          sourceIndex: 'prod_catalog' as const,
          objectID,
          contentHash: null,
          evidenceRef: null,
          binding: 'legacy_unbound' as const,
          raw,
          quantity: 1,
          observedAt: new Date().toISOString(),
        }));
      if (additions.length) {
        await store.transact({
          expectedRevision: session.brief.revision,
          apply: (current) => ({
            ...current,
            selectionRecords: [...current.selectionRecords, ...additions].slice(-12),
          }),
        });
      }
    }
    return groups;
  }
  /* Simplification 2026-10-22 (D1 to D5): the workspace is a single discovery
   * surface. Tiles link to the PDP; Save, Compare and the tabbed views are
   * retired, so the view model carries only what the columns render. */
  function getModel(nativeGroups?: WorkspaceGroup[]): WorkspaceViewModel {
    const session = store.getSnapshot();
    if (!session)
      return {
        discoveries: [],
        discoveriesStale: false,
        discoveryUnavailable: true,
      };
    return {
      discoveries: nativeGroups ?? [],
      discoveriesStale: false,
      discoveryUnavailable: false,
    };
  }
  return { store, runtime, getModel, stageNativePresentation };
}
