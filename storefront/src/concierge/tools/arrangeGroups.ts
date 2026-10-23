/* Lane 1 deterministic tool 5: arrange_groups (TOOLS-DESIGN-V1.md).
 *
 * One job: decide what actually displays. Takes the model's groups of
 * objectIDs, drops ineligible pieces with a reason (out of stock, missing
 * record, duplicate, out of bounds), removes duplicates across groups, checks
 * the group sizes, and reports the shortfall. The model reads the report and
 * decides what to do next; the app renders only what this tool returned, so
 * the display can never contain a piece the other tools rejected.
 * Group sizes are parameters, default three groups of two (the accepted
 * Discovery design). No shopper-facing text, no state. */

import type { CatalogRecordFetcher } from './catalogRecord';

export type ArrangeGroupInput = { title: string; objectIDs: readonly string[] };

export type ArrangeGroupsInput = {
  groups: readonly ArrangeGroupInput[];
  minGroups?: number;
  maxGroups?: number;
  minPerGroup?: number;
  maxPerGroup?: number;
  ceiling?: number;
  floor?: number;
  /** "Up to $1,000" wording: keep a piece priced exactly at the ceiling. */
  ceilingInclusive?: boolean;
  /** "At least $X" wording: keep a piece priced exactly at the floor. */
  floorInclusive?: boolean;
};

export type ArrangeDropReason =
  | 'out_of_stock'
  | 'not_found'
  | 'duplicate'
  | 'over_ceiling'
  | 'under_floor'
  | 'unpriced';

export type ArrangeDrop = { objectID: string; reason: ArrangeDropReason; group: string };

export type ArrangedGroup = {
  title: string;
  /** Name and price ride along so the model reads a direction's price range
   * and never computes one. */
  items: { objectID: string; name: string; price: number; link: string }[];
};

export type GroupShortfall = { group: string; missing: number };

/** Eligible pieces a full group held back. Reported, never reallocated:
 * moving a piece between directions is the model's semantic call. */
export type ArrangeSurplus = { objectID: string; name: string; price: number; group: string };

export type ArrangeGroupsOutput = {
  status: 'ok' | 'invalid_input' | 'shortfall';
  /** Tiles to display. Empty unless status is 'ok'. */
  groups: ArrangedGroup[];
  dropped: ArrangeDrop[];
  shortfall: GroupShortfall[];
  /** Eligible pieces beyond the per-group cap, so the model can regroup them
   * into short directions. Empty when every group is at or under the cap. */
  surplus: ArrangeSurplus[];
  /** Set when the number of groups itself misses the requested range. */
  groupCount?: { actual: number; min: number; max: number };
  reason?: string;
};

export type ArrangeGroups = (input: ArrangeGroupsInput) => Promise<ArrangeGroupsOutput>;

const invalid = (reason: string): ArrangeGroupsOutput => ({
  status: 'invalid_input',
  reason,
  groups: [],
  dropped: [],
  shortfall: [],
  surplus: [],
});

export function createArrangeGroups(getRecords: CatalogRecordFetcher): ArrangeGroups {
  return async ({
    groups,
    minGroups = 3,
    maxGroups = 3,
    minPerGroup = 2,
    maxPerGroup = 2,
    ceiling,
    floor,
    ceilingInclusive = false,
    floorInclusive = false,
  }) => {
    if (!Array.isArray(groups) || groups.length === 0) return invalid('groups must be a non-empty array');
    if (groups.length > maxGroups) return invalid(`${groups.length} groups exceeds the maximum of ${maxGroups}`);
    for (const group of groups) {
      if (!group || typeof group.title !== 'string' || !group.title.trim())
        return invalid('every group needs a title');
      if (!Array.isArray(group.objectIDs) || group.objectIDs.length === 0)
        return invalid('every group needs objectIDs');
    }
    // First placement wins across all groups; every later copy is a duplicate.
    const placed = new Set<string>();
    const needs: string[] = [];
    for (const group of groups)
      for (const objectID of group.objectIDs) if (!placed.has(objectID)) needs.push(objectID);
    const records = await getRecords(needs);
    const dropped: ArrangeDrop[] = [];
    const shortfall: GroupShortfall[] = [];
    const surplus: ArrangeSurplus[] = [];
    const arranged: ArrangedGroup[] = [];
    for (const group of groups) {
      const items: { objectID: string; name: string; price: number; link: string }[] = [];
      for (const objectID of group.objectIDs) {
        if (placed.has(objectID)) {
          dropped.push({ objectID, reason: 'duplicate', group: group.title });
          continue;
        }
        placed.add(objectID);
        const record = records.get(objectID);
        if (!record) {
          dropped.push({ objectID, reason: 'not_found', group: group.title });
          continue;
        }
        if (!record.inStock) {
          dropped.push({ objectID, reason: 'out_of_stock', group: group.title });
          continue;
        }
        if (record.price === null) {
          dropped.push({ objectID, reason: 'unpriced', group: group.title });
          continue;
        }
        if (ceiling !== undefined && (record.price > ceiling || (!ceilingInclusive && record.price === ceiling))) {
          dropped.push({ objectID, reason: 'over_ceiling', group: group.title });
          continue;
        }
        if (floor !== undefined && (record.price < floor || (!floorInclusive && record.price === floor))) {
          dropped.push({ objectID, reason: 'under_floor', group: group.title });
          continue;
        }
        items.push({ objectID, name: record.name, price: record.price, link: record.link });
      }
      const missing = minPerGroup - items.length;
      if (missing > 0) shortfall.push({ group: group.title, missing });
      if (items.length) {
        arranged.push({ title: group.title, items: items.slice(0, maxPerGroup) });
        for (const item of items.slice(maxPerGroup))
          surplus.push({ objectID: item.objectID, name: item.name, price: item.price, group: group.title });
      }
    }
    if (groups.length < minGroups) {
      // A count below the minimum is a catalogue-driven shortfall: nothing is
      // published, the model reads the report and decides what to do next.
      // (A group that LOST a member still publishes its remaining items; the
      // shortfall rides along on the ok output so the eligible pieces show.)
      return { status: 'shortfall', groups: [], dropped, shortfall, surplus, groupCount: { actual: groups.length, min: minGroups, max: maxGroups } };
    }
    return { status: 'ok', groups: arranged, dropped, shortfall, surplus };
  };
}
