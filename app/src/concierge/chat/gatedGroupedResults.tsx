import { createElement, Fragment, useEffect, useRef } from 'react';
import { createDefaultTools, GroupedResultsToolType } from 'react-instantsearch';
import type { Tool, Tools } from 'react-instantsearch';
import { createGroupedResultsToolComponent } from 'instantsearch-ui-components';
import { recordDisplayEvent } from '../../shared/telemetry';
import { ProductCard, type JtvHit } from './ProductCard';
import { narrowChipsFor, type NarrowChip, type NarrowGroup } from './narrowChips';

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
 * fills two. Measured over 18 groups from ten questions: one came back with a
 * single piece and one with two, which render as a heading above a row that is
 * mostly empty space. Anything under three is folded into its neighbour — the
 * pieces stay, the heading goes, because a heading over one tile claims a
 * direction the shelf does not show. */
const MIN_GROUP = 3;
const COLUMNS = 4;

/* The shelf is four across, so a group of five is a full row and one piece
 * stranded underneath it — the shape the team flagged. A remainder of two or
 * three reads as a partial row, which is fine; a remainder of one reads as a
 * mistake.
 *
 * Trimming is the lesser evil, and it is bounded: at most one piece, and only
 * when that piece would otherwise sit alone. Dropping it is logged like any
 * other refusal. The agent's max-per-group setting should mean this never
 * fires; this is the guarantee for when it does. */
function trimOrphan(results: GroupResult[]): { results: GroupResult[]; orphan?: string } {
  if (results.length <= COLUMNS || results.length % COLUMNS !== 1) return { results };
  const last = results[results.length - 1];
  const objectID = typeof last?.objectID === 'string' ? last.objectID : 'unknown';
  return { results: results.slice(0, -1), orphan: objectID };
}

function foldSmallGroups(groups: Group[]): Group[] {
  const folded: Group[] = [];
  for (const group of groups) {
    const results = Array.isArray(group.results) ? group.results : [];
    const previous = folded[folded.length - 1];
    /* Fold backwards where there is somewhere to fold to. A small first group
     * has nowhere to go, so it keeps its pieces and loses only its heading. */
    if (results.length < MIN_GROUP && previous) {
      previous.results = [...(previous.results ?? []), ...results];
      continue;
    }
    if (results.length < MIN_GROUP && groups.length > 1) {
      folded.push({ ...group, title: undefined, results });
      continue;
    }
    folded.push({ ...group, results });
  }
  return folded;
}

/** Returns the input with ineligible pieces, emptied groups and, usually, the
 * tool's own intro removed.
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
    const { results: fitted, orphan } = trimOrphan(items);
    if (orphan) dropped.push(`${orphan}:orphan_row`);
    /* The group's `why` renders as a second line under the heading, and it
     * restates the heading in vaguer words — "Featured products" over
     * "Different jewelry and accessory styles". Two lines of chrome above
     * every shelf, on a rail this narrow, for nothing the pieces do not
     * already show. Dropped like the intro. */
    kept.push({ ...group, why: undefined, results: fitted });
  }
  return {
    input: { ...input, intro: keepIntro ? input.intro : undefined, groups: foldSmallGroups(kept) },
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

/* Only text the shopper will actually read counts. Narration before a tool
 * call is hidden by the display rule in jtv-chat.css, so a turn whose only
 * prose is narration has no voice of its own and the tool's intro fills in —
 * counting the hidden text instead would drop the intro and leave silence. */
function messageCarriesText(owner: OwnerMessage | undefined): boolean {
  const parts = owner?.parts ?? [];
  const lastTool = parts.map((part) => String(part?.type ?? '')).reduce(
    (last, type, index) => (type.startsWith('tool-') ? index : last),
    -1,
  );
  return parts.some(
    (candidate, index) =>
      index > lastTool &&
      candidate?.type === 'text' &&
      typeof candidate.text === 'string' &&
      candidate.text.trim(),
  );
}

/* The search that produced this shelf, so its facet counts can become chips.
 * The last one in the message: a turn that searches twice has narrowed as it
 * went, and the later counts describe what is actually on screen. */
function searchPartOf(owner: OwnerMessage | undefined): MessagePart | undefined {
  const searches = (owner?.parts ?? []).filter((part) =>
    String(part?.type ?? '').includes('algolia_search_index'),
  );
  return searches[searches.length - 1];
}

function NarrowChips({
  groups,
  onPick,
}: {
  groups: NarrowGroup[];
  onPick: (chip: NarrowChip) => void;
}) {
  return (
    <div className="jtv-chat-narrow">
      <p className="jtv-chat-narrow-lead">Narrow it down</p>
      {groups.map((group) => (
        <ul key={group.attribute} className="jtv-chat-narrow-list">
          {group.chips.map((chip) => (
            <li key={chip.label}>
              <button type="button" className="jtv-chat-narrow-chip" onClick={() => onPick(chip)}>
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

/** `sendMessage` is the chat instance's, closed over here because the tool
 * context does not carry it — the same route the header's close control
 * takes. Without it the chips render disabled rather than lying about what a
 * click will do. */
export function createGatedTools(sendMessage?: (params: { text: string }) => void): Tools {
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
    /* Nothing to lay out yet: the tool is mid-stream and no group has arrived.
     * The library renders an empty block here, which is the dead gap. */
    if (message?.state === 'input-streaming' && !input.groups?.length) {
      return <GroupSkeleton />;
    }
    /* Chips only once the shelf has settled. Offering a refinement while the
     * pieces are still arriving invites a click that cancels the turn that
     * would have answered it. */
    const settled = message?.state !== 'input-streaming';
    const chipGroups = settled && sendMessage ? narrowChipsFor(searchPartOf(owner)) : [];
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
        {chipGroups.length ? (
          <NarrowChips groups={chipGroups} onPick={(chip) => sendMessage?.({ text: chip.ask })} />
        ) : null}
      </>
    );
  };
  return { ...defaults, [GroupedResultsToolType]: { ...grouped, layoutComponent: Gated } };
}
