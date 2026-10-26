import {
  briefStateSchema,
  briefStateV3Schema,
  briefV3FactInputSchema,
  type BriefState,
  type BriefFactV3,
  type BriefFactV3Input,
  type BriefStateV3,
} from './briefSchema.js';
/* Brief state, collapsed 2026-10-25 (Pass 2). The V2 writer (apply/undo/
 * legacy migration) had no runtime caller left, so it is gone along with its
 * test. What survives is the V3 writer and the lossless V2 reader migration
 * used by sessionPersistence for old persisted records. */
export function createBriefStateV3(missionId: string): BriefStateV3 {
  return briefStateV3Schema.parse({
    version: 3,
    missionId,
    revision: 0,
    facts: [],
    processedTurns: [],
    tombstones: [],
    events: [],
  });
}
/** Lossless one-way reader migration. V2 remains untouched for existing consumers. */
export function migrateBriefStateV2ToV3(input: BriefState): BriefStateV3 {
  const old = briefStateSchema.parse(input);
  const migrateFact = (f: BriefState['facts'][number]): BriefFactV3 =>
    ({
      ...f,
      certainty: f.status === 'tentative' ? ('tentative' as const) : ('explicit' as const),
      scope: { ...f.scope, key: f.scope.key ?? null },
      value:
        f.value.kind === 'money'
          ? {
              ...f.value,
              operator: f.value.operator as 'lt' | 'lte' | 'gt' | 'gte',
              basis: f.value.basis,
            }
          : f.value,
    }) as BriefFactV3;
  const facts: BriefFactV3[] = old.facts.map(migrateFact);
  return briefStateV3Schema.parse({
    version: 3,
    missionId: old.missionId,
    revision: old.revision,
    facts,
    processedTurns: old.processedTurns,
    tombstones: old.tombstones,
    events: old.events.map((event) => ({
      ...(event.resetEvidence ? { resetEvidence: event.resetEvidence } : {}),
      revision: event.revision,
      turnId: event.turnId,
      beforeFacts: event.beforeFacts.map(migrateFact),
      beforeTombstones: event.beforeTombstones,
    })),
  });
}
export type BriefPatchV3 = {
  missionId: string;
  expectedRevision: number;
  turnId: string;
  operations: readonly (
    | { type: 'add'; fact: BriefFactV3Input }
    | { type: 'replace'; factIds: string[]; fact: BriefFactV3Input }
    | { type: 'retract'; factIds: string[] }
  )[];
};
// Scope keys retain their exact identity. Folding only detects ambiguous new keys.
function hasItemScopeCollision(state: BriefStateV3, input: BriefPatchV3): boolean {
  const incoming = input.operations.flatMap((operation) =>
    'fact' in operation && operation.fact.scope.kind === 'item' && operation.fact.scope.key
      ? [operation.fact.scope.key]
      : [],
  );
  const live = state.facts.flatMap((fact) =>
    (fact.status === 'active' || fact.status === 'tentative') && fact.scope.kind === 'item'
      ? [fact.scope.key!]
      : [],
  );
  return incoming.some((key) =>
    [...incoming, ...live].some(
      (other) =>
        other !== key &&
        other.normalize('NFKC').toLowerCase() === key.normalize('NFKC').toLowerCase(),
    ),
  );
}
export function applyBriefOperationsV3(
  state: BriefStateV3,
  input: BriefPatchV3,
  now = new Date().toISOString(),
): BriefStateV3 {
  const current = briefStateV3Schema.parse(state);
  if (input.missionId !== current.missionId) throw new Error('Stale brief mission');
  if (current.processedTurns.includes(input.turnId)) return current;
  if (input.expectedRevision !== current.revision) throw new Error('Stale brief revision');
  const next = structuredClone(current),
    revision = current.revision + 1;
  const beforeFacts = structuredClone(current.facts);
  const beforeTombstones = structuredClone(current.tombstones);
  for (const op of input.operations) {
    if ('factIds' in op && new Set(op.factIds).size !== op.factIds.length)
      throw new Error('Duplicate target fact ID');
    const targets =
      'factIds' in op
        ? op.factIds.map((id) => {
            const f = next.facts.find(
              (x) => x.id === id && (x.status === 'active' || x.status === 'tentative'),
            );
            if (!f) throw new Error('Missing active target fact');
            return f;
          })
        : [];
    if (op.type === 'replace' || op.type === 'retract')
      for (const f of targets) {
        f.status = op.type === 'replace' ? 'superseded' : 'retracted';
        f.revision = revision;
        next.tombstones.push({
          factId: f.id,
          messageId: f.evidence.messageId,
          quote: f.evidence.quote,
          revision,
        });
      }
    if (op.type === 'add' || op.type === 'replace') {
      const f = briefV3FactInputSchema.parse(op.fact);
      if (next.facts.some((x) => x.id === f.id) || next.tombstones.some((x) => x.factId === f.id))
        throw new Error('Previously recorded or removed fact');
      next.facts.push({
        ...f,
        status: f.certainty === 'explicit' ? 'active' : 'tentative',
        revision,
        createdAt: now,
      });
    }
  }
  if (hasItemScopeCollision(next, input)) throw new Error('ITEM_SCOPE_KEY_COLLISION');
  next.revision = revision;
  next.processedTurns = [...next.processedTurns, input.turnId].slice(-200);
  next.tombstones = next.tombstones.slice(-200);
  if (
    JSON.stringify(next.facts) !== JSON.stringify(beforeFacts) ||
    JSON.stringify(next.tombstones) !== JSON.stringify(beforeTombstones)
  ) {
    next.events = [
      ...next.events,
      { revision, turnId: input.turnId, beforeFacts, beforeTombstones },
    ].slice(-20);
  }
  return briefStateV3Schema.parse(next);
}
export function undoBriefV3(state: BriefStateV3, expectedRevision: number): BriefStateV3 {
  const current = briefStateV3Schema.parse(state);
  if (current.revision !== expectedRevision) throw new Error('Stale brief revision');
  const event = current.events.at(-1);
  if (!event) return current;
  const revision = current.revision + 1;
  const undoneAdds = current.facts
    .filter((fact) => !event.beforeFacts.some((old) => old.id === fact.id))
    .map((fact) => ({
      factId: fact.id,
      messageId: fact.evidence.messageId,
      quote: fact.evidence.quote,
      revision,
    }));
  return briefStateV3Schema.parse({
    ...current,
    revision,
    facts: structuredClone(event.beforeFacts),
    tombstones: [...structuredClone(event.beforeTombstones), ...undoneAdds].slice(-200),
    events: current.events.slice(0, -1),
  });
}
