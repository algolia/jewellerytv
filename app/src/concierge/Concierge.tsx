import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ChatHandle } from 'react-instantsearch';
import { JtvChat } from './chat/JtvChat';
import { trackConciergeVisibility } from '../website/analytics';

export interface ConciergeHandle {
  /** Open the Concierge, optionally pre-filling the composer with the text. */
  ask: (text?: string) => void;
  /** Close the Concierge panel (embed host control, plan 5.3). */
  close: () => void;
}

export const demoTrace: {
  context: Record<string, string> | null;
  contextError: string;
  requests: unknown[];
} = {
  context: null,
  contextError: '',
  requests: [],
};

/* Simplification 2026-10-22 (D6): the entry is the "Ask JTV" chip inside the
 * site search bar, not a floating launcher button. The bottom-right corner
 * belongs to the site's support widget on jtv.com. Keyword search keeps its
 * own submit; the chip hands the current search text to the Concierge.
 *
 * Step 2 of the Agent Studio migration (2026-10-26): the panel body is the
 * library's own Chat widget (`chat/JtvChat`). The custom display pipeline and
 * the session/turn machinery it used to drive are gone, so this component is
 * now only the panel shell: open/close state, the imperative handle the
 * storefront and the embed frame drive, and the page-context channel. */
export const Concierge = forwardRef<
  ConciergeHandle,
  {
    /** Ambient page facts, attached to each user turn as `turnContext`. */
    context?: () => Record<string, string>;
    /** Embed panel hook: tells the host frame the shopper closed the panel. */
    onClose?: () => void;
  }
>(function Concierge({ context, onClose }, ref) {
  const [open, setOpen] = useState(false);
  const chat = useRef<ChatHandle>(null);
  useImperativeHandle(
    ref,
    () => ({
      ask: (text?: string) => {
        setOpen(true);
        /* The chip pre-fills the composer rather than sending: the shopper
         * still gets to edit the question before it reaches the agent. */
        const prefill = (text ?? '').trim();
        if (prefill) chat.current?.setInput(prefill);
      },
      close: () => setOpen(false),
    }),
    [],
  );
  useEffect(() => {
    trackConciergeVisibility(open);
  }, [open]);
  /* A page whose context cannot be prepared must still be able to ask a
   * question: the turn goes out ungrounded instead of failing to send. */
  const turnContext = useCallback(() => {
    try {
      return context?.() ?? {};
    } catch {
      return {};
    }
  }, [context]);
  return (
    <div className="jtv-concierge" data-open={open} hidden={!open}>
      <div className="jtv-concierge-header">
        <h2>Jewelry concierge</h2>
        <button
          type="button"
          className="jtv-concierge-close"
          aria-label="Close the jewelry concierge"
          onClick={() => {
            setOpen(false);
            onClose?.();
          }}
        >
          <X size={18} />
        </button>
      </div>
      {/* Kept mounted while closed so reopening the panel returns to the same
       * conversation instead of restarting the stream. */}
      <JtvChat ref={chat} context={turnContext} />
    </div>
  );
});
