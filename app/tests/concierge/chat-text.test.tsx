import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatText, isReplyPart } from '../../src/concierge/chat/chatText';

/* Reply-only display, ported from the pre-merge panel (78aa714): text the
 * model writes before or between its tool calls is working narration and
 * never renders; only text after the last tool call — the reply — does. The
 * simplification deleted that enforcement and the model's processing leaked
 * into the conversation ("That search returned just one result, let me
 * search again…"). */

const tool = { type: 'tool-algolia_grouped_results', toolCallId: 't1' };
const text = (s: string) => ({ type: 'text', text: s });

describe('reply-only text display', () => {
  it('keeps all text when the turn called no tools', () => {
    const parts = [text('Plain answer, no search needed.')];
    expect(isReplyPart(parts, 0)).toBe(true);
  });

  it('drops narration written before the first tool call', () => {
    const parts = [text('Let me search for graduation pieces.'), tool, text('Here are the pieces.')];
    expect(isReplyPart(parts, 0)).toBe(false);
  });

  it('drops narration between tool calls', () => {
    const parts = [
      tool,
      text('That search returned just one result, let me search again.'),
      tool,
      text('Great selection — here it is.'),
    ];
    expect(isReplyPart(parts, 1)).toBe(false);
  });

  it('keeps the reply written after the last tool call', () => {
    const parts = [text('narration'), tool, text('reply')];
    expect(isReplyPart(parts, 2)).toBe(true);
  });

  it('renders the reply text with markdown and nothing for narration', () => {
    const html = renderToStaticMarkup(
      <ChatText part={text('[Chain](/product/ABC123)')} message={{ parts: [tool, text('[Chain](/product/ABC123)')] }} partIndex={1} />,
    );
    expect(html).toContain('/product/ABC123');
    const dropped = renderToStaticMarkup(
      <ChatText part={text('Let me search.')} message={{ parts: [text('Let me search.'), tool] }} partIndex={0} />,
    );
    expect(dropped).toBe('');
  });

  it('holds unclassifiable streaming text so narration never flashes on and off', () => {
    const parts = [text('Let me show you some classic gift directions.')];
    expect(isReplyPart(parts, 0, 'streaming')).toBe(false);
  });

  it('renders a finished no-tool turn in full', () => {
    const parts = [text('Plain answer, no search needed.')];
    expect(isReplyPart(parts, 0, 'ready')).toBe(true);
  });
});
