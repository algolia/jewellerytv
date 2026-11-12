import { Sparkles } from 'lucide-react';

/* The empty state. The widget renders nothing before the first turn, which
 * leaves a shopper with a blank panel and a cursor.
 *
 * Five fixed suggestions (2026-11-12). This replaced a 31-question pool with
 * theme and voice variety rules, a weighted selector, and two more chips
 * derived from live facet counts — roughly 190 lines and a network request
 * to decide what five buttons should say. None of that was visible to a
 * shopper, who sees one set once.
 *
 * The five are chosen to show the range rather than to be the five best
 * questions: two about what has been on air, two about finding a piece, one
 * about service. On air is the half nobody guesses a chat box can answer,
 * and service is the half nobody guesses it should.
 *
 * These are fixed UI labels, never agent output. Each one was checked
 * against the indices on 2026-11-12: "Jewel School this week" matches 82
 * pieces, "yesterday" 440. */

export type StarterChipsProps = {
  sendMessage?: (params: { text: string }) => void;
  status?: string;
};

export const STARTER_QUESTIONS = [
  /* On air. The series name is the one label here with a shelf life: it is
   * JTV's long-running flagship, but a static label naming a show will
   * outlive the show eventually. */
  'What was on air yesterday?',
  'What was on Jewel School this week?',
  /* Finding a piece. The first is a plain product search, the second a
   * budget, which is the axis shoppers reach for most and the one the agent
   * has to turn into a price-band filter rather than query words. */
  'Do you have gold hoop earrings?',
  "What's good under $200?",
  /* Service, answered from `help_content` rather than the catalogue. */
  'How do returns work?',
] as const;

export function StarterChips({ sendMessage, status }: StarterChipsProps) {
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
      {/* One left-aligned column. The nine-chip stagger it replaced was there
       * to stop a long list reading as a form; at five there is no list to
       * break up. */}
      <ul className="jtv-chat-starters-list">
        {STARTER_QUESTIONS.map((label) => (
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
