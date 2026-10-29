import { createDefaultTools, GroupedResultsToolType } from 'react-instantsearch';
import type { Tool, Tools } from 'react-instantsearch';
import { recordDisplayEvent } from '../../shared/telemetry';
import { ProductCard, type JtvHit } from './ProductCard';

/* The one display gate.
 *
 * The old pipeline had four of these and that was the problem: each layer
 * re-checked stock, price and image against a record it had not fetched, and
 * each returned nothing in silence when a check failed. This is the single
 * place a piece can be refused, it reads the conversation's own record store
 * rather than a re-fetch, and every refusal is logged.
 *
 * It only enforces what no index setting can. Stock is filtered by the index
 * entry's own search parameters, and a budget ceiling belongs in the search
 * too (blocked today: Agent Studio rejects an operator on `Pricing_ActivePrice`
 * because the attribute is filterOnly and so has no facet values to validate
 * against). Those stay out of here deliberately. */

type GroupResult = { objectID?: unknown };
type Group = { title?: unknown; results?: GroupResult[] };
type ToolInput = { groups?: Group[] } & Record<string, unknown>;
type RecordsStore = { get?: (objectID: string) => Record<string, unknown> | undefined };

function hasImage(record: Record<string, unknown> | undefined): boolean {
  if (!record) return false;
  const media = record.Media_Images;
  if (Array.isArray(media) && typeof media[0] === 'string' && media[0]) return true;
  return typeof record.imageLarge === 'string' || typeof record.image === 'string';
}

/** Returns the input with ineligible pieces, emptied groups and the tool's
 * own intro removed. The intro is a second voice: the model writes its reply
 * in the message and then says the same thing again above the shelves
 * (measured 2026-10-29, three near-identical sentences in one turn). The
 * message is the reply; this field is dropped rather than rendered. */
export function gateGroups(input: ToolInput, records?: RecordsStore) {
  const groups = Array.isArray(input.groups) ? input.groups : [];
  const seen = new Set<string>();
  const dropped: string[] = [];
  const kept: Group[] = [];
  for (const group of groups) {
    const results = Array.isArray(group?.results) ? group.results : [];
    const items = results.filter((result) => {
      const objectID = typeof result?.objectID === 'string' ? result.objectID : '';
      if (!objectID) return false;
      if (seen.has(objectID)) {
        dropped.push(`${objectID}:duplicate`);
        return false;
      }
      /* A record the store has never seen is not refused: the group may still
       * be streaming, and refusing early would flicker the shelf. */
      const record = records?.get?.(objectID);
      if (record && !hasImage(record)) {
        dropped.push(`${objectID}:no_image`);
        return false;
      }
      seen.add(objectID);
      return true;
    });
    /* A group whose pieces were all refused renders as a bare heading. */
    if (items.length) kept.push({ ...group, results: items });
  }
  return { input: { ...input, intro: undefined, groups: kept }, dropped };
}

/* Wraps the library's own grouped-results layout rather than reimplementing
 * it: the carousel, streaming caption and group headers stay the library's
 * problem, and only the item list passing through is ours. */
export function createGatedTools(): Tools {
  const defaults = createDefaultTools<JtvHit>(ProductCard);
  const grouped = defaults[GroupedResultsToolType] as Tool;
  const Inner = grouped.layoutComponent;
  if (!Inner) return defaults;
  const Gated: typeof Inner = (props) => {
    const message = props.context?.message ?? props.message;
    const raw = (message?.input ?? {}) as ToolInput;
    const { input, dropped } = gateGroups(raw, props.context?.records as RecordsStore | undefined);
    if (dropped.length) recordDisplayEvent('stage-ok', `gate dropped ${dropped.join(', ')}`);
    const gatedMessage = { ...message, input };
    return Inner({
      ...props,
      message: gatedMessage,
      context: { ...props.context, message: gatedMessage },
    });
  };
  return { ...defaults, [GroupedResultsToolType]: { ...grouped, layoutComponent: Gated } };
}
