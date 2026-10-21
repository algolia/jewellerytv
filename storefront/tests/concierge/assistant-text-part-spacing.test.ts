import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Spacing between consecutive assistant text parts (2026-10-21, DIAG-6
 * follow-up, measured in the live DOM on the 5288 instance).
 *
 * One assistant turn arrives as several text parts (one per step). For a
 * single-paragraph part, markdown-to-jsx emits NO wrapping <p>, so the part
 * renders as bare inline text inside `.connected-assistant-text-part` — an
 * unstyled div — and consecutive parts run together with no blank line
 * between short paragraphs (the V6/DIAG-6 screenshot defect). Multi-paragraph
 * parts are unaffected: their real <p> elements carry the 0.7em margin from
 * `.connected-markdown p`.
 *
 * The fix is a spacing rule on the wrapper. jsdom cannot compute CSS, so this
 * test reads the stylesheet directly: it fails until the wrapper rule exists.
 * The rendered behavior was verified by computed-style inspection in the
 * browser (parts 0-1 had no <p> and no margin; part 2 had 6 <p> at 11.2px).
 */

const css = readFileSync(new URL('../../src/concierge/connected.css', import.meta.url), 'utf8');

describe('assistant text part spacing', () => {
  const ruleText = () => css.match(/\.connected-assistant-text-part\s*\{[^}]*\}/)?.[0] ?? '';
  const margins = () => {
    const m = ruleText().match(/margin(?:-top|-bottom)?\s*:\s*([^;]+);/);
    const values = (m?.[1] ?? '').trim().split(/\s+/);
    // CSS margin shorthand: 1 value = all sides; 2 = vertical horizontal; 3 = top horizontal bottom.
    const [top, bottom] =
      values.length === 1 ? [values[0], values[0]]
      : values.length === 2 ? [values[0], values[0]]
      : [values[0], values[2]];
    return { top, bottom };
  };

  it('gives .connected-assistant-text-part a paragraph-equivalent bottom margin', () => {
    expect(ruleText(), 'a .connected-assistant-text-part rule must exist in connected.css').toBeTruthy();
    expect(margins().bottom).toBe('0.7em');
  });

  it('keeps the last part from adding stray space before the composer', () => {
    expect(margins().top).toBe('0');
  });
});
