import { createSessionPersistence, type StorageLike } from './sessionPersistence.js';
import type { createSessionStore } from './sessionStore.js';

/**
 * Turn lifecycle for the Concierge chat (F3 native cleanup).
 *
 * The native agent searches and converses with its own server tools
 * (`algolia_search_index`, `algolia_grouped_results`), so this runtime no
 * longer executes client tools or stages client-tool presentations: the
 * update_shopping_state executor, the retrieve_evidence fetch pipeline, the
 * present_choices staging/evidence-ledger machinery and the vocabulary TTL
 * cache all fed that path and are gone (F3 audit,
 * docs/workspace/simplify-2026-10-17/results/L2/F3-AUDIT.md). Product cards
 * come from the native grouped results (nativeResults.ts, staged by the
 * workspace provider). What remains is the turn/mission bookkeeping around
 * the persisted session store that every turn still drives.
 */
export function createConciergeToolRuntime(options: {
  storage: StorageLike;
  initialMissionId: string;
  sessionStore?: ReturnType<typeof createSessionStore>;
}) {
  const persistence = createSessionPersistence(options.storage, options.initialMissionId);
  let turnId = '';

  function beginTurn(nextTurnId: string) {
    turnId = nextTurnId;
  }
  function endTurn(finishedTurnId: string) {
    if (finishedTurnId !== turnId) return false;
    turnId = '';
    return true;
  }
  function invalidateTurn() {
    turnId = '';
  }
  async function resetMission(missionId: string) {
    const result = await persistence.resetMission(missionId);
    if (!result.ok) return result;
    turnId = '';
    return result;
  }
  return {
    beginTurn,
    endTurn,
    invalidateTurn,
    resetMission,
  };
}
