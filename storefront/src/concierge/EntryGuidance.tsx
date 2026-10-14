import './entry-guidance.css';
import type { StarterQuestion } from './starterQuestions';

/**
 * Entry guidance: fixed UI starter controls for the empty conversation state and
 * the product workspace tab roles. These are transparent fixed UI labels, not
 * agent replies and not a second conversation path. A starter click sends its
 * exact displayed text through the one existing Concierge composer send path,
 * so the agent still owns every generated response. The label pool is grounded
 * in aggregate search-demand analytics rather than inventory counts, and the
 * conversation owner re-selects a varied set for each new chat
 * (docs/workspace/analytics-starter-questions-2026-10-14/02-provenance.md).
 */
export type { StarterQuestion } from './starterQuestions';

/**
 * The composer send path resolves an explicit starter label over any draft
 * input, so a chip always sends exactly what it displays. Like every send, the
 * turn then clears the draft input; chips only render in the empty state, so
 * this matches the composer's own submit behavior.
 */
export function composerSendText(explicitText: string | undefined, inputValue: string) {
  return (explicitText ?? inputValue).trim();
}

/** Starter chips belong to the empty conversation state and return after New. */
export function shouldShowEntryGuidance(visibleMessageCount: number) {
  return visibleMessageCount === 0;
}

/** Product workspace view names, shared with ProductWorkspace's View union. */
export type WorkspaceViewName = 'discover' | 'compare' | 'saved';

/**
 * One line under the tab list stating what each tab actually holds. The text
 * mirrors real behavior: Discover carries the conversation's current eligible
 * recommendations, Compare holds shopper-selected side-by-side products, and
 * Save retains pieces the shopper explicitly saved.
 */
export const VIEW_GUIDANCE: Record<WorkspaceViewName, string> = {
  discover: 'Discover shows current recommendations matched to your conversation.',
  compare: 'Compare holds the pieces you picked to view side by side.',
  saved: 'Save keeps the pieces you explicitly saved.',
};

export function viewGuidance(view: WorkspaceViewName) {
  return VIEW_GUIDANCE[view];
}

/**
 * The welcome state: JTV logo plus, in the empty state, the starter controls.
 * ConnectedConcierge owns the picked set in conversation state: varied across
 * scenarios and sentence voices, re-selected on every new conversation, and
 * stable while one welcome view stays open.
 */
export function ConnectedWelcome({
  showStarters,
  startersDisabled,
  starters,
  onAsk,
}: {
  showStarters: boolean;
  startersDisabled: boolean;
  starters: readonly StarterQuestion[];
  onAsk: (label: string) => void;
}) {
  return (
    <div className="connected-welcome">
      <img
        className="connected-welcome-logo"
        src="/assets/jtv-logo-full.png"
        alt="JTV — Jewelry Television"
        width="365"
        height="273"
      />
      {showStarters && (
        <div className="connected-starters" role="group" aria-label="Suggested first questions">
          <p className="connected-starters-title">Not sure where to start? Try one of these.</p>
          <ul className="connected-starters-list">
            {starters.map((question) => (
              <li key={question.label}>
                <button
                  type="button"
                  className="connected-starter-chip"
                  disabled={startersDisabled}
                  onClick={() => onAsk(question.label)}
                >
                  {question.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
