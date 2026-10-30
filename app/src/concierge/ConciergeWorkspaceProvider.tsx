import { normalizeProduct, type Product } from '../shared/catalog';
import type { WorkspaceViewModel } from '../shared/ProductWorkspace';
import type { WorkspaceGroup } from './workspaceResults';
import { collectPresentRaws, extractMessageAnchors, extractSearchPresentation } from './nativeResults';
import { createSessionStore } from './sessionStore.js';
import { createConciergeToolRuntime } from './toolRuntime';
import type { StorageLike } from './sessionPersistence.js';
import { recordDisplayEvent } from '../shared/telemetry';

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
  stageSearchPresentation: (messages: readonly unknown[]) => Promise<WorkspaceGroup[] | null>;
  stageMessageAnchors: (
    messages: readonly unknown[],
    only?: ReadonlySet<string>,
  ) => Promise<Map<string, WorkspaceGroup[]>>;
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

  /* Search records accumulate across the transcript: an arranged group may
   * reference an objectID surfaced by any earlier search call of the
   * conversation. Shared by the latest-turn and per-message staging paths. */
  function collectSearchRecords(
    messages: readonly unknown[],
  ): Map<string, Record<string, unknown>> {
    const records = new Map<string, Record<string, unknown>>();
    for (const message of messages as { role?: unknown; parts?: unknown }[]) {
      if (message.role !== 'assistant' || !Array.isArray(message.parts)) continue;
      for (const part of message.parts as { type?: unknown; output?: unknown }[]) {
        if (typeof part.type !== 'string' || !part.type.startsWith('tool-algolia_search_index'))
          continue;
        if (!part.output || typeof part.output !== 'object') continue;
        const hits = (part.output as Record<string, unknown>).hits;
        if (!Array.isArray(hits)) continue;
        for (const hit of hits) {
          if (
            hit &&
            typeof hit === 'object' &&
            !Array.isArray(hit) &&
            typeof (hit as Record<string, unknown>).objectID === 'string'
          )
            records.set(
              (hit as Record<string, unknown>).objectID as string,
              hit as Record<string, unknown>,
            );
        }
      }
    }
    return records;
  }

  /* One hydration pass for one set of groups: fills missing records through
   * the exact-product proxy (same per-presentation ceiling of 12), then keeps
   * only identity-verified records. */
  async function hydrateGroups(
    groups: { title: string; why?: string; objectIDs: string[] }[],
    records: Map<string, Record<string, unknown>>,
  ): Promise<WorkspaceGroup[]> {
    const needed: string[] = [];
    for (const group of groups)
      for (const objectID of group.objectIDs) if (!records.has(objectID)) needed.push(objectID);
    for (const objectID of [...new Set(needed)].slice(0, 12)) {
      try {
        const record = await fetchProductRecord(objectID);
        if (record && typeof record === 'object' && !Array.isArray(record))
          records.set(objectID, record as Record<string, unknown>);
      } catch {
        // A record that will not hydrate is skipped; the column shows what loaded.
      }
    }
    const verified = new Map<string, Record<string, unknown>>();
    for (const group of groups)
      for (const objectID of group.objectIDs) {
        const record = records.get(objectID);
        if (record && record.objectID === objectID) verified.set(objectID, record);
      }
    return groups.flatMap((group) => {
      const items = group.objectIDs.flatMap((objectID) => {
        const product = normalize(verified.get(objectID));
        return product ? [{ product, why: group.why }] : [];
      });
      /* search_results marks the chips-native single-group shelf so the
       * workspace renders the full verified list — without it the canvas
       * fell back to the grouped two-per-group cap (measured: 2 of 9 tiles,
       * 2026-10-27). */
      return items.length ? [{ title: group.title, mode: 'search_results', items }] : [];
    });
  }

  /* Register the verified records so the agent's refresh tool can reference
   * them (the session contract requires referenced ids to be stored records). */
  async function registerVerifiedRecords(verified: Map<string, Record<string, unknown>>) {
    const session = store.getSnapshot();
    if (!session || !verified.size) return;
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

  /* Chips-native staging (curation restored 2026-10-24): the model curates via
   * `present_products`, whose tool ran the eligibility checks (stock, price,
   * image, variant dedupe) and whose chosen ids the extractor cross-validated
   * against the streamed search hits. Staging normalizes, re-checks price and
   * stock on the freshest record (defense in depth), registers the
   * identity-verified set for refresh_products, and records displayEvents in
   * every environment so prod troubleshooting never depends on dev-only warns. */
  async function stageSearchPresentation(
    messages: readonly unknown[],
  ): Promise<WorkspaceGroup[] | null> {
    const presentation = extractSearchPresentation(messages as never);
    if (!presentation) return null;
    const records = presentation.records;
    const normalized = presentation.objectIDs
      .map((objectID) => normalize(records.get(objectID)))
      .filter((product): product is Product => product !== null);
    /* Variant dedupe and the first eligibility pass live in the present_products
     * tool; this pass re-checks price/stock/image on the freshest record. */
    const tiles: { product: Product }[] = [];
    const verified = new Map<string, Record<string, unknown>>();
    for (const product of normalized) {
      const fresh = records.get(product.id);
      if (!fresh || (fresh as Record<string, unknown>).objectID !== product.id) continue;
      const checked = normalize(fresh);
      /* A record with no usable image renders a broken tile: skip it, the
       * shopper cannot shop an empty image well. */
      if (!checked || checked.images.length === 0) continue;
      if (checked.inStock === false || checked.price === null) continue;
      verified.set(product.id, fresh);
      tiles.push({ product: checked });
    }
    if (!tiles.length) {
      recordDisplayEvent('stage-empty', `search "${presentation.queryText.slice(0, 40)}" left no displayable tiles`);
      return null;
    }
    /* Shelf floor at the staging layer (Arijit's law, 2026-10-26): when the
     * model's verified picks stage under six tiles, top up from the streamed
     * search's remaining hits through the identical checks — the shopper
     * never sees 3, 4 or 5 when the search returned a bigger pool. */
    if (tiles.length < 6) {
      const staged = new Set(tiles.map((tile) => tile.product.id));
      for (const [objectID, fresh] of presentation.records) {
        if (tiles.length >= 6) break;
        if (staged.has(objectID)) continue;
        const checked = normalize(fresh);
        if (!checked || checked.images.length === 0) continue;
        if (checked.inStock === false || checked.price === null) continue;
        verified.set(objectID, fresh);
        tiles.push({ product: checked });
        staged.add(objectID);
      }
      recordDisplayEvent('stage-backfill', `${tiles.length} tiles after top-up`);
    }
    await registerVerifiedRecords(verified);
    recordDisplayEvent('stage-ok', `${tiles.length} tiles`);
    return [{ title: presentation.queryText, mode: 'search_results', items: tiles }];
  }

  /* Mobile anchored cards (chips-native): hydrate EVERY assistant message
   * that carries a single-query search, not just the latest turn, so the
   * conversation can render each turn's picks under the answer that found
   * them. Returns a map keyed by assistant message id; messages without
   * anchors are absent. An optional `only` set restricts hydration to those
   * message ids (the caller stages incrementally and already-staged messages
   * are never re-fetched). */
  async function stageMessageAnchors(
    messages: readonly unknown[],
    only?: ReadonlySet<string>,
  ): Promise<Map<string, WorkspaceGroup[]>> {
    const anchors = extractMessageAnchors(messages as never).filter(
      (anchor) => !only || only.has(anchor.messageId),
    );
    if (!anchors.length) return new Map();
    const records = collectSearchRecords(messages);
    /* Follow-up tiles (the shelf floor's own search) were never streamed:
     * their raw records ride the present_products output. */
    for (const [objectID, raw] of collectPresentRaws(messages as never)) {
      if (!records.has(objectID)) records.set(objectID, raw);
    }
    /* Records already registered by an earlier staging (the verified shelf
     * the model wrote its reply from) seed the map — a per-ID proxy refetch
     * can fail transiently and silently drop a tile from the canvas. */
    for (const r of store.getSnapshot()?.selectionRecords ?? []) {
      if (!records.has(r.objectID) && r.raw) records.set(r.objectID, r.raw as Record<string, unknown>);
    }
    const staged = new Map<string, WorkspaceGroup[]>();
    for (const anchor of anchors) {
      const hydrated = await hydrateGroups(anchor.groups, records);
      if (hydrated.length) staged.set(anchor.messageId, hydrated);
    }
    // Registration uses the same identity rule; verified ids from every
    // anchored message become referenceable by the agent's refresh tool.
    const verified = new Map<string, Record<string, unknown>>();
    for (const anchor of anchors)
      for (const group of anchor.groups)
        for (const objectID of group.objectIDs) {
          const record = records.get(objectID);
          if (record && record.objectID === objectID) verified.set(objectID, record);
        }
    await registerVerifiedRecords(verified);
    return staged;
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
  return {
    store,
    runtime,
    getModel,
    stageSearchPresentation,
    stageMessageAnchors,
  };
}
