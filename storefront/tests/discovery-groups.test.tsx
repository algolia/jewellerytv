import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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
    products: [],
    selectionRecords: [a, b, c, d, e, f],
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
    activeView: 'discover',
    setView: vi.fn(),
    compareIds: [],
    toggleCompare: vi.fn(),
    pin: vi.fn(),
    remove: vi.fn(),
    refreshProducts: vi.fn(async () => undefined),
    refreshing: false,
    refreshError: '',
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
    expect(html).toContain('Three different types, two variations of each type.');
    expect(html).toContain('Explore each style, then save or compare the pieces you like.');
    expect(html).toContain('Everyday');
    expect(html).toContain('Statement');
    expect(html).toContain('Gift');
    expect(html).toContain('In stock');
    expect(html).not.toContain('One');
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
    expect(html).not.toContain('Three different types, two variations of each type.');
    expect(html).not.toContain('Explore each style, then save or compare the pieces you like.');
    expect(html).not.toContain('Showing available matching pieces.');
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
    expect(html).not.toContain('Three different types, two variations of each type.');
    expect(html.match(/class="pw-discovery-group"/g)?.length).toBe(1);
    expect(html).not.toContain('Product type: Ring');
  });

  it('renders proposed looks in Saved with saved pieces marked', () => {
    const workspace = model();
    workspace.activeView = 'saved';
    workspace.products = [{ product: product('a'), quantity: 1, observedAt: '' }];
    workspace.proposedLooks = [
      {
        title: 'Everyday Gold Trio',
        lines: [
          { product: product('a'), why: 'Anchor', quantity: 1 },
          { product: product('c'), why: 'Companion', quantity: 1 },
        ],
        itemSubtotalCents: 19800,
      },
    ];
    const html = renderToStaticMarkup(<ProductWorkspace model={workspace} />);
    expect(html).toContain('Everyday Gold Trio');
    expect(html).toContain('Saved ✓');
    expect(html).toContain('$198.00');
    expect(html).not.toContain('Add to combination');
    expect(html).not.toContain('Quantity');
  });
});
