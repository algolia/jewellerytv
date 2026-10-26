import { describe, expect, it } from 'vitest';
import {
  extractMessageFacetPicks,
  extractMessageAnchors,
  extractSearchPresentation,
} from '../../src/concierge/nativeResults';
import { createPresentProducts, matchRequirement } from '../../src/concierge/tools/presentProducts';

/* Curation restored (2026-10-24): the model picks pieces + facets via
 * `present_products`; the extractors read that call and cross-check every
 * chosen id against the streamed search hits. */

const userMessage = (text: string) => ({
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text }],
});

const searchPart = (
  hits: unknown[],
  options: { queries?: number; facets?: Record<string, Record<string, number>>; id?: string } = {},
) => ({
  type: 'tool-algolia_search_index_prod_catalog',
  toolCallId: options.id ?? 'call-1',
  state: 'output-available',
  input: {
    queries: Array.from({ length: options.queries ?? 1 }, (_, index) => ({
      query: index === 0 ? 'tanzanite ring' : `other query ${index}`,
    })),
  },
  output: { hits, facets: options.facets },
});

const presentPart = (
  objectIDs: string[],
  displayFacets: string[] = [],
  output: unknown = { status: 'ok', objectIDs: objectIDs.map((objectID) => ({ objectID })), dropped: [], displayFacets },
) => ({
  type: 'tool-present_products',
  toolCallId: 'call-present',
  state: 'output-available',
  input: { objectIDs, displayFacets },
  output,
});

const hit = (objectID: string, extra: Record<string, unknown> = {}) => ({
  objectID,
  Catalog_TitleDescription: `Product ${objectID}`,
  Pricing_ActivePrice: 635.11,
  Inventory_InStock: true,
  Media_Images: ['https://example.com/a.jpg'],
  ...extra,
});

const message = (id: string, parts: unknown[]) => ({ id, role: 'assistant', parts });

const counts = (n: number, prefix = 'v') =>
  Object.fromEntries(Array.from({ length: n }, (_, index) => [`${prefix}${index}`, 10 - index]));

describe('extractSearchPresentation (curation restored)', () => {
  it('takes the model-curated objectIDs from the present_products output', () => {
    const messages = [
      userMessage('show me tanzanite rings'),
      message('a1', [searchPart([hit('h1'), hit('h2'), hit('h3'), hit('h4')]), presentPart(['h3', 'h1'])]),
    ];
    const presentation = extractSearchPresentation(messages as never);
    expect(presentation?.objectIDs).toEqual(['h3', 'h1']);
    expect(presentation?.queryText).toBe('tanzanite ring');
    expect(presentation?.records.get('h2')).toMatchObject({ objectID: 'h2' });
  });

  it('cross-checks: a chosen id the search never returned renders nothing', () => {
    const messages = [
      userMessage('show me tanzanite rings'),
      message('a1', [searchPart([hit('h1')]), presentPart(['h1', 'invented-id'])]),
    ];
    expect(extractSearchPresentation(messages as never)?.objectIDs).toEqual(['h1']);
  });

  it('returns null without a successful present_products call', () => {
    const messages = [
      userMessage('q'),
      message('a1', [searchPart([hit('h1')]), presentPart(['h1'], [], { status: 'empty', objectIDs: [], dropped: [], displayFacets: [] })]),
    ];
    expect(extractSearchPresentation(messages as never)).toBeNull();
    expect(extractSearchPresentation([userMessage('q'), message('a1', [searchPart([hit('h1')])])] as never)).toBeNull();
  });

  it('suppresses the presentation when a search carried several queries', () => {
    const messages = [
      userMessage('q'),
      message('a1', [searchPart([hit('h1')], { queries: 3 }), presentPart(['h1'])]),
    ];
    expect(extractSearchPresentation(messages as never)).toBeNull();
  });

  it('caps the tiles at eight', () => {
    const hits = Array.from({ length: 14 }, (_, index) => hit(`h${index}`));
    const chosen = hits.map((h) => (h as { objectID: string }).objectID);
    const messages = [userMessage('q'), message('a1', [searchPart(hits), presentPart(chosen)])];
    expect(extractSearchPresentation(messages as never)?.objectIDs).toHaveLength(8);
  });

  it('reads only the latest turn: an earlier presentation stays staged', () => {
    const messages = [
      userMessage('first'),
      message('a1', [searchPart([hit('old')]), presentPart(['old'])]),
      userMessage('what about silver'),
      message('a2', [{ type: 'text', text: 'answer without tools' }]),
    ];
    expect(extractSearchPresentation(messages as never)).toBeNull();
  });
});

describe('extractMessageFacetPicks (model pick restored)', () => {
  it('takes the pick from the present_products input, not a heuristic', () => {
    const facets = { Catalog_GemstoneName: counts(30), Catalog_Condition: counts(2) };
    const messages = [
      userMessage('q'),
      message('a1', [searchPart([hit('h1')], { facets }), presentPart(['h1'], ['Catalog_GemstoneName'])]),
    ];
    const picks = extractMessageFacetPicks(messages as never);
    expect(picks).toHaveLength(1);
    expect(picks[0].pick.displayFacets).toEqual(['Catalog_GemstoneName']);
    expect(picks[0].pick.queryText).toBe('tanzanite ring');
    expect(picks[0].hits).toHaveLength(1);
  });

  it('suppresses chips on a multi-query message', () => {
    const messages = [
      userMessage('q'),
      message('a1', [searchPart([hit('h1')], { queries: 2 }), presentPart(['h1'], ['MetalColor'])]),
    ];
    expect(extractMessageFacetPicks(messages as never)).toHaveLength(0);
  });

  it('emits no pick when the model sent no displayFacets', () => {
    const messages = [userMessage('q'), message('a1', [searchPart([hit('h1')]), presentPart(['h1'])])];
    expect(extractMessageFacetPicks(messages as never)).toHaveLength(0);
  });

  it('accumulates facet counts per message across the conversation', () => {
    const messages = [
      userMessage('q'),
      message('a1', [searchPart([hit('h1')], { facets: { MetalColor: counts(3) }, id: 'c1' }), presentPart(['h1'], ['MetalColor'])]),
      message('a2', [searchPart([hit('h2')], { facets: { Gemstone: counts(4) }, id: 'c2' }), presentPart(['h2'], ['Gemstone'])]),
    ];
    const picks = extractMessageFacetPicks(messages as never);
    expect(picks[0].pick.displayFacets).toEqual(['MetalColor']);
    expect(picks[1].pick.displayFacets).toEqual(['Gemstone']);
  });
});

describe('extractMessageAnchors (curation restored)', () => {
  it('returns one anchor per assistant message that carries a present_products output', () => {
    const messages = [
      userMessage('show me opal rings'),
      message('a1', [searchPart([hit('WPG776'), hit('WPG777'), hit('WPG778'), hit('WPG779'), hit('WPG780')]), presentPart(['WPG776', 'WPG777', 'WPG778', 'WPG779', 'WPG780'])]),
      userMessage('make it yellow gold'),
      message('a2', [searchPart([hit('WPG781')], { id: 'call-2' }), presentPart(['WPG781'])]),
    ];
    const anchors = extractMessageAnchors(messages);
    expect(anchors.map((anchor) => anchor.messageId)).toEqual(['a1', 'a2']);
    /* Anchors cap at four tiles per message. */
    expect(anchors[0].groups.map((g) => g.objectIDs)).toEqual([
      ['WPG776', 'WPG777', 'WPG778', 'WPG779'],
    ]);
    expect(anchors[1].groups.map((g) => g.objectIDs)).toEqual([['WPG781']]);
    expect(anchors[0].groups[0].title).toBe('tanzanite ring');
  });

  it('anchors nothing on a multi-query message', () => {
    const messages = [
      userMessage('show me opal rings'),
      message('a1', [searchPart([hit('WPG776')], { queries: 2 }), presentPart(['WPG776'])]),
    ];
    expect(extractMessageAnchors(messages)).toEqual([]);
  });

  it('skips assistant messages with no curation call', () => {
    const messages = [
      userMessage('what makes opal different?'),
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Play of color.' }] },
    ];
    expect(extractMessageAnchors(messages)).toEqual([]);
  });
});

describe('present_products tool', () => {
  const record = (objectID: string, overrides: Record<string, unknown> = {}) => ({
    objectID,
    name: `Product ${objectID}`,
    price: 125,
    inStock: true,
    imageUrl: 'https://example.com/a.jpg',
    link: `/product/${objectID}`,
    ...overrides,
  });
  const fetcher = async (ids: readonly string[]) => {
    const map = new Map();
    for (const id of ids) {
      if (id === 'ghost') continue;
      map.set(id, record(id));
    }
    return map;
  };
  const present = createPresentProducts(fetcher);

  it('verifies every piece and echoes the facet pick', async () => {
    const result = await present({ objectIDs: ['a', 'b'], displayFacets: ['MetalColor', 'MetalColor', 'Gemstone'] });
    expect(result.status).toBe('ok');
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['a', 'b']);
    expect(result.displayFacets).toEqual(['MetalColor', 'Gemstone']);
  });

  it('drops out-of-stock, unpriced, image-less and unknown pieces with reasons', async () => {
    const flaky = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) {
        if (id === 'oos') map.set(id, record(id, { inStock: false }));
        else if (id === 'nopr') map.set(id, record(id, { price: null }));
        else if (id === 'noimg') map.set(id, record(id, { imageUrl: null }));
        else if (id === 'ok') map.set(id, record(id));
      }
      return map;
    };
    const result = await createPresentProducts(flaky)({ objectIDs: ['oos', 'nopr', 'noimg', 'ghost', 'ok'] });
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['ok']);
    expect(result.dropped.map((d) => d.reason)).toEqual([
      'out_of_stock',
      'unpriced',
      'no_image',
      'not_found',
    ]);
  });

  it('collapses same-design variants and caps at nine', async () => {
    const catalog: Record<string, Record<string, unknown>> = {};
    const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    for (let i = 0; i < 10; i++) catalog[`d${i}`] = record(`d${i}`, { name: `${words[i]} style hoop earrings` });
    catalog.v1 = record('v1', { name: 'Oval Diamond 10K Yellow Gold Huggie Hoop Earrings' });
    catalog.v2 = record('v2', { name: 'Oval Diamond 10K White Gold Huggie Hoop Earrings' });
    const rich = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) map.set(id, catalog[id]);
      return map;
    };
    const variants = await createPresentProducts(rich)({ objectIDs: ['v1', 'v2'] });
    expect(variants.objectIDs.map((i) => i.objectID)).toEqual(['v1']);
    const many = await createPresentProducts(rich)({ objectIDs: Object.keys(catalog) });
    /* The cap is a silent backstop: the tool description tells the model to
     * send at most eight, best first, so an over-long list is defensive only. */
    expect(many.objectIDs).toHaveLength(9);
  });

  it('rejects an empty call', async () => {
    expect((await present({ objectIDs: [] })).status).toBe('invalid_input');
  });

  it('drops pieces whose material fields contradict the shopper\'s own message', async () => {
    const vocabulary = {
      values: {
        'Catalog_JewelryMaterialNavigationPurity': ['Sterling', '10K', '14K', '18K', '24K'],
        'Catalog_GemstoneAndPearlNavigationName': ['Ruby', 'Sapphire', 'Emerald'],
      },
    };
    const catalog: Record<string, ReturnType<typeof record>> = {
      silver: record('silver', { name: 'Sterling Silver Heart Pendant' }),
      goldplated: record('goldplated', { name: 'Opal 18k Yellow Gold Over Sterling Silver Pendant' }),
    };
    const materialAware = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) {
        const base = catalog[id];
        const isGoldPlated = id === 'goldplated';
        map.set(id, {
          objectID: id,
          name: base.name,
          price: 100,
          inStock: true,
          imageUrl: 'https://example.com/a.jpg',
          link: `/product/${id}`,
          materialFields: isGoldPlated
            ? { 'Catalog_JewelryMaterialNavigationName': ['Gold Over Silver'], 'Catalog_JewelryMaterialNavigationPurity': ['18K'] }
            : { 'Catalog_JewelryMaterialNavigationName': ['Silver'], 'Catalog_JewelryMaterialNavigationPurity': ['Sterling'] },
        });
      }
      return map;
    };
    const result = await createPresentProducts(materialAware, {
      vocabulary: async () => vocabulary,
      shopperMessage: () => 'show me sterling silver rings',
    })({
      objectIDs: ['silver', 'goldplated'],
    });
    expect(result.status).toBe('ok');
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['silver']);
    expect(result.dropped).toContainEqual(expect.objectContaining({ objectID: 'goldplated', reason: 'requirement_mismatch' }));
    /* Purity "Sterling" is the most discriminative material check: real silver
     * carries it, gold-over-silver carries "18K". */
    expect(result.enforced?.attribute).toBe('Catalog_JewelryMaterialNavigationPurity');
    expect(result.enforced?.values).toEqual(['Sterling']);
  });

  it('enforces nothing when the shopper message matches no vocabulary value', async () => {
    const result = await createPresentProducts(fetcher, {
      vocabulary: async () => ({ values: { Metal: ['Gold'] } }),
      shopperMessage: () => 'something exotic and unobtainium',
    })({
      objectIDs: ['a'],
    });
    expect(result.status).toBe('ok');
    expect(result.enforced).toBeUndefined();
  });

  it('ignores a model-quoted requirement — only the shopper\'s message enforces', async () => {
    /* The structural fix, asserted at the runtime boundary: even if a prompt
     * regression makes the model quote a requirement field again, the tool
     * never reads it. Enforcement flows only from the shopper's own words.
     * The vocabulary carries the material attributes, so under the old
     * model-quoted behavior this call WOULD have enforced Sterling. */
    const vocabulary = {
      values: { 'Catalog_JewelryMaterialNavigationPurity': ['Sterling', '10K', '14K'] },
    };
    const result = await createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['a'],
      requirement: 'sterling silver',
    } as never);
    expect(result.enforced).toBeUndefined();
  });

  it('enforces nothing when no shopper message is available', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => ({ values: { Metal: ['Gold'] } }) })({
      objectIDs: ['a'],
    });
    expect(result.enforced).toBeUndefined();
  });

  it('enforces nothing when the shopper message names no material or stone', async () => {
    const result = await createPresentProducts(fetcher, {
      vocabulary: async () => ({ values: { Metal: ['Gold'] } }),
      shopperMessage: () => 'gift ideas for a friend',
    })({
      objectIDs: ['a'],
    });
    expect(result.enforced).toBeUndefined();
  });
});

describe('matchRequirement', () => {
  const vocabulary = {
    values: {
      'Catalog_JewelryMaterialNavigationPurity': ['Sterling', '10K', '14K'],
      'Catalog_GemstoneAndPearlNavigationName': ['Ruby', 'Mahaleo Ruby', 'Sapphire'],
    },
  };

  it('matches by exact word: sterling silver hits the purity value', () => {
    const matches = matchRequirement('sterling silver', vocabulary);
    expect(matches[0].values).toContain('Sterling');
  });

  it('matches rubies case-insensitively including family values', () => {
    const matches = matchRequirement('she loves rubies', vocabulary);
    expect(matches[0].attribute).toBe('Catalog_GemstoneAndPearlNavigationName');
    expect(matches[0].values).toContain('Ruby');
  });

  it('returns empty when no value shares a word with the requirement', () => {
    expect(matchRequirement('unobtainium', vocabulary)).toEqual([]);
  });
});

describe('matchRequirement brand enforcement', () => {
  const vocabulary = {
    values: {
      Catalog_BrandNavigationName: [
        'Gems En Vogue',
        'Southwest Style by JTV',
        'Prazana',
        'Gold Collection Jewelers',
      ],
      Catalog_JewelryMaterialNavigationName: ['Gold'],
    },
  };

  it('enforces the brand when the shopper names it', () => {
    const matches = matchRequirement('show me Southwest style jewelry', vocabulary);
    expect(matches[0].attribute).toBe('Catalog_BrandNavigationName');
    expect(matches[0].values).toContain('Southwest Style by JTV');
  });

  it('matches Gems En Vogue across its own small words', () => {
    const matches = matchRequirement('gems en vogue pieces', vocabulary);
    expect(matches[0].attribute).toBe('Catalog_BrandNavigationName');
    expect(matches[0].values).toContain('Gems En Vogue');
  });

  it('matches a single-word brand by its exact word', () => {
    const matches = matchRequirement('show me prazana rings', vocabulary);
    expect(matches[0].values).toContain('Prazana');
  });

  it('never fires a brand on one shared word like gold', () => {
    const matches = matchRequirement('gold necklace', vocabulary);
    expect(matches[0].attribute).toBe('Catalog_JewelryMaterialNavigationName');
  });

  it('material wins the equal-total tie over brand', () => {
    const mixed = {
      values: {
        Catalog_BrandNavigationName: ['Sterling Silver Studio'],
        Catalog_JewelryMaterialNavigationPurity: ['Sterling'],
      },
    };
    const matches = matchRequirement('sterling silver', mixed);
    expect(matches[0].attribute).toBe('Catalog_JewelryMaterialNavigationPurity');
  });
});

describe('present_products brand enforcement', () => {
  const vocabulary = { values: { Catalog_BrandNavigationName: ['Southwest Style by JTV'] } };
  const record = (objectID: string, brand: string[]) => ({
    objectID,
    name: `Product ${objectID}`,
    price: 125,
    inStock: true,
    imageUrl: 'https://example.com/a.jpg',
    link: `/product/${objectID}`,
    materialFields: { Catalog_BrandNavigationName: brand },
  });
  const fetcher = async (ids: readonly string[]) => {
    const map = new Map();
    for (const id of ids) {
      if (id === 'sw') map.set(id, record(id, ['Southwest Style by JTV']));
      else map.set(id, record(id, ['Other Line']));
    }
    return map;
  };

  it('drops pieces whose brand contradicts the shopper-named brand', async () => {
    const present = createPresentProducts(fetcher, {
      vocabulary: async () => vocabulary,
      shopperMessage: () => 'show me Southwest style jewelry',
    });
    const result = await present({ objectIDs: ['sw', 'x1', 'x2'] });
    expect(result.status).toBe('ok');
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['sw']);
    expect(result.dropped.map((d) => d.reason)).toEqual(['requirement_mismatch', 'requirement_mismatch']);
    expect(result.enforced?.attribute).toBe('Catalog_BrandNavigationName');
  });

  it('skips the brand check without a shopper message', async () => {
    const sparse = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) map.set(id, record(id, ['Other Line']));
      return map;
    };
    const present = createPresentProducts(sparse, { vocabulary: async () => vocabulary });
    const result = await present({ objectIDs: ['x1'] });
    expect(result.status).toBe('ok');
    expect(result.enforced).toBeUndefined();
  });
});
