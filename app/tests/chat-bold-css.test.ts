import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Brief B-UI2 regression guard: the chat stylesheet must ask for a Lato weight
// that actually exists (300/400/700/900). A request for 500 falls back to
// Regular 400 with font-synthesis disabled, making bold text invisible.
const css = readFileSync(new URL('../src/concierge/connected.css', import.meta.url), 'utf8');

describe('chat bold CSS contract', () => {
  it('renders strong at 700, never 500', () => {
    const block = css.match(/\.connected-markdown strong\s*\{[^}]*\}/)?.[0] ?? '';
    expect(block).toContain('font-weight: 700');
    expect(block).not.toContain('font-weight: 500');
  });
});
