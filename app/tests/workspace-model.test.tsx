import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeProduct } from '../src/shared/catalog';
import { ProductWorkspace, type WorkspaceViewModel } from '../src/shared/ProductWorkspace';

const product = normalizeProduct({
  objectID: 'saved-1',
  Catalog_TitleDescription: 'Saved necklace',
  Pricing_ActivePrice: null,
  Media_Images: [],
});

function model(): WorkspaceViewModel {
  return {
    discoveries: [
      {
        title: 'One choice',
        items: [{ product, why: 'A useful direction' }],
      },
    ],
  };
}

describe('simplified workspace view model', () => {
  it('renders one discovery surface without tabs, save or compare', () => {
    const html = renderToStaticMarkup(<ProductWorkspace model={model()} />);
    expect(html).toContain('Saved necklace');
    expect(html).not.toContain('pw-views');
    expect(html).not.toContain('>Discover<');
    expect(html).not.toContain('>Compare<');
    expect(html).not.toContain('>Save<');
    expect(html).not.toContain('Needs verification');
    expect(html).not.toContain('Saved ✓');
  });

  it('links a tile straight to the product detail page', () => {
    const html = renderToStaticMarkup(<ProductWorkspace model={model()} />);
    expect(html).toContain('href="/product/saved-1"');
    expect(html).toContain('aria-label="View details for Saved necklace, price unavailable."');
    expect(html).not.toContain('View product page');
  });

  it('shows the name and one price only, never stock or specs', () => {
    const priced = normalizeProduct({
      objectID: 'priced-1',
      Catalog_TitleDescription: 'Priced ring',
      Pricing_ActivePrice: 129.5,
      Inventory_InStock: true,
      Media_Images: [],
    });
    const supplied: WorkspaceViewModel = {
      discoveries: [{ title: 'Rings', items: [{ product: priced }] }],
    };
    const html = renderToStaticMarkup(<ProductWorkspace model={supplied} />);
    expect(html).toContain('Priced ring');
    expect(html).toContain('$129.50');
    expect(html).not.toContain('In stock');
    expect(html).not.toContain('Out of stock');
    expect(html).not.toContain('Sizes');
  });

  it('explains when a withheld presentation leaves nothing to show', () => {
    const supplied = model();
    supplied.discoveries = [];
    supplied.discoveryUnavailable = true;
    const html = renderToStaticMarkup(<ProductWorkspace model={supplied} />);
    expect(html).toContain('No confirmed matches are ready to show.');
    expect(html).not.toContain('MAKE IT YOURS');
  });

  it('offers the welcome state on an empty fresh workspace', () => {
    const html = renderToStaticMarkup(
      <ProductWorkspace model={{ discoveries: [] }} onStart={() => undefined} />,
    );
    expect(html).toContain('MAKE IT YOURS');
  });

  it('labels retained discoveries as previous choices when the flag is set', () => {
    const html = renderToStaticMarkup(
      <ProductWorkspace model={{ ...model(), discoveriesStale: true }} />,
    );
    expect(html).toContain('Showing your previous choices.');
  });
});
