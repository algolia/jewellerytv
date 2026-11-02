import { describe, expect, it } from 'vitest';
import { indexOf, narrowChipsFor } from '../../src/concierge/chat/narrowChips';
import type { NarrowGroup } from '../../src/concierge/chat/narrowChips';

/** Chips come back grouped by attribute so each axis gets its own row; most
 * assertions only care about the labels in order. */
const labels = (groups: NarrowGroup[]) => groups.flatMap((g) => g.chips.map((c) => c.label));

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
    expect(labels(narrowChipsFor(perIndex()))).toEqual([
      'White',
      'Yellow',
      'Rose',
      /* Price bands come back in price order, not count order: the counts
       * here would put "$100 - $200" first and "Under $25" last. */
      'Under $25',
      '$50 - $100',
      '$100 - $200',
    ]);
  });

  it('phrases each chip as something a shopper would say', () => {
    const [first] = narrowChipsFor(perIndex())[0].chips;
    expect(first.ask).toBe('Show me the white ones');
    const band = narrowChipsFor(perIndex())
      .flatMap((g) => g.chips)
      .find((c) => c.label === '$100 - $200');
    expect(band?.ask).toBe('Show me the ones in $100 - $200');
  });

  /* One value describes the shelf rather than narrowing it. */
  it('skips an attribute with a single value', () => {
    expect(labels(narrowChipsFor(perIndex()))).not.toContain('Ring');
  });

  it('never offers a refinement the search already applied', () => {
    const applied = narrowChipsFor(
      perIndex({ queries: [{ query: 'opal', facet_Catalog_JewelryMaterialNavigationColor: ['White'] }] }),
    );
    expect(labels(applied)).not.toContain('White');
    expect(labels(applied)).toContain('Yellow');
  });

  it('reads an applied filter in the generic tool shape too', () => {
    const applied = narrowChipsFor(
      generic({ facet_filters: ['Catalog_JewelryMaterialNavigationColor:White'] }),
    );
    expect(labels(applied)).not.toContain('White');
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

/* Each axis is its own group so the panel can give it a row. */
describe('grouping', () => {
  it('returns one group per attribute', () => {
    const groups = narrowChipsFor(perIndex());
    expect(groups.map((g) => g.attribute)).toEqual([
      'Catalog_JewelryMaterialNavigationColor',
      'Pricing_PriceRange',
    ]);
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
    expect(labels(chips)).toContain('White');
  });
});
