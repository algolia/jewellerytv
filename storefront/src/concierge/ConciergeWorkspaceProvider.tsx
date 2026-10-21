import { normalizeProduct, type Product } from '../catalog';
import type { WorkspaceViewModel } from '../ProductWorkspace';
import type { WorkspaceGroup } from '../workspaceResults';
import { extractNativePresentation } from './nativeResults';
import { createSessionStore } from './sessionStore.js';
import { createConciergeToolRuntime } from './toolRuntime';
import type { StorageLike } from './sessionPersistence.js';
import type { RetrieveEvidenceResult } from '../../shared/concierge/retrieval/types.js';
import type { SourceBoundProduct } from '../../shared/concierge/sessionContract.js';
import { createExactProductRefresh } from './exactProductRefresh.js';

type Runtime = ReturnType<typeof createConciergeToolRuntime>;
type Store = ReturnType<typeof createSessionStore>;
type ProductEntry = { product: Product; quantity: number; observedAt: string };

function normalize(raw: unknown): Product | null {
  try {
    return normalizeProduct(raw);
  } catch {
    return null;
  }
}
function entry(raw: SourceBoundProduct): ProductEntry | null {
  const product = normalize(raw.raw);
  return product ? { product, quantity: raw.quantity, observedAt: raw.observedAt ?? '' } : null;
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
  fetchExactProducts?: (body: unknown, signal?: AbortSignal) => Promise<RetrieveEvidenceResult>;
  fetchProductRecord?: (id: string) => Promise<unknown>;
}): ConciergeWorkspaceSession {
  const store = createSessionStore(options.storage, options.initialMissionId);
  const runtime = createConciergeToolRuntime({
    storage: options.storage,
    initialMissionId: options.initialMissionId,
  });
  const fetchExactProducts =
    options.fetchExactProducts ??
    (async (body: unknown) => {
      const response = await fetch('/api/agent-product-refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Exact product refresh failed');
      return (await response.json()) as RetrieveEvidenceResult;
    });
  const refresh = createExactProductRefresh(store, fetchExactProducts);
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
   * path, and hands the workspace columns the same shape present_choices used.
   * No conversation logic, no agent speech, no new model calls.
   *
   * H1: a shown native card must be Saveable and Comparable. The staged,
   * identity-verified records enter the session store as `legacy_unbound` —
   * the same slot the old client-tool flow filled with `evidence_bound`
   * records. The identity guarantee is the verified hydrated record: a record
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
        return product ? [{ product, why: group.why, assessment: 'unknown' as const }] : [];
      });
      return items.length ? [{ title: group.title, items }] : [];
    });
    if (!groups.length) return null;
    // Register the verified records so Save and Compare can reference them
    // (the session contract requires referenced ids to be stored records).
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
  function getModel(nativeGroups?: WorkspaceGroup[]): WorkspaceViewModel {
    const session = store.getSnapshot();
    if (!session) {
      const disabled = () => undefined;
      return {
        products: [],
        selectionRecords: [],
        discoveries: [],
        activeView: 'discover',
        setView: disabled,
        compareIds: [],
        toggleCompare: disabled,
        pin: disabled,
        remove: disabled,
        refreshProducts: refresh.refreshProducts,
        refreshing: false,
        refreshError: 'The saved session is unavailable. Workspace actions are disabled.',
        assessment: () => 'Needs verification',
      };
    }
    const state = session;
    const all = [...(state?.products ?? []), ...(state?.selectionRecords ?? [])];
    const products = new Map(all.map((item) => [item.objectID, item]));
    const proposal = state.committedProposal ?? null;
    const groups =
      proposal?.assessment.perItem === 'accepted'
        ? proposal.groups.flatMap((group) => {
            const items = group.lines.flatMap((line) => {
              const persisted = products.get(line.objectID);
              const raw = persisted?.raw;
              const product = normalize(raw);
              return product
                ? [{ product, why: line.explanation, assessment: 'compliant' as const }]
                : [];
            });
            return items.length
              ? [{ title: group.title, items, mode: proposal.mode ?? undefined }]
              : [];
          })
        : [];
    const proposedLooks =
      proposal?.kind === 'complete_looks'
        ? proposal.groups.map((group) => ({
            title: group.title,
            lines: group.lines.flatMap((line) => {
              const product = normalize(products.get(line.objectID)?.raw);
              return product ? [{ product, why: line.explanation, quantity: line.quantity }] : [];
            }),
            itemSubtotalCents: group.itemSubtotalCents,
          }))
        : [];
    const selectedProducts = new Map<string, Product>();
    for (const item of all) {
      const product = normalize(item.raw);
      if (product) selectedProducts.set(item.objectID, product);
    }
    for (const group of groups)
      for (const item of group.items) selectedProducts.set(item.product.id, item.product);
    const expectedRevision = state?.brief.revision ?? 0;
    const transact = (apply: (current: typeof state) => typeof state | Promise<typeof state>) => {
      if (!state) return;
      void store.transact({
        expectedRevision,
        apply: (current) => apply(current as typeof state) as typeof current,
      });
    };
    const legacyIds = new Set(
      (state?.products ?? [])
        .filter((item) => item.binding === 'legacy_unbound')
        .map((item) => item.objectID),
    );
    const verifiedIds = new Set(
      proposal?.assessment.perItem === 'accepted'
        ? proposal.groups.flatMap((group) => group.lines.map((line) => line.objectID))
        : [],
    );
    const assessment = (product: Product, status?: 'compliant' | 'unknown') => {
      if (verifiedIds.has(product.id)) return null;
      if (legacyIds.has(product.id) || !status) return 'Needs verification';
      return status === 'unknown' ? 'Needs verification' : null;
    };
    const model: WorkspaceViewModel = {
      products: state.products.flatMap(entry).filter((item): item is ProductEntry => item !== null),
      selectionRecords: [...selectedProducts.values()],
      /* F1: native grouped results render in the same columns when the turn
       * carried no committed proposal (the native agent has no client tools).
       * A client-tool proposal still wins when one exists. */
      discoveries: groups.length ? groups : (nativeGroups ?? []),
      discoveriesStale:
        groups.length > 0 && proposal?.stateRevision !== state.brief.revision,
      discoveryUnavailable:
        proposal?.kind === 'product_groups' &&
        (proposal.assessment.perItem !== 'accepted' ||
          groups.reduce((count, group) => count + group.items.length, 0) !==
            proposal.groups.reduce((count, group) => count + group.lines.length, 0)),
      proposedLooks,
      activeView: state.activeView ?? 'discover',
      setView: (activeView) => transact((current) => ({ ...current, activeView })),
      compareIds: state.compareIds ?? [],
      toggleCompare: (id) =>
        transact((current) => {
          const ids = [...current.compareIds];
          const index = ids.indexOf(id);
          if (index >= 0) ids.splice(index, 1);
          else if (ids.length < 3 && selectedProducts.has(id)) ids.push(id);
          else return current;
          return { ...current, compareIds: ids };
        }),
      pin: (raw) => {
        if ((state?.products.length ?? 0) >= 12) return;
        const product = normalize(raw);
        if (!product || state.products.some((item) => item.objectID === product.id)) return;
        // H1: a native card's record is identity-verified at hydration (its
        // own objectID matched the requested id), so a staged legacy_unbound
        // record is Saveable just like an evidence-bound one.
        const existing = state.selectionRecords.find((item) => item.objectID === product.id);
        if (!existing) return;
        transact((current) => ({ ...current, products: [...current.products, existing] }));
      },
      remove: (id) =>
        transact((current) => ({
          ...current,
          products: current.products.filter((item) => item.objectID !== id),
        })),
      refreshProducts: refresh.refreshProducts,
      refreshing: refresh.isRefreshing(),
      refreshError: refresh.getError(),
      assessment,
    };
    return model;
  }
  return { store, runtime, getModel, stageNativePresentation };
}
