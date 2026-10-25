import { forwardRef, useImperativeHandle, useState } from 'react';
import { ConnectedConcierge } from './ConnectedConcierge';
import { trackConciergeVisibility } from '../website/analytics';
import './concierge-workspace.css';
import './connected.css';

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

export type ConciergePrefill = { text: string; token: number } | null;

/* Simplification 2026-10-22 (D6): the entry is the "Ask JTV" chip inside the
 * site search bar, not a floating launcher button. The bottom-right corner
 * belongs to the site's support widget on jtv.com. Keyword search keeps its
 * own submit; the chip hands the current search text to the Concierge. */
export const Concierge = forwardRef<
  ConciergeHandle,
  {
    context?: () => Record<string, string>;
    blocked?: string;
    /** Embed panel hook: tells the host frame the shopper closed the panel. */
    onClose?: () => void;
  }
>(function Concierge({ context, blocked, onClose }, ref) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<ConciergePrefill>(null);
  useImperativeHandle(
    ref,
    () => ({
      ask: (text?: string) => {
        setPrefill({ text: (text ?? '').trim(), token: Date.now() });
        setOpen(true);
      },
      close: () => setOpen(false),
    }),
    [],
  );
  return (
    <ConnectedConcierge
      context={context}
      blocked={blocked}
      open={open}
      prefill={prefill}
      onClose={() => {
        setOpen(false);
        onClose?.();
      }}
    />
  );
});
