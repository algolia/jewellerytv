import { useEffect, useMemo, useState } from 'react';
import { STARTER_QUESTION_POOL, selectStarterSet } from './starterQuestions';
import { readStarterSignals, signalsToLabels } from './starterSignals';

/* The empty state. The widget renders nothing before the first turn, which
 * leaves a shopper with a blank panel and a cursor.
 *
 * Nine chips, per the pool's standing rule. Seven come from the curated,
 * analytics-grounded pool: the labels map to aggregate search demand (see the
 * provenance note in starterQuestions.ts) and `selectStarterSet` enforces the
 * variety rules, so a set never reads as one sentence with the nouns swapped.
 * Up to two are derived from live facet counts, so the panel opens on a series
 * and a host that actually aired this week.
 *
 * The curated set paints first and the live chips join it when the facet query
 * resolves. Waiting on the network before showing anything would trade a blank
 * panel for a slower one. */

export type StarterChipsProps = {
  sendMessage?: (params: { text: string }) => void;
  status?: string;
};

const LIVE_SLOTS = 2;
const SET_SIZE = 9;

export function StarterChips({ sendMessage, status }: StarterChipsProps) {
  /* One set per mount, re-rolled only when the shopper asks. Reshuffling on
   * every render would move a chip out from under the pointer. */
  const [curated] = useState(() =>
    selectStarterSet(STARTER_QUESTION_POOL, [], Math.random, SET_SIZE),
  );
  const [live, setLive] = useState<string[]>([]);

  useEffect(() => {
    let current = true;
    void readStarterSignals().then((signals) => {
      if (current) setLive(signalsToLabels(signals));
    });
    return () => {
      current = false;
    };
  }, []);

  /* "Show more" deals a fresh set, excluding everything already offered this
   * session, so a shopper who asks for more gets more rather than a reshuffle
   * of the same nine. Past four sets the pool is exhausted and
   * `selectStarterSet` recycles it. The live on-air chips are held across
   * re-rolls: there is one top series and one top host in the window, so
   * there is nothing to roll to. */
  const labels = useMemo(() => {
    const curatedLabels = curated.map((question) => question.label);
    /* A live chip can restate a curated one (the pool carries a Jewel School
     * label of its own), so dedupe before trimming to the set size. */
    const merged = [...live, ...curatedLabels.filter((label) => !live.includes(label))];
    return merged.slice(0, Math.max(SET_SIZE, live.length + SET_SIZE - LIVE_SLOTS));
  }, [curated, live]);

  const busy = status === 'submitted' || status === 'streaming';
  return (
    <div className="jtv-chat-starters">
      <img
        className="jtv-chat-starters-logo"
        src="/assets/jtv-logo-full.png"
        alt="JTV"
        width="365"
      />
      <p className="jtv-chat-starters-lead">Not sure where to start? Try one of these.</p>
      {/* Staggered rather than stacked: the alternating indent is how JTV's
       * own design reads, and it keeps nine chips from looking like a form.
       * The offset is presentational, so the list stays a plain list. */}
      {/* The old panel's organic chip cloud: one chip per row slot, centered
       * wrap, even chips offset down. Presentation only. */}
      <ul className="jtv-chat-starters-list">
        {labels.slice(0, SET_SIZE).map((label) => (
          <li key={label}>
            <button
              type="button"
              className="jtv-chat-starter"
              disabled={busy || !sendMessage}
              onClick={() => sendMessage?.({ text: label })}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default StarterChips;
