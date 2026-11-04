import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatActions } from '../../src/concierge/chat/chatActions';

/* The library's default message actions attach a "Regenerate" button (the
 * circular-arrows icon) and a "Copy" button to every assistant reply. Both
 * are dropped: a regenerated turn replays a paid agent call the shopper did
 * not ask for, and copying chat text is not a shopping action. The rest
 * (error retry, feedback) renders exactly as the library renders it. */

const copy = {
  title: 'Copy to clipboard',
  icon: () => <i data-test="copy-icon" />,
  onClick: () => undefined,
};
const regenerate = {
  title: 'Regenerate',
  icon: () => <i data-test="reload-icon" />,
  onClick: () => undefined,
};
const helpful = { title: 'Helpful', icon: () => <i data-test="up-icon" />, onClick: () => undefined };

const render = (actions: Parameters<typeof ChatActions>[0]['actions']) =>
  renderToStaticMarkup(<ChatActions actions={actions} message={{ id: 'm1', parts: [] } as never} />);

describe('the assistant message actions', () => {
  it('drops regenerate and copy, keeps the rest', () => {
    const html = render([copy, regenerate, helpful]);
    expect(html).not.toContain('Regenerate');
    expect(html).not.toContain('reload-icon');
    expect(html).not.toContain('copy-icon');
    expect(html).toContain('Helpful');
  });

  it('renders nothing when every action is dropped', () => {
    expect(render([copy, regenerate])).toBe('');
  });

  it('renders the kept actions with the library action class so styling matches', () => {
    const html = render([helpful]);
    expect(html).toContain('ais-ChatMessage-action');
  });
});
