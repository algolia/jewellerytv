import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { STARTER_QUESTION_POOL, selectStarterSet } from './starterQuestions';
import { readStarterSignals, signalsToLabels } from './starterSignals';

/* The empty state. The widget renders nothing before the first turn, which
 * leaves a shopper with a blank panel and a cursor.
 *
 * Five chips in one left-aligned column (JTV, 2026-11-12), down from nine
 * staggered ones, with the wordmark replaced by a heading and a sentence
 * saying what the thing is. Nine chips read as a menu to work through; five
 * read as examples.
 *
 * Four come from the curated, analytics-grounded pool: the labels map to
 * aggregate search demand (see the provenance note in starterQuestions.ts)
 * and `selectStarterSet` enforces the variety rules, so a set never reads as
 * one sentence with the nouns swapped. One is derived from live facet counts,
 * so the panel opens on something that actually aired this week.
 *
 * The curated set paints first and the live chip joins it when the facet
 * query resolves. Waiting on the network before showing anything would trade
 * a blank panel for a slower one. */

export type StarterChipsProps = {
  sendMessage?: (params: { text: string }) => void;
  status?: string;
};

const LIVE_SLOTS = 1;
const SET_SIZE = 5;

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

  /* New search deals a fresh set, excluding everything already offered this
   * session, so a shopper who asks again gets different examples rather than
   * a reshuffle of the same five. The live on-air chip leads: it is the one
   * label that could not have been written in advance. */
  const labels = useMemo(() => {
    const curatedLabels = curated.map((question) => question.label);
    /* A live chip can restate a curated one (the pool carries a Jewel School
     * label of its own), so dedupe before trimming to the set size. */
    const merged = [
      ...live.slice(0, LIVE_SLOTS),
      ...curatedLabels.filter((label) => !live.includes(label)),
    ];
    return merged.slice(0, SET_SIZE);
  }, [curated, live]);

  const busy = status === 'submitted' || status === 'streaming';
  return (
    <div className="jtv-chat-starters">
      <h2 className="jtv-chat-starters-title">What can we help you find?</h2>
      <p className="jtv-chat-starters-lead">
        <Sparkles className="jtv-chat-starters-mark" size={18} aria-hidden="true" />
        <span>
          Meet <strong>Ask JTV</strong>, your personal jewelry shopper. Tell us what you&rsquo;re
          looking for, or tap a suggestion below, and we&rsquo;ll help you find something
          you&rsquo;ll love.
        </span>
      </p>
      {/* One left-aligned column, evenly spread. The nine-chip stagger it
       * replaced was there to stop a long list reading as a form; at five
       * there is no list to break up. */}
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
