import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatText, textDisplay } from '../../src/concierge/chat/chatText';

/* Display contract (Arijit, 2026-11-04): the opening voice above the shelf
 * stays, the closing line stays, mid-turn processing narration never
 * renders. The old panel enforced this in code; the simplification deleted
 * the enforcement. */

const tool = { type: 'tool-algolia_grouped_results', toolCallId: 't1' };
const text = (s: string) => ({ type: 'text', text: s });

describe('assistant text display contract', () => {
  it('keeps the opening voice written before the first tool call', () => {
    const parts = [text('What a wonderful milestone to celebrate!'), tool];
    expect(textDisplay(parts, 0)).toBe('open');
  });

  it('drops narration between tool calls', () => {
    const parts = [tool, text('That search returned just one result, let me search again.'), tool];
    expect(textDisplay(parts, 1)).toBe('narration');
  });

  it('keeps the closing written after the last tool call', () => {
    const parts = [tool, text('Do you have a ballpark in mind?')];
    expect(textDisplay(parts, 1, 'ready')).toBe('closing');
  });

  it('holds trailing text while streaming so narration never flashes then clears', () => {
    const parts = [tool, text('Great! Now I have a strong selection.')];
    expect(textDisplay(parts, 1, 'streaming')).toBe('narration');
  });

  it("drops a process-talk opening (\"I'll search for…\")", () => {
    const parts = [text("I'll search for engagement rings within your budget."), tool];
    expect(textDisplay(parts, 0)).toBe('narration');
  });

  it("keeps a genuine opening that starts with the shopper's moment", () => {
    const parts = [text('What a wonderful milestone to celebrate!'), tool];
    expect(textDisplay(parts, 0)).toBe('open');
  });

  it('keeps all text on a turn with no tool calls', () => {
    const parts = [text('Plain answer.'), text('Second paragraph.')];
    expect(textDisplay(parts, 0, 'ready')).toBe('open');
    expect(textDisplay(parts, 1, 'streaming')).toBe('open');
  });

  it('renders the kept parts with markdown and drops narration at render time', () => {
    const html = renderToStaticMarkup(
      <ChatText part={text('[Chain](/product/ABC123)')} message={{ parts: [text('open'), tool, text('[Chain](/product/ABC123)')] }} partIndex={2} status="ready" />,
    );
    expect(html).toContain('/product/ABC123');
    const dropped = renderToStaticMarkup(
      <ChatText part={text('That search returned one result.')} message={{ parts: [tool, text('That search returned one result.'), tool] }} partIndex={1} />,
    );
    expect(dropped).toBe('');
  });
});
