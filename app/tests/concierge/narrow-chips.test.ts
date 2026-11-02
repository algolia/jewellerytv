import { describe, expect, it } from 'vitest';
import { indexOf, narrowChipsFor } from '../../src/concierge/chat/narrowChips';

/* The chips are built from facet counts the search already returned, so these
 * tests feed the two tool shapes we have actually seen on the wire. */
const facets = {
  Catalog_JewelryMaterialNavigationColor: { White: 400, Yellow: 300, Rose: 100, 'Two-tone': 40 },
  Pricing_PriceRange: { '$100 - $200': 500, '$50 - $100': 200, 'Under $25': 10 },
  Catalog_ProductType: { Ring: 900 },
};

const perIndex = (extra = {}) => ({
  type: 'tool-algolia_search_index_prod_catalog',
  toolName: 'algolia_search_index_prod_catalog',
  input: { queries: [{ query: 'opal' }], ...extra },
  output: { facets },
});

const generic = (extra = {}) => ({
  type: 'tool-algolia_search_index',
  toolName: 'algolia_search_index',
  input: { index: 'prod_catalog', query: 'opal', ...extra },
  output: { facets },
});

describe('which index answered', () => {
  /* Which tool shape the agent gets tracks the model, not our configuration
   * (measured 2026-11-02), so both have to be read. */
  it('reads the index from the tool name', () => {
    expect(indexOf(perIndex())).toBe('prod_catalog');
  });

  it('reads the index from the input when the tool is generic', () => {
    expect(indexOf(generic())).toBe('prod_catalog');
  });

  it('is undefined when neither says', () => {
    expect(indexOf({ toolName: 'algolia_grouped_results' })).toBeUndefined();
  });
});

describe('the narrowing chips', () => {
  it('offers values from the catalogue facets, highest count first', () => {
    const chips = narrowChipsFor(perIndex());
    expect(chips.map((c) => c.label)).toEqual([
      'White',
      'Yellow',
      'Rose',
      '$100 - $200',
      '$50 - $100',
      'Under $25',
    ]);
  });

  it('phrases each chip as something a shopper would say', () => {
    const [first] = narrowChipsFor(perIndex());
    expect(first.ask).toBe('Show me the white ones');
    const band = narrowChipsFor(perIndex()).find((c) => c.label === '$100 - $200');
    expect(band?.ask).toBe('Show me the ones in $100 - $200');
  });

  /* One value describes the shelf rather than narrowing it. */
  it('skips an attribute with a single value', () => {
    expect(narrowChipsFor(perIndex()).some((c) => c.label === 'Ring')).toBe(false);
  });

  it('never offers a refinement the search already applied', () => {
    const applied = narrowChipsFor(
      perIndex({ queries: [{ query: 'opal', facet_Catalog_JewelryMaterialNavigationColor: ['White'] }] }),
    );
    expect(applied.some((c) => c.label === 'White')).toBe(false);
    expect(applied.some((c) => c.label === 'Yellow')).toBe(true);
  });

  it('reads an applied filter in the generic tool shape too', () => {
    const applied = narrowChipsFor(
      generic({ facet_filters: ['Catalog_JewelryMaterialNavigationColor:White'] }),
    );
    expect(applied.some((c) => c.label === 'White')).toBe(false);
  });

  /* On-air facets narrow a broadcast, not a taste. */
  it('offers nothing for an on-air search', () => {
    expect(
      narrowChipsFor({
        toolName: 'algolia_search_index_on_air_products',
        input: {},
        output: { facets: { hosts: { Misty: 300, Melissa: 200 } } },
      }),
    ).toEqual([]);
  });

  it('offers nothing when the search returned no facets', () => {
    expect(narrowChipsFor(perIndex() && { toolName: 'algolia_search_index_prod_catalog' })).toEqual(
      [],
    );
  });
});

/* A rendered message part names its tool in `type` as `tool-<name>`; the raw
 * stream event uses `toolName`. The chips are built from the rendered part. */
describe('the rendered part shape', () => {
  it('reads the index from a tool- prefixed type', () => {
    expect(indexOf({ type: 'tool-algolia_search_index_prod_catalog' })).toBe('prod_catalog');
  });

  it('builds chips from a rendered part with no toolName', () => {
    const chips = narrowChipsFor({
      type: 'tool-algolia_search_index_prod_catalog',
      input: { queries: [{ query: 'opal' }] },
      output: { facets },
    });
    expect(chips.map((c) => c.label)).toContain('White');
  });
});
