/*
 * Simplified workspace contract (2026-10-22, D1 to D5): one discovery surface,
 * tiles link to the PDP, no compare grid and no brief badges on tiles. These
 * tests keep the render rules that survive the simplification: no scripted
 * guidance copy, no conversation prose inside tiles, one honest detail link.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeProduct } from '../src/catalog';
import { ProductWorkspace, type WorkspaceViewModel } from '../src/ProductWorkspace';

const piece = normalizeProduct({
  objectID: 'a',
  Catalog_TitleDescription: 'Necklace',
  Pricing_ActivePrice: 54.99,
  Inventory_InStock: true,
  Media_Images: ['https://example.com/a.jpg'],
});

function model(overrides: Partial<WorkspaceViewModel> = {}): WorkspaceViewModel {
  return {
    discoveries: [{ title: 'Options', items: [{ product: piece }] }],
    ...overrides,
  };
}

describe('simplified product workspace', () => {
  it('opens product details from the tile: title and image sit inside one link', () => {
    const html = renderToStaticMarkup(<ProductWorkspace model={model()} />);
    const main = html.match(/<a[^>]*class="pw-product-main"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
    expect(main).toContain('pw-product-title');
    expect(main).toContain('href="/product/a"');
    expect(main).toContain('View details for');
  });

  it('keeps conversation prose out of compact Discover product tiles', () => {
    const chatty = normalizeProduct({
      ...piece.raw,
      Catalog_TitleDescription: 'Necklace',
    }) as typeof piece;
    const html = renderToStaticMarkup(
      <ProductWorkspace
        model={{
          discoveries: [
            { title: 'Options', why: 'Choose **blue**', items: [{ product: chatty, why: '**Small** stone' }] },
          ],
        }}
      />,
    );
    expect(html).not.toContain('Choose');
    expect(html).not.toContain('Small');
    expect(html).not.toContain('**Small**');
  });

  it('renders no tab guidance line: the panel spends its pixels on products, not copy about itself', () => {
    // Arijit, 2026-10-14: guidance copy above the products is redundant; real
    // estate is at a premium. It must not render anywhere in the panel.
    const html = renderToStaticMarkup(<ProductWorkspace model={model()} />);
    expect(html.indexOf('pw-view-guidance')).toBe(-1);
    expect(html).not.toContain('shows current recommendations');
    expect(html).not.toContain('holds the pieces you picked');
    expect(html).not.toContain('keeps the pieces you explicitly saved');
  });

  it('never renders compare or brief-conflict chrome on tiles', () => {
    const html = renderToStaticMarkup(<ProductWorkspace model={model()} />);
    expect(html).not.toContain('Compare');
    expect(html).not.toContain('Check against your brief');
    expect(html).not.toContain('Needs verification');
    expect(html).not.toContain('Not recorded');
    expect(html).not.toContain('Item subtotal');
  });
});
