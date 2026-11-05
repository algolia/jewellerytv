import { describe, expect, it } from 'vitest';
import {
  buildRefineParams,
  extractTurnRefine,
  type SearchPart,
} from '../../src/concierge/chat/refineSearch';

/* The refine re-issues the turn's own search with the shopper's chip
 * selections ANDed on top, so a tap can never drop the turn's context. These
 * tests feed the two tool shapes seen on the wire (per-index tools whose
 * constraints ride `facet_<Attribute>` keys, and the generic tool whose
 * constraints ride `facet_filters`). */

const perIndex = (input: Record<string, unknown>): SearchPart => ({
  type: 'tool-algolia_search_index_prod_catalog',
  toolName: 'algolia_search_index_prod_catalog',
  input,
  output: {},
});

const generic = (input: Record<string, unknown>): SearchPart => ({
  type: 'tool-algolia_search_index',
  toolName: 'algolia_search_index',
  input: { index: 'prod_catalog', ...input },
  output: {},
});

describe('reading the turn to refine', () => {
  it('reads query and facet_filters OR-groups from the generic shape', () => {
    const turn = extractTurnRefine(
      generic({
        query: 'two-tone rings',
        facet_filters: [
          [
            'Catalog_JewelryMaterialNavigationName:Gold',
            'Catalog_JewelryMaterialNavigationName:Silver',
          ],
        ],
      }),
    );
    expect(turn.queryText).toBe('two-tone rings');
    expect(turn.turnFilters).toEqual([
      [
        'Catalog_JewelryMaterialNavigationName:Gold',
        'Catalog_JewelryMaterialNavigationName:Silver',
      ],
    ]);
  });

  it('reads query and facet_ keys from the per-index shape', () => {
    const turn = extractTurnRefine(
      perIndex({
        queries: [{ query: 'opal', facet_Pricing_PriceRange: ['$50 - $100', '$100 - $200'] }],
      }),
    );
    expect(turn.queryText).toBe('opal');
    expect(turn.turnFilters).toEqual([
      ['Pricing_PriceRange:$50 - $100', 'Pricing_PriceRange:$100 - $200'],
    ]);
  });

  it('carries no filters when the turn had none', () => {
    expect(extractTurnRefine(generic({ query: 'opal' })).turnFilters).toEqual([]);
  });

  it('drops empty and malformed constraint values', () => {
    const turn = extractTurnRefine(
      perIndex({
        queries: [{ query: 'opal', facet_Pricing_PriceRange: [], facet_Bad: 'nope', '': ['x'] }],
      }),
    );
    expect(turn.turnFilters).toEqual([]);
  });

  it('flags a multi-query turn as multi-scope', () => {
    const turn = extractTurnRefine(
      perIndex({ queries: [{ query: 'rings' }, { query: 'earrings' }] }),
    );
    expect(turn.multiScope).toBe(true);
  });

  it('a single-query turn is not multi-scope', () => {
    expect(extractTurnRefine(generic({ query: 'opal' })).multiScope).toBe(false);
  });
});

describe('building the refine search', () => {
  const pick = {
    queryText: 'two-tone rings',
    turnFilters: [['Pricing_PriceRange:$50 - $100', 'Pricing_PriceRange:$100 - $200']],
  };

  it('ands the chip selections on top of the turn constraints', () => {
    expect(
      buildRefineParams(pick, [
        { attribute: 'Catalog_JewelryMaterialNavigationColor', value: 'White' },
      ]),
    ).toEqual({
      query: 'two-tone rings',
      facetFilters: [
        ['Pricing_PriceRange:$50 - $100', 'Pricing_PriceRange:$100 - $200'],
        'Catalog_JewelryMaterialNavigationColor:"White"',
      ],
    });
  });

  it('stacks successive selections, order preserved', () => {
    const params = buildRefineParams(pick, [
      { attribute: 'Catalog_JewelryMaterialNavigationColor', value: 'White' },
      { attribute: 'Catalog_ProductType', value: 'Ring' },
    ]);
    expect(params.facetFilters).toEqual([
      ['Pricing_PriceRange:$50 - $100', 'Pricing_PriceRange:$100 - $200'],
      'Catalog_JewelryMaterialNavigationColor:"White"',
      'Catalog_ProductType:"Ring"',
    ]);
  });

  it('is pure: same inputs, same params', () => {
    const first = buildRefineParams(pick, [{ attribute: 'A', value: 'B' }]);
    const second = buildRefineParams(pick, [{ attribute: 'A', value: 'B' }]);
    expect(first).toEqual(second);
  });
});
