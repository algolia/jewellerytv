import { describe, expect, it } from 'vitest';
import { DESKTOP_GUTTER, anchorTop, minGutterFor } from '../../src/concierge/panelAnchor';

/* The arithmetic behind the panel tracking the navigation bar. The browser
 * half — listeners, rAF, the actual measurement — is covered end to end in
 * `tests/e2e/concierge-panel.spec.ts`; what is worth pinning here is the
 * rule it applies to whatever it measures. */

describe('where the panel hangs from', () => {
  it('sits at the nav when the nav is below the gutter', () => {
    expect(anchorTop(186, DESKTOP_GUTTER)).toBe(186);
  });

  /* A sticky header never moves, so this is the only case that ever happens
   * on jtv.com's desktop site and the clamp below never fires there. */
  it('keeps sitting there however far the page scrolls', () => {
    for (const scrolled of [186, 186, 186]) {
      expect(anchorTop(scrolled, DESKTOP_GUTTER)).toBe(186);
    }
  });

  /* A header that scrolls away takes the panel up with it, 1:1, until the
   * gutter catches it. That 1:1 stretch is what makes the panel read as
   * attached to the nav rather than animated. */
  it('rides up with a nav that scrolls away, then stops at the gutter', () => {
    expect(anchorTop(120, DESKTOP_GUTTER)).toBe(120);
    expect(anchorTop(40, DESKTOP_GUTTER)).toBe(40);
    expect(anchorTop(24, DESKTOP_GUTTER)).toBe(24);
    expect(anchorTop(10, DESKTOP_GUTTER)).toBe(24);
    expect(anchorTop(0, DESKTOP_GUTTER)).toBe(24);
    /* Scrolled past, the nav's bottom edge is negative. */
    expect(anchorTop(-400, DESKTOP_GUTTER)).toBe(24);
  });

  /* The embed renders the panel alone in an iframe, where there is no nav to
   * find. It used to inherit 198px of dead space at the top of a frame that
   * starts at zero. */
  it('falls back to the gutter when there is nothing to anchor to', () => {
    expect(anchorTop(null, DESKTOP_GUTTER)).toBe(DESKTOP_GUTTER);
    expect(anchorTop(null, 0)).toBe(0);
  });

  it('treats a nonsense measurement as no measurement', () => {
    expect(anchorTop(Number.NaN, DESKTOP_GUTTER)).toBe(DESKTOP_GUTTER);
    expect(anchorTop(Number.POSITIVE_INFINITY, DESKTOP_GUTTER)).toBe(DESKTOP_GUTTER);
  });

  /* The value lands in a style attribute on every scroll frame, so a
   * fractional device pixel ratio would otherwise produce a new string, and
   * a new render, for movement nobody can see. */
  it('rounds to whole pixels', () => {
    expect(anchorTop(185.6, DESKTOP_GUTTER)).toBe(186);
    expect(anchorTop(185.4, DESKTOP_GUTTER)).toBe(185);
  });
});

describe('the gutter it stops at', () => {
  /* Full-screen on a phone the panel is edge to edge with square corners, so
   * its collapsed bar belongs against the top rather than floating below it. */
  it('is nothing on mobile and a gutter on desktop', () => {
    expect(minGutterFor(true)).toBe(0);
    expect(minGutterFor(false)).toBe(DESKTOP_GUTTER);
  });

  it('matches the gutter the panel already keeps on its right', () => {
    expect(DESKTOP_GUTTER).toBe(24);
  });
});
