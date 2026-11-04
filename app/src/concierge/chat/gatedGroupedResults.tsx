import { createElement, Fragment, useEffect, useRef, useState } from 'react';
import { createDefaultTools, GroupedResultsToolType } from 'react-instantsearch';
import type { Tool, Tools } from 'react-instantsearch';
import { createGroupedResultsToolComponent } from 'instantsearch-ui-components';
import { recordDisplayEvent } from '../../shared/telemetry';
import { ProductCard, type JtvHit } from './ProductCard';
import { narrowChipsFor, type NarrowGroup } from './narrowChips';
import {
  buildRefineParams,
  extractTurnRefine,
  type ChipSelection,
  type SearchPart,
} from './refineSearch';

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
type Group = { title?: unknown; why?: unknown; results?: GroupResult[] };
type ToolInput = { groups?: Group[] } & Record<string, unknown>;
type RecordsStore = { get?: (objectID: string) => Record<string, unknown> | undefined };

function hasImage(record: Record<string, unknown> | undefined): boolean {
  if (!record) return false;
  const media = record.Media_Images;
  if (Array.isArray(media) && typeof media[0] === 'string' && media[0]) return true;
  return typeof record.imageLarge === 'string' || typeof record.image === 'string';
}

/* A shelf is four across, so a group of four fills a row and a group of eight
 * fills two. The shape is the shopper's contract (Arijit, 2026-11-04, ending
 * the 3-vs-4 lottery): every group is complete rows of four. Groups too small
 * to fill a row fold into a neighbour; a remainder beyond a full row is
 * dropped and logged; a shelf too thin to fill one row renders as it is
 * rather than emptying. */
const COLUMNS = 4;

/* Trims a group down to its last complete row. Bounded by construction: it
 * can only remove the one to three pieces that would sit in a partial row,
 * and every removal is logged like any other refusal. */
function trimToCompleteRows(results: GroupResult[]): {
  results: GroupResult[];
  dropped: GroupResult[];
} {
  const fullRows = Math.floor(results.length / COLUMNS) * COLUMNS;
  if (fullRows === results.length) return { results, dropped: [] };
  return { results: results.slice(0, fullRows), dropped: results.slice(fullRows) };
}

/* A group too small to fill a row keeps its pieces but not its own row:
 * a trailing one folds back into the group before it, a leading one folds
 * forward into the group after it. A lone small group has nowhere to fold, so
 * it stays — a thin shelf beats an empty one. */
function foldSmallGroups(groups: Group[]): { folded: Group[]; foldedAway: GroupResult[] } {
  const folded: Group[] = [];
  const foldedAway: GroupResult[] = [];
  for (const group of groups) {
    const results = Array.isArray(group.results) ? group.results : [];
    const previous = folded[folded.length - 1];
    if (results.length < COLUMNS && previous) {
      previous.results = [...(previous.results ?? []), ...results];
      continue;
    }
    if (results.length < COLUMNS && groups.length > 1) {
      /* Leading small group: merge forward. The next group keeps its heading;
       * this one's heading goes, because a heading over pieces that moved
       * claims a direction the shelf no longer shows. */
      const next = groups[groups.indexOf(group) + 1];
      if (next && Array.isArray(next.results)) {
        next.results = [...results, ...next.results];
        continue;
      }
      /* No next group after all (malformed tail): keep the pieces. */
      folded.push({ ...group, title: undefined, results });
      continue;
    }
    folded.push({ ...group, results });
  }
  return { folded, foldedAway };
}

/** Returns the input with ineligible pieces dropped, small groups folded and
 * every group ending on a complete row, and, usually, the tool's own intro
 * removed.
 *
 * The intro is normally a second voice: the model writes its reply in the
 * message and then says the same thing again above the shelves (measured
 * 2026-10-29, three near-identical sentences in one turn). The message is the
 * reply, so the field is dropped.
 *
 * `keepIntro` covers the case where it is the only voice. Measured 2026-11-01,
 * after the display tool's settings were tightened: the agent stopped writing
 * any message text at all and put its opening line in `intro` instead, so
 * stripping it unconditionally left the panel showing tiles and nothing else.
 * Whichever side the sentence arrives on, the shopper should read it once. */
export function gateGroups(
  input: ToolInput,
  records?: RecordsStore,
  { keepIntro = false }: { keepIntro?: boolean } = {},
) {
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
    if (!items.length) continue;
    /* The group's `why` renders as a second line under the heading, and it
     * restates the heading in vaguer words — "Featured products" over
     * "Different jewelry and accessory styles". Two lines of chrome above
     * every shelf, on a rail this narrow, for nothing the pieces do not
     * already show. Dropped like the intro. */
    kept.push({ ...group, why: undefined, results: items });
  }

  const { folded, foldedAway } = foldSmallGroups(kept);
  for (const piece of foldedAway) {
    if (typeof piece.objectID === 'string') dropped.push(`${piece.objectID}:folded`);
  }

  /* Complete rows, except where the shelf is too thin to fill one: a lone
   * group under four pieces renders as it is rather than trimming to zero. */
  const shaped =
    folded.length === 1 && (folded[0].results?.length ?? 0) < COLUMNS
      ? folded
      : folded.map((group) => {
          const { results, dropped: trimmed } = trimToCompleteRows(group.results ?? []);
          for (const piece of trimmed) {
            if (typeof piece.objectID === 'string') dropped.push(`${piece.objectID}:orphan_row`);
          }
          return { ...group, results };
        });

  return {
    input: {
      ...input,
      intro: keepIntro ? input.intro : undefined,
      groups: shaped.filter((g) => (g.results?.length ?? 0) > 0),
    },
    dropped,
  };
}

/* The library lays out the intro, the per-group headers and the streaming
 * caption; we supply the group body. Its default is a horizontal carousel,
 * which hides most of a shelf behind arrows in a panel this narrow. A grid
 * shows the whole group at once and reflows with the panel width. */
/* The renderer type in instantsearch-ui-components is framework-agnostic and
 * its `Pragma` does not line up with React's `createElement` overloads. The
 * library's own React wrapper passes exactly these four the same way. */
const GroupedResultsUI = createGroupedResultsToolComponent<JtvHit>({
  createElement,
  Fragment,
  useEffect,
  useRef,
} as never);

/* The wait between the reply text and the shelves.
 *
 * Measured against the dev agent on 2026-10-29: the model finishes the tool's
 * `intro` at 86 characters and then stalls for 4.0 seconds before emitting a
 * single group, after which all three groups and twelve pieces arrive in
 * 380ms. Progressive rendering is already on (`streamInput`), so the shelves
 * do appear as they stream; there is simply nothing to stream during the
 * stall, and the one thing generated before it is the intro, which this gate
 * drops on purpose.
 *
 * So the panel shows the shape of what is coming instead of nothing. Four
 * placeholders, which is roughly a group, rather than a spinner: a spinner
 * says "working", a shelf outline says "pieces are about to land here". */
function GroupSkeleton() {
  return (
    <div className="jtv-chat-skeleton" aria-hidden="true">
      <div className="jtv-chat-grid">
        {[0, 1, 2, 3].map((slot) => (
          <div key={slot} className="jtv-chat-card jtv-chat-card--pending">
            <div className="jtv-chat-card-image" />
            <div className="jtv-chat-card-title" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* Whether the assistant message carrying this tool call also wrote prose of
 * its own. The tool part is found by identity among the message parts, the
 * same way the library decides which message is still streaming. */
type MessagePart = {
  type?: string;
  text?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: { facets?: Record<string, Record<string, number>> };
};
type OwnerMessage = { parts?: MessagePart[] };

function ownerOf(messages: Array<OwnerMessage> | undefined, part: unknown) {
  return messages?.find((message) => message?.parts?.some((candidate) => candidate === part));
}

function messageCarriesText(owner: OwnerMessage | undefined): boolean {
  return Boolean(
    owner?.parts?.some(
      (candidate) =>
        candidate?.type === 'text' && typeof candidate.text === 'string' && candidate.text.trim(),
    ),
  );
}

/* The search that produced this shelf, so its facet counts can become chips
 * and its query and constraints can carry the refine. The last one in the
 * message: a turn that searches twice has narrowed as it went, and the later
 * counts describe what is actually on screen. */
function searchPartOf(owner: OwnerMessage | undefined): SearchPart | undefined {
  const searches = (owner?.parts ?? []).filter((part) =>
    String(part?.type ?? '').includes('algolia_search_index'),
  );
  return searches[searches.length - 1];
}

/* The facet funnel (restored 2026-11-04; the deployed 2026-10-26 design).
 *
 * A chip tap refines the shelf in place: one client search that re-issues the
 * turn's own query and constraints with the selections ANDed on top, no agent
 * turn. The 2026-11-02 middle ground sent the tap as a shopper question — a
 * full completion per tap, twenty seconds, and the funnel became a fresh
 * search every time. The old bug class this replaces is the refine rebuilt
 * from partial state (2026-10-26 platinum-over-budget receipt), which is why
 * the params come from `extractTurnRefine` on the message's own search part,
 * never reassembled from screen state.
 *
 * The in-stock filter mirrors the agent's own search so a deeper funnel level
 * never shows a piece the first level excluded. VERIFY against live turns
 * before merge: the 2026-11-03 tool-config snapshot shows no `filters` key,
 * so parity with the agent's search must be confirmed from real traffic. */
const IN_STOCK_FILTER = 'Inventory_InStock:true';
const REFINE_HITS = 8;
const REFINE_FIELDS = [
  'objectID',
  'Catalog_TitleDescription',
  'Media_Images',
  'Pricing_PriceRange',
  'Pricing_ActivePrice',
];

type FunnelState = {
  selections: ChipSelection[];
  loading: boolean;
  /** The refined shelf; null while loading, and the grouped shelf stands in. */
  hits: JtvHit[] | null;
  chips: NarrowGroup[];
};

function hitToTile(raw: Record<string, unknown>): JtvHit | null {
  if (typeof raw.objectID !== 'string' || !hasImage(raw)) return null;
  return raw as JtvHit;
}

function NarrowChips({
  groups,
  onPick,
}: {
  groups: NarrowGroup[];
  onPick: (chip: { attribute: string; value: string }) => void;
}) {
  return (
    <div className="jtv-chat-narrow">
      <p className="jtv-chat-narrow-lead">Narrow it down</p>
      {groups.map((group) => (
        <ul key={group.attribute} className="jtv-chat-narrow-list">
          {group.chips.map((chip) => (
            <li key={chip.label}>
              <button
                type="button"
                className="jtv-chat-narrow-chip"
                onClick={() => onPick({ attribute: chip.attribute, value: chip.value })}
              >
                {chip.label}
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function GroupGrid({ items }: { items: JtvHit[] }) {
  return (
    <div className="jtv-chat-grid">
      {items.map((item) => (
        <ProductCard key={item.objectID} item={item} sendEvent={() => undefined} />
      ))}
    </div>
  );
}

export function createGatedTools(): Tools {
  const defaults = createDefaultTools<JtvHit>(ProductCard);
  const grouped = defaults[GroupedResultsToolType] as Tool;
  const Gated: NonNullable<Tool['layoutComponent']> = (props) => {
    const message = props.context?.message ?? props.message;
    const raw = (message?.input ?? {}) as ToolInput;
    const messages = props.context?.messages as Array<OwnerMessage> | undefined;
    const owner = ownerOf(messages, message);
    const { input, dropped } = gateGroups(raw, props.context?.records as RecordsStore | undefined, {
      keepIntro: !messageCarriesText(owner),
    });
    if (dropped.length) recordDisplayEvent('stage-ok', `gate dropped ${dropped.join(', ')}`);
    const gatedMessage = { ...message, input };
    const [funnel, setFunnel] = useState<FunnelState | null>(null);

    /* Nothing to lay out yet: the tool is mid-stream and no group has arrived.
     * The library renders an empty block here, which is the dead gap. */
    if (message?.state === 'input-streaming' && !input.groups?.length && !funnel) {
      return <GroupSkeleton />;
    }
    /* Chips only once the shelf has settled. Offering a refinement while the
     * pieces are still arriving invites a click that cancels the turn that
     * would have answered it. A multi-query turn is multi-scope: its counts
     * are per direction, so chips would refine a direction the tiles do not
     * show (the accepted single-scope rule). */
    const settled = message?.state !== 'input-streaming';
    const turn = extractTurnRefine(searchPartOf(owner));
    const chipGroups = settled && !turn.multiScope ? narrowChipsFor(searchPartOf(owner)) : [];

    const refine = async (selection: ChipSelection) => {
      if (!turn.queryText && !turn.turnFilters.length) return;
      const selections = [...(funnel?.selections ?? []), selection];
      setFunnel({ selections, loading: true, hits: null, chips: [] });
      try {
        /* Imported here, not at module scope: `shared/client` throws at import
         * when the build env carries no Algolia keys, and the gate's unit
         * tests run without them. The refine is the only caller. */
        const { searchClient } = await import('../../shared/client');
        const response = await searchClient.search([
          {
            indexName: 'prod_catalog',
            params: {
              ...buildRefineParams(turn, selections),
              filters: IN_STOCK_FILTER,
              hitsPerPage: REFINE_HITS,
              attributesToRetrieve: REFINE_FIELDS,
              /* The funnel deepens from the refine's own counts (measured
               * live 2026-11-04: without a facets request the response
               * carries none, and the refined shelf offers no next level).
               * maxValuesPerFacet mirrors the storefront's own client query
               * so the spec-sheet filter sees true cardinality. */
              facets: ['*'],
              maxValuesPerFacet: 100,
            },
          },
        ]);
        const result = (response as { results?: Record<string, unknown>[] })?.results?.[0] ?? {};
        const hits = ((result.hits as unknown[] | undefined) ?? [])
          .map((hit) => hitToTile(hit as Record<string, unknown>))
          .filter((hit): hit is JtvHit => hit !== null);
        /* The next axis comes from the refine's own counts, with the values
         * already picked excluded so the funnel only ever deepens. */
        const facets = (result.facets as Record<string, Record<string, number>> | undefined) ?? {};
        const refinePart: SearchPart = {
          toolName: 'algolia_search_index_prod_catalog',
          input: {
            queries: [
              {
                query: turn.queryText,
                ...Object.fromEntries(selections.map((s) => [`facet_${s.attribute}`, [s.value]])),
              },
            ],
          },
          output: { facets },
        };
        setFunnel({ selections, loading: false, hits, chips: narrowChipsFor(refinePart) });
        recordDisplayEvent(
          'stage-ok',
          `funnel refine ${selections.map((s) => `${s.attribute}:${s.value}`).join(' + ')} -> ${hits.length} pieces`,
        );
      } catch (error) {
        /* The unrefined shelf stays on screen; a failed refine is a logged
         * no-op, never a dead panel. */
        recordDisplayEvent('stage-failed', `funnel refine failed: ${String(error)}`);
        setFunnel(null);
      }
    };

    if (funnel?.loading) {
      return (
        <div className="jtv-chat-refine">
          <GroupSkeleton />
        </div>
      );
    }
    if (funnel?.hits) {
      return (
        <div className="jtv-chat-refine">
          <GroupGrid items={funnel.hits} />
          <div className="jtv-chat-narrow">
            <button
              type="button"
              className="jtv-chat-narrow-chip jtv-chat-narrow-back"
              onClick={() => setFunnel(null)}
            >
              Back to all
            </button>
          </div>
          {funnel.chips.length ? <NarrowChips groups={funnel.chips} onPick={refine} /> : null}
        </div>
      );
    }
    return (
      <>
        <GroupedResultsUI
          toolProps={{
            ...props,
            message: gatedMessage,
            context: { ...props.context, message: gatedMessage },
          }}
          groupCarouselComponent={({ items }) => <GroupGrid items={items as JtvHit[]} />}
        />
        {chipGroups.length ? <NarrowChips groups={chipGroups} onPick={refine} /> : null}
      </>
    );
  };
  return { ...defaults, [GroupedResultsToolType]: { ...grouped, layoutComponent: Gated } };
}
