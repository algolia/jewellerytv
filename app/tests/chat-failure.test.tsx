import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Concierge } from '../src/concierge/Concierge';
import { Shell } from '../src/website/shell/Shell';

/* The closed panel used to render nothing at all. It now renders an inert,
 * hidden shell so the chat instance survives a close and reopens on the same
 * conversation. What still has to hold is that nothing shopper-facing leaks
 * out of it: no launcher button competing with the Ask JTV chip, and no
 * composer a keyboard user could reach while the panel is shut. */
it('the closed Concierge renders hidden chrome and no reachable panel', () => {
  const html = renderToStaticMarkup(<Concierge />);
  expect(html).toContain('data-open="false"');
  expect(html).toContain('hidden=""');
  expect(html).not.toContain('Ask Concierge');
  expect(html).not.toContain('concierge-launcher');
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
