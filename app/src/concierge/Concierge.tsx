import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
  const [askToken, setAskToken] = useState(0);
  const chat = useRef<ChatHandle>(null);
  const pendingDraft = useRef('');
  useImperativeHandle(
    ref,
    () => ({
      ask: (text?: string) => {
        /* The draft cannot be handed over here: the panel is still hidden, so
         * the widget has not revealed its composer and the value is dropped.
         * Park it and let the reveal effect below apply it. The token makes a
         * second ask land even when the panel is already open. */
        pendingDraft.current = (text ?? '').trim();
        setAskToken((token) => token + 1);
        setOpen(true);
      },
      close: () => setOpen(false),
    }),
    [],
  );
  useEffect(() => {
    trackConciergeVisibility(open);
  }, [open]);
  /* Reveal, then draft. The widget's own open state is what focuses the
   * composer, and setInput only sticks once that composer exists. */
  useEffect(() => {
    if (!open) return;
    chat.current?.setOpen(true);
    if (!pendingDraft.current) return;
    const draft = pendingDraft.current;
    pendingDraft.current = '';
    /* One frame after the reveal: the widget mounts its composer during this
     * commit, and a value set in the same tick is discarded. */
    const timer = window.setTimeout(() => chat.current?.setInput(draft), 0);
    return () => window.clearTimeout(timer);
  }, [open, askToken]);
  /* A page whose context cannot be prepared must still be able to ask a
   * question: the turn goes out ungrounded instead of failing to send. */
  const turnContext = useCallback(() => {
    try {
      return context?.() ?? {};
    } catch {
      return {};
    }
  }, [context]);
  /* The panel sits bottom-right at a readable height by default, which is
   * what JTV asked for; full height is a choice the shopper makes, not the
   * only shape on offer. Kept here rather than in the widget because the
   * class belongs to the shell, and reset on close so the next open starts
   * from the smaller panel again. */
  const [maximized, setMaximized] = useState(false);
  return (
    <div
      className={maximized ? 'jtv-concierge jtv-concierge--maximized' : 'jtv-concierge'}
      data-open={open}
      data-maximized={maximized}
      hidden={!open}
    >
      {/* The header lives inside the widget: only the widget can reach
        * `clearMessages`, which is what the new-conversation control needs.
        * Kept mounted while closed so reopening returns to the same
        * conversation instead of restarting the stream. */}
      <JtvChat
        ref={chat}
        context={turnContext}
        maximized={maximized}
        onToggleMaximized={() => setMaximized((current) => !current)}
        onClose={() => {
          setMaximized(false);
          setOpen(false);
          onClose?.();
        }}
      />
    </div>
  );
});
