import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ChatHandle } from 'react-instantsearch';
import { JtvChat } from './chat/JtvChat';
import { readPanelState, writePanelState, type PanelSize } from './panelState';
import { useConciergeWindowControls } from './useConciergeWindowControls';
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
    /** Hands a storefront link from inside the panel to the host's router,
     * so opening a product keeps the conversation. */
    onNavigate?: (path: string) => void;
    /** Whether the open and collapsed choices outlive a reload. The embed
     * opts out: it shares an origin with the storefront, so two mounts would
     * fight over one key, and the host owns the frame's chrome. */
    persistState?: boolean;
  }
>(function Concierge({ context, onClose, onNavigate, persistState = true }, ref) {
  /* Read once, in the initialiser, so the first render already has the shape
   * the shopper left behind and there is nothing to flash. */
  const [restored] = useState(() =>
    persistState && typeof window !== 'undefined'
      ? readPanelState(window.sessionStorage)
      : { open: false, size: 'normal' as PanelSize },
  );
  const [open, setOpen] = useState(restored.open);
  const [askToken, setAskToken] = useState(0);
  const chat = useRef<ChatHandle>(null);
  const pendingDraft = useRef('');
  useImperativeHandle(
    ref,
    () => ({
      ask: (text?: string) => {
        /* A question handed to a collapsed bar has to land on a composer. */
        setSize('normal');
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
  /* The panel sits bottom-right at a readable height; collapsing it to its
   * title bar is a choice the shopper makes. Kept here rather than in the
   * widget because the class belongs to the shell. */
  const [size, setSize] = useState<PanelSize>(restored.size);
  /* One write covering every path that changes either value — the header
   * controls, `ask()`, close — rather than one beside each setter. */
  useEffect(() => {
    if (persistState && typeof window !== 'undefined')
      writePanelState(window.sessionStorage, { open, size });
  }, [persistState, open, size]);
  const restore = useCallback(() => setSize('normal'), []);
  const minimize = useCallback(() => setSize('minimized'), []);
  /* Stable identities matter here: the header is built by a factory that the
   * widget memoizes on these props, so a fresh arrow each render would change
   * the component type and remount the header subtree. */
  const closePanel = useCallback(() => {
    /* Reopening to a bar with nothing in it reads as broken, so the size
     * normalises on the way out even though the conversation does not. */
    setSize('normal');
    setOpen(false);
    onClose?.();
  }, [onClose]);
  /* The old panel was a window: drag by the header, resize by the corner,
   * fluid anywhere on the screen (restored 2026-11-04 from the pre-merge
   * implementation; presentation only, nothing about the agent changes). */
  const controls = useConciergeWindowControls(size);
  return (
    <div
      ref={controls.panelRef}
      className={size === 'minimized' ? 'jtv-concierge jtv-concierge--minimized' : 'jtv-concierge'}
      style={controls.style}
      data-open={open}
      data-size={size}
      hidden={!open}
    >
      {/* The header lives inside the widget: only the widget can reach
       * `clearMessages`, which is what the new-conversation control needs.
       * Kept mounted while closed so reopening returns to the same
       * conversation instead of restarting the stream. */}
      <JtvChat
        ref={chat}
        context={turnContext}
        size={size}
        onRestore={restore}
        onMinimize={minimize}
        onHeaderPointerDown={controls.beginHeaderMove}
        onNavigate={onNavigate}
        onClose={closePanel}
      />
      {/* Resize grip, the old panel's corner control. Visible and quiet: the
       * 2026-11-04 restore shipped it without its stylesheet, it rendered as
       * a bare grey strip, and the panel read as not sizable at all
       * (Arijit, 2026-11-05). */}
      {size === 'normal' ? (
        <button
          type="button"
          className="jtv-concierge-resize"
          aria-label="Resize the concierge panel"
          onPointerDown={controls.beginResize}
          onKeyDown={controls.handleResizeKeyDown}
        />
      ) : null}
    </div>
  );
});
