import { describe, expect, it } from 'vitest';
import { indexOf, narrowChipsFor } from '../../src/concierge/chat/narrowChips';
import type { NarrowGroup } from '../../src/concierge/chat/narrowChips';

/** Chips come back grouped by attribute so each axis gets its own row; most
 * assertions only care about the labels in order. */
const labels = (groups: NarrowGroup[]) => groups.flatMap((g) => g.chips.map((c) => c.label));

/* The chips are built from facet counts the search already returned, so these
 * tests feed the two tool shapes we have actually seen on the wire. The
 * attributes are deliberately NOT a fixed list in the source under test: the
 * 2026-10-23 law is that offerable facets derive from the index, so gemstone
 * and purity here are regression guards against the old hardcoded whitelist. */
const facets = {
  Catalog_JewelryMaterialNavigationColor: { White: 400, Yellow: 300, Rose: 100, 'Two-tone': 40 },
  Catalog_GemstoneAndPearlNavigationName: { Opal: 90, Topaz: 60, Peridot: 30 },
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
  it('derives axes from the search counts, most discriminative first', () => {
    /* Fewest values first, attribute name breaking ties: gemstone (3) and
     * price (3) tie and resolve by name, color (4) follows; the one-value
     * attribute never shows. */
    const axes = narrowChipsFor(perIndex()).map((g) => g.attribute);
    expect(axes).toEqual([
      'Catalog_GemstoneAndPearlNavigationName',
      'Pricing_PriceRange',
      'Catalog_JewelryMaterialNavigationColor',
    ]);
  });

  it('offers an attribute the old hardcoded whitelist never carried', () => {
    /* Regression guard for the 2026-10-23 no-whitelist law. */
    expect(labels(narrowChipsFor(perIndex()))).toContain('Opal');
  });

  it('skips an attribute with a single value', () => {
    expect(labels(narrowChipsFor(perIndex()))).not.toContain('Ring');
  });

  it('skips an attribute whose values read as a spec sheet', () => {
    const part = perIndex() as ReturnType<typeof perIndex> & {
      output: { facets: Record<string, Record<string, number>> };
    };
    part.output = {
      facets: {
        ...facets,
        Catalog_Motif: Object.fromEntries(
          Array.from({ length: 25 }, (_, i) => [`Motif ${i + 1}`, 100 - i]),
        ),
      },
    };
    expect(narrowChipsFor(part).map((g) => g.attribute)).not.toContain('Catalog_Motif');
  });

  /* Condition is a scope fact, never a narrowing question (Arijit,
   * 2026-11-04): the gate refuses pre-owned pieces and the axis never offers
   * "First Quality / Pre-Owned" as a choice. */
  it('never offers the condition axis', () => {
    const part = perIndex() as ReturnType<typeof perIndex> & {
      output: { facets: Record<string, Record<string, number>> };
    };
    part.output = {
      facets: {
        ...facets,
        Catalog_Condition: { 'First Quality': 300, 'Pre-Owned': 40 },
      },
    };
    const chips = narrowChipsFor(part);
    expect(chips.map((g) => g.attribute)).not.toContain('Catalog_Condition');
    expect(labels(chips)).not.toContain('Pre-Owned');
    expect(labels(chips)).not.toContain('First Quality');
  });

  it('orders price bands by price, not count', () => {
    const price = narrowChipsFor(perIndex()).find((g) => g.attribute === 'Pricing_PriceRange');
    expect(price?.chips.map((c) => c.label)).toEqual(['Under $25', '$50 - $100', '$100 - $200']);
  });

  it('never offers a refinement the search already applied', () => {
    const applied = narrowChipsFor(
      perIndex({
        queries: [{ query: 'opal', facet_Catalog_JewelryMaterialNavigationColor: ['White'] }],
      }),
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

  it('carries attribute and value for the refine, not an ask sentence', () => {
    const [chip] = narrowChipsFor(perIndex()).flatMap((g) => g.chips);
    expect(chip.attribute).toBe('Catalog_GemstoneAndPearlNavigationName');
    expect(chip.value).toBe('Opal');
    expect(chip.label).toBe('Opal');
    expect('ask' in chip).toBe(false);
  });
});

/* Each axis is its own group so the panel can give it a row. */
describe('grouping', () => {
  it('returns one group per attribute', () => {
    const groups = narrowChipsFor(perIndex());
    expect(groups.map((g) => g.attribute)).toEqual([
      'Catalog_GemstoneAndPearlNavigationName',
      'Pricing_PriceRange',
      'Catalog_JewelryMaterialNavigationColor',
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
    expect(labels(chips)).toContain('Opal');
  });
});
