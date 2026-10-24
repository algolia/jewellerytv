import { describe, expect, it } from 'vitest';
import { buildChipRows, humanizeAttribute, CHIP_VALUES_MAX } from '../../src/concierge/FacetChips';

describe('buildChipRows', () => {
  it('orders values by result count and caps the row', () => {
    const rows = buildChipRows({
      displayFacets: ['Catalog_ProductType'],
      facets: {
        Catalog_ProductType: {
          Ring: 6726,
          Charm: 3,
          'Toe Ring': 12,
          Earrings: 3,
          'Jewelry Set': 28,
          A: 9,
          B: 8,
          C: 7,
        },
      },
    });
    expect(rows[0].values).toEqual(['Ring', 'Jewelry Set', 'Toe Ring', 'A', 'B', 'C']);
    expect(rows[0].values.length).toBeLessThanOrEqual(CHIP_VALUES_MAX);
  });

  it('suppresses single-value facets', () => {
    const rows = buildChipRows({
      displayFacets: ['Catalog_Brand'],
      facets: { Catalog_Brand: { 'Gems En Vogue': 854 } },
    });
    expect(rows).toEqual([]);
  });

  it('humanizes attribute names without the Catalog prefix', () => {
    expect(humanizeAttribute('Catalog_WatchStyle')).toBe('Style');
    expect(humanizeAttribute('Catalog_MovementType')).toBe('Movement Type');
    expect(humanizeAttribute('Catalog_Brand')).toBe('Brand');
  });
});
