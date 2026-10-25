import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { InlineProductCards } from '../../src/concierge/InlineProductCards';
import { normalizeProduct } from '../../src/shared/catalog';

function product(objectID: string) {
  return normalizeProduct({
    objectID,
    Catalog_TitleDescription: `Opal Ring ${objectID}`,
    Pricing_ActivePrice: 125,
    Media_Images: [],
  });
}

describe('InlineProductCards', () => {
  it('renders one section per group with PDP links', () => {
    const html = renderToStaticMarkup(
      createElement(InlineProductCards, {
        groups: [
          {
            title: 'Under $200',
            items: [
              { product: product('WPG776'), why: 'Brightest first' },
              { product: product('WPG777') },
            ],
          },
          { title: 'Yellow gold', items: [{ product: product('WPG778') }] },
        ],
      }),
    );
    expect(html).toContain('Under $200');
    expect(html).toContain('Yellow gold');
    expect(html).toContain('Opal Ring WPG776');
    expect(html).toContain('href="/product/WPG776"');
    expect(html).toContain('aria-label="View details for Opal Ring WPG776');
  });

  it('renders nothing when there are no groups', () => {
    const html = renderToStaticMarkup(createElement(InlineProductCards, { groups: [] }));
    expect(html).toBe('');
  });
});
