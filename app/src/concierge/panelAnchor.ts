import { useLayoutEffect, useRef, useState } from 'react';

/* Where the panel's top edge belongs, measured rather than assumed.
 *
 * The panel hangs from the bottom of the storefront's navigation bar. That
 * was three hardcoded offsets until 2026-11-12 — one per header breakpoint —
 * which held only at the top of the page: the panel is `position: fixed`, so
 * it kept its 186px gap long after the header it referred to had scrolled
 * away, giving up a quarter of a short viewport to nothing.
 *
 * Measuring the nav's own `getBoundingClientRect().bottom` answers every case
 * with one rule and no branching, because that number already encodes
 * whether the header sticks:
 *
 *   sticky header      the bottom never moves, so the panel stays flush
 *   scrolling header   the bottom falls, so the panel rides up with it 1:1
 *                      and stops at the gutter
 *   no header at all   the gutter, from the first frame
 *
 * All three are live: jtv.com's header is sticky on desktop and not on
 * mobile, our demo storefront is sticky at neither, and the embed renders
 * the panel alone inside an iframe where there is no nav to find. */

/** Matching the gutter the panel already keeps on its right. */
export const DESKTOP_GUTTER = 24;

/* Below this the panel is full-screen and edge to edge with square corners,
 * so its collapsed bar belongs flush against the top rather than floating a
 * gutter below it. Same breakpoint as the stylesheet's full-screen block. */
const MOBILE = '(max-width: 48rem)';

export function minGutterFor(isMobile: boolean): number {
  return isMobile ? 0 : DESKTOP_GUTTER;
}

/* Rounded because this lands in a style attribute on every scroll frame, and
 * a fractional device pixel ratio otherwise produces a new string — and so a
 * new render — for movement the eye cannot see. */
export function anchorTop(navBottom: number | null, minGutter: number): number {
  if (navBottom === null || !Number.isFinite(navBottom)) return minGutter;
  return Math.max(minGutter, Math.round(navBottom));
}

/* Returns the offset in pixels, or null before the first measurement and
 * whenever tracking is off — in which case the stylesheet's own fallback
 * stands.
 *
 * This is the first scroll listener in the application, so it does not follow
 * the plain `addEventListener` house style in `useConciergeWindowControls`:
 * scroll fires far more often than resize or pointermove, and a layout read
 * per event would force synchronous layout on every one. Hence `passive` and
 * one measurement per animation frame. */
export function usePanelAnchorTop(selector: string | undefined, enabled: boolean): number | null {
  const [top, setTop] = useState<number | null>(null);
  const frame = useRef(0);

  /* Before paint, so the panel opens where it belongs rather than at the
   * stylesheet fallback and then jumping. */
  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setTop(null);
      return;
    }

    function measure() {
      frame.current = 0;
      /* Queried every time rather than captured once: the storefront is a
       * single page application and re-renders its header across routes. */
      const anchor = selector ? document.querySelector(selector) : null;
      const gutter = minGutterFor(window.matchMedia(MOBILE).matches);
      setTop(anchorTop(anchor ? anchor.getBoundingClientRect().bottom : null, gutter));
    }

    function schedule() {
      if (frame.current) return;
      frame.current = window.requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [selector, enabled]);

  return top;
}
