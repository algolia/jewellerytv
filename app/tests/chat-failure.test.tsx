import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Concierge } from '../src/concierge/Concierge';
import { Shell } from '../src/website/shell/Shell';

vi.mock('../src/concierge/ConnectedConcierge', () => ({ ConnectedConcierge: () => null }));

it('the closed Concierge renders no launcher and no panel chrome', () => {
  const html = renderToStaticMarkup(<Concierge />);
  expect(html).toBe('');
  expect(html).not.toContain('Ask Concierge');
  expect(html).not.toContain('concierge-panel');
});

it('the header search bar carries the Ask JTV chip beside keyword search', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <Shell onAsk={() => undefined}>
        <p>Body</p>
      </Shell>
    </MemoryRouter>,
  );
  expect(html).toContain('Ask JTV');
  expect(html).toContain('class="ask-chip"');
  expect(html).not.toContain('Ask Concierge');
  expect(html).toContain('aria-label="Search"');
});
