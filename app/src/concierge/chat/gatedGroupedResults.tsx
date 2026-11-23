import { createElement, Fragment, useEffect, useRef } from 'react';
import { createDefaultTools, GroupedResultsToolType } from 'react-instantsearch';
import type { Tool, Tools } from 'react-instantsearch';
import { createGroupedResultsToolComponent } from 'instantsearch-ui-components';
import { recordDisplayEvent } from '../../shared/telemetry';
import { ProductCard, type JtvHit } from './ProductCard';
import { hasVoice } from './narration';

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

    /* Nothing to lay out yet: the tool is mid-stream and no group has arrived.
     * The library renders an empty block here, which is the dead gap. */
    if (message?.state === 'input-streaming' && !input.groups?.length) {
      return <GroupSkeleton />;
    }

    return (
      <GroupedResultsUI
        toolProps={{
          ...props,
          message: gatedMessage,
          context: { ...props.context, message: gatedMessage },
        }}
        groupCarouselComponent={({ items }) => <GroupGrid items={items as JtvHit[]} />}
      />
    );
  };
  return { ...defaults, [GroupedResultsToolType]: { ...grouped, layoutComponent: Gated } };
}
