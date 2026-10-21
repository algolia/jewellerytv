import { normalizeProduct } from '../catalog';
import type {
  EvidenceRecord,
  RetrieveEvidenceResult,
} from '../../shared/concierge/retrieval/types.js';
import type { SourceBoundProduct } from '../../shared/concierge/sessionContract.js';
import type { createSessionStore } from './sessionStore.js';

type Store = ReturnType<typeof createSessionStore>;
type FetchEvidence = (body: unknown, signal?: AbortSignal) => Promise<RetrieveEvidenceResult>;
const refreshFailure =
  'Current catalogue details could not be refreshed. Previously saved information is still shown.';

/** Which requested ids got fresh catalogue records and which did not. A
 * missing id is honest "no fresh data", not an error: the workspace keeps
 * showing the record it already displayed. */
export type ProductRefreshOutcome = { refreshed: string[]; missing: string[] };
const MISS_ALL: ProductRefreshOutcome = { refreshed: [], missing: [] };

function validRecord(record: EvidenceRecord, requested: string[]): boolean {
  if (
    record.source !== 'prod_catalog' ||
    !requested.includes(record.objectID) ||
    record.record.objectID !== record.objectID ||
    !record.contentHash ||
    record.evidenceRef !==
      `prod_catalog/${encodeURIComponent(record.objectID)}/${record.contentHash}`
  )
    return false;
  try {
    normalizeProduct(record.record);
    return true;
  } catch {
    return false;
  }
}

/** Refresh exact IDs through the source-bound read path without creating agent dialogue. */
export function createExactProductRefresh(store: Store, fetchExactProducts: FetchEvidence) {
  let refreshError = '';
  let refreshing = false;
  let generation = 0;
  async function notify() {
    const current = store.getSnapshot();
    if (current)
      await store.transact({
        expectedRevision: current.brief.revision,
        apply: (session) => session,
      });
  }
  async function refreshProducts(ids: string[]): Promise<ProductRefreshOutcome> {
    const state = store.getSnapshot();
    if (!state) return MISS_ALL;
    const requested = [...new Set(ids)];
    if (!requested.length) return MISS_ALL;
    /* H2: the old gate here also required every id to already sit in
     * state.products/selectionRecords. That gate protected the store against
     * adopting ids nothing in the session had ever verified — but native
     * cards are component state, so a legitimate card click names an id the
     * store may not hold, and the gate turned every such click into the red
     * banner before any request left the browser. The shape and batch-size
     * checks stay; identity is now enforced where it matters, on the returned
     * record itself (validRecord: the record's own objectID must equal the
     * requested id), and an adopted record enters the store as legacy_unbound
     * exactly like H1's staged cards. */
    if (
      requested.length > 12 ||
      requested.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,149}$/.test(id))
    ) {
      refreshError = refreshFailure;
      await notify();
      return { refreshed: [], missing: requested };
    }
    const known = new Set(
      [...state.products, ...state.selectionRecords].map((item) => item.objectID),
    );
    const requestGeneration = ++generation;
    refreshing = true;
    refreshError = '';
    await notify();
    const records: EvidenceRecord[] = [];
    try {
      for (let offset = 0; offset < requested.length; offset += 3) {
        const exactObjectIDs = requested.slice(offset, offset + 3);
        const turnId = `workspace-refresh-${requestGeneration}-${offset}`;
        const result = await fetchExactProducts({
          exactObjectIDs,
          missionId: state.missionId,
          expectedRevision: state.brief.revision,
          turnId,
        });
        if (
          result.status !== 'ok' ||
          result.source !== 'prod_catalog' ||
          result.missionId !== state.missionId ||
          result.revision !== state.brief.revision ||
          result.turnId !== turnId ||
          result.records.length !== exactObjectIDs.length ||
          result.records.some((record) => !validRecord(record, exactObjectIDs)) ||
          new Set(result.records.map((record) => record.objectID)).size !== exactObjectIDs.length
        )
          throw new Error('Invalid exact product refresh');
        records.push(...result.records);
      }
      if (requestGeneration !== generation) return { refreshed: [], missing: requested };
      const result = await store.transact({
        expectedRevision: state.brief.revision,
        apply: (current) => {
          if (current.missionId !== state.missionId) return current;
          const refreshed = new Map(records.map((record) => [record.objectID, record]));
          const canonical = new Map(
            [...current.products, ...current.selectionRecords]
              .filter((item) => refreshed.has(item.objectID))
              .map((item) => [item.objectID, item]),
          );
          for (const record of records) {
            const previous = canonical.get(record.objectID);
            if (!previous) continue;
            canonical.set(record.objectID, {
              ...previous,
              raw: record.record,
              binding: 'evidence_bound',
              contentHash: record.contentHash,
              evidenceRef: record.evidenceRef,
              observedAt: record.retrievedAt,
            });
          }
          const update = (item: SourceBoundProduct) => canonical.get(item.objectID) ?? item;
          /* H2: a requested id the store does not hold yet (a clicked native
           * card) is adopted with the same shape H1's staging uses. */
          const additions = records
            .filter(
              (record) =>
                !current.products.some((item) => item.objectID === record.objectID) &&
                !current.selectionRecords.some((item) => item.objectID === record.objectID),
            )
            .map((record) => ({
              sourceIndex: 'prod_catalog' as const,
              objectID: record.objectID,
              contentHash: null,
              evidenceRef: null,
              binding: 'legacy_unbound' as const,
              raw: record.record,
              quantity: 1,
              observedAt: record.retrievedAt,
            }));
          const proposalChanged = current.committedProposal?.groups.some((group) =>
            group.lines.some((line) => {
              const record = refreshed.get(line.objectID);
              return record && record.contentHash !== line.contentHash;
            }),
          );
          return {
            ...current,
            products: current.products.map(update),
            selectionRecords: [
              ...current.selectionRecords.map(update),
              ...additions,
            ].slice(-12),
            committedProposal: proposalChanged ? null : current.committedProposal,
            evidence: (current.evidence ?? []).map((item) => {
              const record = refreshed.get(item.objectID);
              return record
                ? { ...item, contentHash: record.contentHash, evidenceRef: record.evidenceRef }
                : item;
            }),
          };
        },
      });
      if (!result.ok) throw new Error('Could not save refreshed product details');
    } catch {
      if (requestGeneration === generation && store.getSnapshot()?.missionId === state.missionId)
        /* The banner is honest only when the session holds a record that just
         * failed to refresh ("previously saved information is still shown").
         * An id the store never held has nothing saved to fall back on, so the
         * outcome reports it missing instead of alarming the shopper. */
        if (requested.some((id) => known.has(id))) refreshError = refreshFailure;
    } finally {
      if (requestGeneration === generation) {
        refreshing = false;
        await notify();
      }
    }
    const refreshedIds = new Set(records.map((record) => record.objectID));
    return {
      refreshed: requested.filter((id) => refreshedIds.has(id)),
      missing: requested.filter((id) => !refreshedIds.has(id)),
    };
  }
  return { refreshProducts, isRefreshing: () => refreshing, getError: () => refreshError };
}
