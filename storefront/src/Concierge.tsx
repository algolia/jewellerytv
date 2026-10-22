import { forwardRef, useImperativeHandle, useState } from 'react';
import { ConnectedConcierge } from './concierge/ConnectedConcierge';
import { trackConciergeVisibility } from './analytics';
import './concierge-workspace.css';
import './concierge/connected.css';

export interface ConciergeHandle {
  /** Open the Concierge, optionally pre-filling the composer with the text. */
  ask: (text?: string) => void;
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
  { context?: () => Record<string, string>; blocked?: string }
>(function Concierge({ context, blocked }, ref) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<ConciergePrefill>(null);
  useImperativeHandle(
    ref,
    () => ({
      ask: (text?: string) => {
        setPrefill({ text: (text ?? '').trim(), token: Date.now() });
        setOpen(true);
      },
    }),
    [],
  );
  return (
    <ConnectedConcierge
      context={context}
      blocked={blocked}
      open={open}
      prefill={prefill}
      onClose={() => setOpen(false)}
    />
  );
});
