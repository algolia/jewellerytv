import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeProduct } from '../src/catalog';
import { ProductWorkspace, type WorkspaceViewModel } from '../src/ProductWorkspace';

const product = (id: string) =>
  normalizeProduct({
  objectID: id,
  Catalog_TitleDescription: `Piece ${id}`,
  Catalog_ProductType: 'Ring',
  Pricing_ActivePrice: 99,
    Inventory_InStock: true,
    Media_Images: [],
  });
function model(): WorkspaceViewModel {
  const a = product('a'),
    b = product('b'),
    c = product('c'),
    d = product('d'),
    e = product('e'),
    f = product('f');
  return {
    discoveries: [
      {
        title: 'Everyday',
        items: [
          { product: a, why: 'One' },
          { product: b, why: 'Two' },
          { product: a, why: 'Duplicate' },
        ],
      },
      {
        title: 'Statement',
        items: [
          { product: c, why: 'Three' },
          { product: d, why: 'Four' },
        ],
      },
      {
        title: 'Gift',
        items: [
          { product: e, why: 'Five' },
          { product: f, why: 'Six' },
        ],
      },
    ],
  };
}
describe('grouped discovery workspace', () => {
  it('renders three type columns with two visible variations and deduplicates products', () => {
    const html = renderToStaticMarkup(<ProductWorkspace model={model()} />);
    expect(html).toContain('class="pw-discovery-groups"');
    expect(html).toContain('data-group-count="3"');
    expect(html).toContain('<h3>Everyday</h3>');
    expect(html.match(/data-product-id="a"/g)?.length).toBe(1);
    expect(html.match(/data-product-id=/g)?.length).toBe(6);
    expect(html).not.toContain('Explore the category');
    expect(html).not.toContain('Three different types');
    expect(html).not.toContain('Explore each style');
    expect(html).toContain('Everyday');
    expect(html).toContain('Statement');
    expect(html).toContain('Gift');
    expect(html).not.toContain('In stock');
    expect(html).not.toContain('Needs verification');
  });

  it('does not promise a complete three-by-two grid when a family lacks two products', () => {
    const workspace = model();
    workspace.discoveries = [
      workspace.discoveries[0],
      { title: 'Statement', items: [{ product: product('c'), why: 'Three' }] },
      workspace.discoveries[2],
    ];
    const html = renderToStaticMarkup(<ProductWorkspace model={workspace} />);
    expect(html).not.toContain('Explore the category');
  });

  it('renders piped agent group titles as one plain style line', () => {
    // Arijit, 2026-10-22: the canvas speaks to shoppers, not to an agent;
    // "Pearl | Drop & Dangle Earrings" must render as one plain line.
    const workspace = model();
    workspace.discoveries = [{ title: 'Pearl | Drop & Dangle Earrings', items: workspace.discoveries[0].items }];
    const html = renderToStaticMarkup(<ProductWorkspace model={workspace} />);
    expect(html).toContain('<h3>Pearl Drop &amp; Dangle Earrings</h3>');
    expect(html).not.toContain('Pearl |');
  });

  it('omits the redundant product-type heading when all choices already share that type', () => {
    const workspace = model();
    workspace.discoveries = [
      {
        title: 'Product type: Ring',
        items: [
          { product: product('ring-a'), why: 'First ring' },
          { product: product('ring-b'), why: 'Second ring' },
        ],
      },
    ];
    const html = renderToStaticMarkup(<ProductWorkspace model={workspace} />);
    expect(html).not.toContain('Product type: Ring');
    expect(html.match(/data-product-id=/g)?.length).toBe(2);
  });

  it('shows concise catalogue family values instead of repeating their field labels', () => {
    const workspace = model();
    workspace.discoveries = [
      { title: 'Ring style: Halo', items: [{ product: product('a') }, { product: product('b') }] },
      {
        title: 'Ring style: Center Design',
        items: [{ product: product('c') }, { product: product('d') }],
      },
      {
        title: 'Ring style: Solitaire',
        items: [{ product: product('e') }, { product: product('f') }],
      },
    ];
    const html = renderToStaticMarkup(<ProductWorkspace model={workspace} />);
    expect(html).toContain('<h3>Halo</h3>');
    expect(html).toContain('<h3>Center Design</h3>');
    expect(html).toContain('<h3>Solitaire</h3>');
    expect(html).not.toContain('Ring style:');
  });

  it('does not call repeated group labels three different types', () => {
    const workspace = model();
    workspace.discoveries = workspace.discoveries.map((group) => ({
      ...group,
      title: 'Product type: Ring',
    }));
    const html = renderToStaticMarkup(<ProductWorkspace model={workspace} />);
    expect(html).not.toContain('Explore the category');
    expect(html.match(/class="pw-discovery-group"/g)?.length).toBe(1);
    expect(html).not.toContain('Product type: Ring');
  });
});

describe('presentation caps and previous-choice label', () => {
  function gridModel(
    mode: 'search_results' | undefined,
    extraRows = false,
    stale = false,
  ): WorkspaceViewModel {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
    const [a, b, c, d, e, f, g, h] = ids.map(product);
    const columns = [
      {
        title: 'opal necklaces',
        mode,
        items: [
          { product: a, why: 'One' },
          { product: b, why: 'Two' },
          { product: c, why: 'Three' },
          { product: d, why: 'Four' },
          { product: e, why: 'Five' },
          { product: f, why: 'Six' },
          { product: g, why: 'Seven' },
          { product: h, why: 'Eight' },
          ...(extraRows ? [{ product: ids[8], why: 'Nine' }.product ? { product: product('i'), why: 'Nine' } : { product: product('i'), why: 'Nine' }] : []),
        ],
      },
    ];
    return {
      discoveries: columns,
      discoveriesStale: stale,
    };
  }

  it('renders the chips-native search group at the full tile cap', () => {
    const html = renderToStaticMarkup(<ProductWorkspace model={gridModel('search_results')} />);
    expect(html.match(/data-product-id=/g)?.length).toBe(8);
  });

  it('caps a plain presentation at two variants per column', () => {
    const html = renderToStaticMarkup(<ProductWorkspace model={gridModel(undefined)} />);
    expect(html.match(/data-product-id=/g)?.length).toBe(2);
  });

  it('labels retained discoveries as previous choices when the flag is set', () => {
    const html = renderToStaticMarkup(
      <ProductWorkspace model={gridModel(undefined, false, true)} />,
    );
    expect(html).toContain('Showing your previous choices.');
  });

  it('omits the previous-choice label for a fresh selection', () => {
    const html = renderToStaticMarkup(
      <ProductWorkspace model={gridModel(undefined, false, false)} />,
    );
    expect(html).not.toContain('Showing your previous choices.');
  });
});
