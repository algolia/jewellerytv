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
  /* One set per mount. Reshuffling on every render would move a chip out from
   * under the pointer. */
  const curated = useMemo(
    () => selectStarterSet(STARTER_QUESTION_POOL, [], Math.random, SET_SIZE),
    [],
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
      <p className="jtv-chat-starters-lead">Ask about a piece, an occasion, or how we work.</p>
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
