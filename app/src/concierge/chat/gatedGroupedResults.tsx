import { createElement, Fragment, useEffect, useRef, useState } from 'react';
import { createDefaultTools, GroupedResultsToolType } from 'react-instantsearch';
import type { Tool, Tools } from 'react-instantsearch';
import { createGroupedResultsToolComponent } from 'instantsearch-ui-components';
import { recordDisplayEvent } from '../../shared/telemetry';
import { ProductCard, type JtvHit } from './ProductCard';
import { indexOf, narrowChipsFor, type NarrowGroup } from './narrowChips';
import { hasVoice } from './narration';
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

/* The shelf is a four-column grid, so a group whose size is not a multiple
 * of four ends on a partial row.
 *
 * It used to be reshaped so that could not happen: groups under four were
 * merged into a neighbour and every group was trimmed back to its last
 * complete row. Removed 2026-11-13. The cost was out of proportion to a
 * ragged last row, which the storefront's own product grid — also four
 * columns — has on every filtered category:
 *
 *   - merging destroyed the grouping the display tool exists to express.
 *     Three shelves of two or three became one shelf of eight.
 *   - a trailing merge inherited the previous group's heading, so on-air
 *     pieces were shown under another show's name and date.
 *   - trimming dropped pieces outright. A group of seven rendered four, and
 *     the agent had found all seven worth showing.
 *
 * Groups now render as the agent sent them. The eligibility rules below —
 * no repeats, no unphotographed pieces — are the gate's real work. */

/** Returns the input with ineligible pieces dropped and, usually, the tool's
 * own intro removed. Groups themselves are left as the agent grouped them.
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


  return {
    input: {
      ...input,
      intro: keepIntro ? input.intro : undefined,
      groups: kept.filter((g) => (g.results?.length ?? 0) > 0),
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

/* Whether the assistant message carrying this tool call wrote prose that
 * will actually RENDER. The test is the display filter, not the raw part:
 * measured live 2026-11-04 ("I'm looking for wedding ring sets"), the model
 * wrote only two narration sentences ("I'll search…", "Now I'll curate…"),
 * both of which the sentence filter drops. Testing the raw text called that
 * a voice, suppressed the tool's own intro as a second one, and the panel
 * showed shelves with not one word of speech above them. */
/* Exported for the display-gate tests: this predicate decides whether the
 * tool's intro renders, so a narration-only message must read as silence. */
export function messageCarriesText(owner: OwnerMessage | undefined): boolean {
  return Boolean(
    owner?.parts?.some(
      (candidate) =>
        candidate?.type === 'text' &&
        typeof candidate.text === 'string' &&
        hasVoice(candidate.text),
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
 * The in-stock filter mirrors the agent's tool configuration (which also
 * carries the pre-owned exclusion), so a deeper funnel level never shows a
 * piece the first level could not. Arijit, 2026-11-04: no pre-owned code in
 * the app; the agent configuration filters it. */
const REFINE_FILTERS = 'Inventory_InStock:true';
/* The unfiltered shelf shows three complete rows of four (Arijit, 2026-11-05:
 * "2 rows product only, not 3 rows"). A refine that fetches eight erases a
 * third of the shelf by page size alone — tiles the shopper was reading
 * vanish when they apply a filter. The refine fetches the same twelve. */
const REFINE_HITS = 12;
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
        <div key={group.attribute} className="jtv-chat-narrow-axis">
          {/* Each row names its axis: the index carries sibling attributes
           * ("Metal color", "Gemstone color") whose chip values overlap, and
           * without the label "White" next to "White" read as the same
           * question twice (Arijit, 2026-11-04). */}
          <p className="jtv-chat-narrow-label">{group.label}</p>
          <ul className="jtv-chat-narrow-list">
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
        </div>
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

/* The refined shelf keeps the agent's shelf shape (Arijit, 2026-11-05: "the
 * tile disappears when the filter is applied" — the refined view collapsed
 * twelve headed tiles into eight heading-less ones, and the gray product pane
 * with them, because the pane styles hook on the grouped-results class).
 *
 * Every refined hit maps back to the agent's OWN group by objectID, so the
 * surviving groups render under their original titles in the agent's order,
 * with the same complete-rows-of-four law. Hits outside every original group
 * — the refine re-searches the index, so it can return pieces the agent never
 * showed — land in one trailing section under a fixed UI label. It is chrome
 * for a client-assembled remainder, not agent speech: no family is invented,
 * and the agent's titles stay attached to their own members only. */
export function regroupRefinedHits(
  hits: JtvHit[],
  originalGroups: Group[],
): { title?: string; results: JtvHit[] }[] {
  const memberOf = new Map<string, string>();
  for (const group of originalGroups) {
    const title = typeof group?.title === 'string' ? group.title : '';
    if (!title) continue;
    for (const result of Array.isArray(group?.results) ? group.results : []) {
      if (typeof result?.objectID === 'string' && !memberOf.has(result.objectID)) {
        memberOf.set(result.objectID, title);
      }
    }
  }
  const surviving = new Map<string, JtvHit[]>();
  const leftovers: JtvHit[] = [];
  for (const hit of hits) {
    const title = memberOf.get(hit.objectID);
    if (!title) leftovers.push(hit);
    else surviving.set(title, [...(surviving.get(title) ?? []), hit]);
  }
  const groups: { title?: string; results: JtvHit[] }[] = [];
  for (const group of originalGroups) {
    const title = typeof group?.title === 'string' ? group.title : '';
    if (title && surviving.has(title)) {
      groups.push({ title, results: surviving.get(title)! });
      surviving.delete(title);
    }
  }
  if (leftovers.length) groups.push({ title: 'More picks', results: leftovers });
  return groups;
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

    /* One refine runner, three entry points: a chip tap deepens the funnel,
     * removing an active chip steps back one level, and emptying the list
     * returns to the unrefined shelf. */
    const runRefine = async (selections: ChipSelection[]) => {
      if (!turn.queryText && !turn.turnFilters.length) return;
      /* The refine re-issues the turn's own search, so it belongs on the
       * index that turn actually used. Hardcoding `prod_catalog` would have
       * re-ranked the shelf the moment the agent moved to the
       * popularity-ranked replica production relevance is tuned on. */
      const refineIndex = indexOf(searchPartOf(owner)) ?? 'prod_catalog';
      setFunnel({ selections, loading: true, hits: null, chips: [] });
      try {
        /* Imported here, not at module scope: `shared/client` throws at import
         * when the build env carries no Algolia keys, and the gate's unit
         * tests run without them. The refine is the only caller. */
        const { searchClient } = await import('../../shared/client');
        const response = await searchClient.search([
          {
            indexName: refineIndex,
            params: {
              ...buildRefineParams(turn, selections),
              filters: REFINE_FILTERS,
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
          toolName: `algolia_search_index_${refineIndex}`,
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

    const refine = (selection: ChipSelection) => {
      void runRefine([...(funnel?.selections ?? []), selection]);
    };

    /* Removing one active chip steps back a level; removing the last one is
     * the same as Back to all. */
    const removeSelection = (selection: ChipSelection) => {
      const rest = (funnel?.selections ?? []).filter(
        (s) => !(s.attribute === selection.attribute && s.value === selection.value),
      );
      if (rest.length) void runRefine(rest);
      else setFunnel(null);
    };

    if (funnel?.loading) {
      return (
        <div className="jtv-chat-refine">
          <GroupSkeleton />
        </div>
      );
    }
    if (funnel?.hits) {
      /* The refined shelf wears the same grouped-results structure and classes
       * as the unfiltered one: the product pane's gray tile and the heading
       * styles both hook on `ais-ChatToolGroupedResults`, so without them the
       * second screen lost its shape entirely (Arijit, 2026-11-05). */
      const refined = regroupRefinedHits(funnel.hits, input.groups ?? []);
      return (
        <div className="jtv-chat-refine">
          {/* The applied selections lead the refined shelf as active chips —
           * filled, each removable, so the state is apparent without reading
           * anything (Arijit, 2026-11-05: "there should be something
           * visually showing that the filter has been applied"). */}
          {funnel.selections.length ? (
            <div className="jtv-chat-narrow">
              <p className="jtv-chat-narrow-lead">Applied filters</p>
              <ul className="jtv-chat-narrow-list">
                {funnel.selections.map((selection) => (
                  <li key={`${selection.attribute}:${selection.value}`}>
                    <button
                      type="button"
                      className="jtv-chat-narrow-chip is-active"
                      onClick={() => removeSelection(selection)}
                      aria-label={`Remove ${selection.value} filter`}
                    >
                      {selection.value}
                      <span className="jtv-chat-chip-x" aria-hidden="true">
                        ×
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="ais-ChatToolGroupedResults">
            {refined.map((group, index) => (
              <div
                key={group.title ?? `refined-${index}`}
                className="ais-ChatToolGroupedResults-group"
              >
                {group.title ? (
                  <div className="ais-ChatToolGroupedResults-groupTitle">{group.title}</div>
                ) : null}
                <GroupGrid items={group.results} />
              </div>
            ))}
          </div>
          {funnel.chips.length ? <NarrowChips groups={funnel.chips} onPick={refine} /> : null}
          <div className="jtv-chat-narrow">
            <button type="button" className="jtv-chat-narrow-back" onClick={() => setFunnel(null)}>
              ← Back to all
            </button>
          </div>
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
