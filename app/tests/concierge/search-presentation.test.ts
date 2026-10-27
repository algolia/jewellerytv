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

  it('caps the tiles at nine (two rows of three minimum, three maximum)', () => {
    const hits = Array.from({ length: 14 }, (_, index) => hit(`h${index}`));
    const chosen = hits.map((h) => (h as { objectID: string }).objectID);
    const messages = [userMessage('q'), message('a1', [searchPart(hits), presentPart(chosen)])];
    expect(extractSearchPresentation(messages as never)?.objectIDs).toHaveLength(9);
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
      ['WPG776', 'WPG777', 'WPG778', 'WPG779', 'WPG780'],
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

  it('the shelf law: shelves show complete rows of three — 3, 6 or 9, never 4, 5, 7 or 8', async () => {
    /* Arijit's standing rule (repeated 2026-10-26): rows must complete. The
     * model writes its reply from exactly this list, so the trim happens in
     * the tool, before the model speaks. One and two pieces stay: an honest
     * thin result is not a partial row pretending to be a full shelf. */
    for (const [verified, expected] of [
      [4, 3],
      [5, 3],
      [6, 6],
      [7, 6],
      [8, 6],
      [9, 9],
    ] as const) {
      const ids = Array.from({ length: verified }, (_, i) => `v${i}`);
      const result = await present({ objectIDs: ids });
      expect(result.status).toBe('ok');
      expect(result.objectIDs.map((i) => i.objectID)).toHaveLength(expected);
    }
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
    })({
      objectIDs: ['silver', 'goldplated'],
      understood: { material: ['Sterling'], gemstone: [], brand: [] },
    } as never);
    expect(result.status).toBe('ok');
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['silver']);
    expect(result.dropped).toContainEqual(expect.objectContaining({ objectID: 'goldplated', reason: 'requirement_mismatch' }));
    /* The declaration names the verbatim value; the record check reads the
     * purity field real silver carries and gold-over-silver does not. */
    expect(result.enforcedByDeclaration).toEqual([
      { concept: 'material', values: ['Sterling'] },
    ]);
  });

  it('enforces nothing when the shopper message matches no vocabulary value', async () => {
    const result = await createPresentProducts(fetcher, {
      vocabulary: async () => ({ values: { Metal: ['Gold'] } }),
      shopperMessage: () => 'something exotic and unobtainium',
    })({
      objectIDs: ['a'],
    });
    expect(result.status).toBe('ok');
    expect(result.enforcedByDeclaration).toEqual([]);
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
    expect(result.enforcedByDeclaration).toEqual([]);
  });

  it('enforces nothing when no declaration is sent', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => ({ values: { Metal: ['Gold'] } }) })({
      objectIDs: ['a'],
    });
    expect(result.enforcedByDeclaration).toEqual([]);
  });
});

describe('present_products declaration enforcement (Option B cutover)', () => {
  /* The measured end of the word-matcher (2026-10-27, three runs): it read
   * "pearl" as the literal navigation value "Pearl" and emptied every pearl
   * shelf — Craig's canonical journey, six empty presents in one turn. The
   * model's declaration is the enforcement source; code fact-checks it
   * against the records. Code never reads the sentence. */
  const tile = (objectID: string, fields: Record<string, string[]>, extra: Record<string, unknown> = {}) => ({
    objectID,
    name: `Product ${objectID}`,
    price: 500,
    inStock: true,
    imageUrl: 'https://example.com/a.jpg',
    link: `/product/${objectID}`,
    materialFields: fields,
    hasPearls: false,
    ...extra,
  });
  const fetcher = async (ids: readonly string[]) => {
    const map = new Map();
    for (const id of ids) {
      if (id === 'gold') map.set(id, tile(id, { Catalog_JewelryMaterialNavigationName: ['Gold'] }));
      else if (id === 'pearlstrands')
        map.set(id, tile(id, { Catalog_GemstoneAndPearlNavigationName: ['Freshwater Pearl'] }, { hasPearls: true }));
      else if (id === 'pricetag') map.set(id, tile(id, {}, { price: 250 }));
      else map.set(id, tile(id, { Catalog_JewelryMaterialNavigationName: ['Silver'] }));
    }
    return map;
  };
  const vocabulary = {
    values: {
      Catalog_JewelryMaterialNavigationName: ['Gold', 'Silver'],
      Catalog_GemstoneAndPearlNavigationName: ['Freshwater Pearl', 'Akoya Pearl'],
    },
  };
  const run = (understood: unknown) =>
    createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['gold', 'pearlstrands', 'plain', 'pricetag'],
      understood,
    } as never);

  it('enforces the declared material against the record, case-insensitively', async () => {
    const result = await run({ material: ['gold'], gemstone: [], brand: [] });
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['gold']);
    expect(result.dropped.every((d) => d.reason === 'requirement_mismatch')).toBe(true);
  });

  it('a generic pearl ask verifies against the pearl fields, not navigation values', async () => {
    const result = await run({ material: [], gemstone: ['pearl'], brand: [] });
    expect(result.objectIDs.map((i) => i.objectID)).toContain('pearlstrands');
    expect(result.objectIDs.map((i) => i.objectID)).not.toContain('plain');
  });

  it('no declaration enforces nothing, even when the matcher would have', async () => {
    const result = await run(undefined);
    /* The shelf law trims four verified tiles to one complete row of three;
     * the point is that nothing was requirement-dropped. */
    expect(result.dropped.filter((d) => d.reason === 'requirement_mismatch')).toHaveLength(0);
    expect(result.enforcedByDeclaration).toEqual([]);
  });

  it('an invented declared value is skipped, never nukes the shelf', async () => {
    const result = await run({ material: ['Unobtainium'], gemstone: [], brand: [] });
    expect(result.dropped.filter((d) => d.reason === 'requirement_mismatch')).toHaveLength(0);
    expect(result.enforcedByDeclaration).toEqual([]);
  });

  it('a declared price ceiling drops over-budget tiles', async () => {
    const result = await run({ material: [], gemstone: [], brand: [], priceMax: 200 });
    expect(result.objectIDs.map((i) => i.objectID)).not.toContain('pricetag');
    expect(result.dropped).toContainEqual(expect.objectContaining({ objectID: 'pricetag', reason: 'over_budget' }));
  });
});

describe('present_products pre-owned scope (Craig, CDO)', () => {
  /* JTV's CDO set the business scope: pre-owned is out of the agent entirely.
   * The platform cannot filter the numeric flag at search time (measured,
   * tool sheet), so the curation tool drops flagged records — deterministic,
   * independent of model compliance. */
  const record = (objectID: string, extra: Record<string, unknown> = {}) => ({
    objectID,
    name: `Product ${objectID}`,
    price: 500,
    inStock: true,
    imageUrl: 'https://example.com/a.jpg',
    link: `/product/${objectID}`,
    materialFields: {},
    hasPearls: false,
    ...extra,
  });
  const fetcher = async (ids: readonly string[]) => {
    const map = new Map();
    for (const id of ids) {
      if (id === 'preowned' || id === 'preowned2') map.set(id, record(id, { previouslyOwned: true }));
      else map.set(id, record(id));
    }
    return map;
  };

  it('never admits a pre-owned piece, whatever the model picked', async () => {
    const result = await createPresentProducts(fetcher)({
      objectIDs: ['preowned', 'fresh', 'preowned2'],
    });
    const pre = result.dropped.filter((d) => d.reason === 'pre_owned');
    expect(pre.map((d) => d.objectID).sort()).toEqual(['preowned', 'preowned2']);
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['fresh']);
  });
});

describe('present_products declaration shadow (Option B stage 1)', () => {
  /* The model declares what it understood from the shopper's own words; the
   * tool records it for the shadow gate and enforces nothing from it yet —
   * the word-matcher stays the enforcement source until Arijit's cutover.
   * Code never reads the sentence: interpretation is the model's job. */
  const record = (objectID: string) => ({
    objectID,
    name: `Product ${objectID}`,
    price: 125,
    inStock: true,
    imageUrl: 'https://example.com/a.jpg',
    link: `/product/${objectID}`,
    materialFields: {},
  });
  const fetcher = async (ids: readonly string[]) => {
    const map = new Map();
    for (const id of ids) map.set(id, record(id));
    return map;
  };
  const vocabulary = {
    values: {
      'Catalog_JewelryMaterialNavigationName': ['Gold', 'Silver'],
      'Catalog_GemstoneAndPearlNavigationName': ['Ruby', 'Multi-Stone'],
      'Catalog_BrandNavigationName': ['Gems En Vogue'],
    },
  };

  it('the declared material enforces against the record and stays out of the matcher', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['a'],
      understood: { material: ['Gold'], gemstone: [], brand: [] },
    } as never);
    expect(result.declared).toEqual({ material: ['Gold'], gemstone: [], brand: [] });
    expect(result.declaredVerbatim).toBe(true);
    /* The record carries no material, so the declared value drops it — and
     * the matcher's own reading stays diagnostics-only. */
    expect(result.enforcedByDeclaration).toEqual([{ concept: 'material', values: ['Gold'] }]);
  });

  it('a declined requirement is a valid declaration of empty arrays', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['a'],
      understood: { material: [], gemstone: [], brand: [] },
    } as never);
    expect(result.declared).toEqual({ material: [], gemstone: [], brand: [] });
    expect(result.declaredVerbatim).toBe(true);
  });

  it('verbatim matching is case-insensitive: the live model declares "gold" for "Gold"', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['a'],
      understood: { material: ['gold'], gemstone: [], brand: [] },
    } as never);
    expect(result.declaredVerbatim).toBe(true);
  });

  it('a declared price ceiling is recorded with the tiles that exceed it', async () => {
    /* The measured leak (the platinum-over-budget shelf, 2026-10-26): the
     * model filters price at search, but a declared ceiling lets code CHECK
     * each tile's actual price. Shadow stage: recorded, not enforced. */
    const priced = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids)
        map.set(id, {
          ...record(id),
          price: id === 'over' ? 250 : 66,
          materialFields: {},
        });
      return map;
    };
    const result = await createPresentProducts(priced, { vocabulary: async () => vocabulary })({
      objectIDs: ['over', 'under'],
      understood: { material: [], gemstone: [], brand: [], priceMax: 200 },
    } as never);
    expect(result.declared).toEqual({ material: [], gemstone: [], brand: [], priceMax: 200 });
    expect(result.dropped).toContainEqual(expect.objectContaining({ objectID: 'over', reason: 'over_budget' }));
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['under']);
  });

  it('no declared ceiling drops nothing for price', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['a'],
      understood: { material: [], gemstone: [], brand: [] },
    } as never);
    expect(result.dropped).toEqual([]);
  });

  it('a non-numeric ceiling is ignored, not coerced', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['a'],
      understood: { material: [], gemstone: [], brand: [], priceMax: '200' },
    } as never);
    expect(result.declared).toEqual({ material: [], gemstone: [], brand: [] });
    expect(result.dropped).toEqual([]);
  });

  it('flags invented values as not verbatim', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['a'],
      understood: { material: ['Unobtainium'], gemstone: ['Ruby'], brand: [] },
    } as never);
    expect(result.declared).toEqual({ material: ['Unobtainium'], gemstone: ['Ruby'], brand: [] });
    expect(result.declaredVerbatim).toBe(false);
  });

  it('an absent declaration adds no declared field', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['a'],
    });
    expect(result.declared).toBeUndefined();
    expect(result.declaredVerbatim).toBeUndefined();
  });

  it('an invalid declaration is ignored without failing the call', async () => {
    const result = await createPresentProducts(fetcher, { vocabulary: async () => vocabulary })({
      objectIDs: ['a'],
      understood: 'gold',
    } as never);
    expect(result.declared).toBeUndefined();
    expect(result.status).toBe('ok');
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

describe('matchRequirement negation', () => {
  /* The measured failure (mission-5b148c11, 2026-10-26): "no specific stone,
   * but my budget is $200" enforced the gemstone value "Multi-Stone" and
   * dropped every candidate ring, because the negators "no" and "not" were
   * shorter than the token length floor and never reached the matcher. A
   * clause that contains a negation contributes no requirement at all: the
   * shopper declined to state one. */
  const vocabulary = {
    values: {
      'Catalog_GemstoneAndPearlNavigationName': ['Ruby', 'Sapphire', 'Multi-Stone'],
      'Catalog_JewelryMaterialNavigationName': ['Gold', 'Silver'],
    },
  };

  it('the measured failure: a declined requirement is not enforced', () => {
    expect(matchRequirement('no specific stone, but my budget is $200', vocabulary)).toEqual([]);
  });

  it('a negated clause never becomes a requirement', () => {
    expect(matchRequirement('not sure about stones, my budget is $200', vocabulary)).toEqual([]);
    expect(matchRequirement('no preference on the stone', vocabulary)).toEqual([]);
    expect(matchRequirement("I don't want gold", vocabulary)).toEqual([]);
  });

  it('a clause after a contrast conjunction still states its requirement', () => {
    const matches = matchRequirement('not gold, show me silver', vocabulary);
    expect(matches[0].attribute).toBe('Catalog_JewelryMaterialNavigationName');
    expect(matches[0].values).toContain('Silver');
    expect(matches[0].values).not.toContain('Gold');
  });

  it('positive requirements are untouched by the negation rule', () => {
    const matches = matchRequirement('I only wear gold', vocabulary);
    expect(matches[0].values).toContain('Gold');
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

  it('a silver ask never enforces gold-over-silver or plated composites', () => {
    const matches = matchRequirement('show me silver ones', {
      values: {
        Catalog_JewelryMaterialNavigationName: [
          'Silver',
          'Gold Over Silver',
          'Silver Over Brass',
          'Palladium Silver',
          'Rhodium Over Silver',
        ],
      },
    });
    expect(matches[0].values).toEqual(['Silver', 'Palladium Silver']);
  });

  it('a gold ask never enforces gold-over-silver either', () => {
    const matches = matchRequirement('something in gold', {
      values: {
        Catalog_JewelryMaterialNavigationName: ['Gold', 'Gold Over Silver', 'Gold Over Brass', '14K White Gold'],
      },
    });
    expect(matches[0].values).toEqual(['Gold', '14K White Gold']);
  });

  it('keeps plated values when the shopper asked for the combination', () => {
    const matches = matchRequirement('gold over silver', {
      values: {
        Catalog_JewelryMaterialNavigationName: ['Gold', 'Gold Over Silver', 'Silver Over Brass'],
      },
    });
    expect(matches[0].values).toEqual(['Gold', 'Gold Over Silver']);
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

  it('drops pieces whose brand contradicts the declared brand', async () => {
    const present = createPresentProducts(fetcher, {
      vocabulary: async () => vocabulary,
    });
    const result = await present({
      objectIDs: ['sw', 'x1', 'x2'],
      understood: { material: [], gemstone: [], brand: ['Southwest Style by JTV'] },
    } as never);
    expect(result.status).toBe('ok');
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['sw']);
    expect(result.dropped.map((d) => d.reason)).toEqual(['requirement_mismatch', 'requirement_mismatch']);
    expect(result.enforcedByDeclaration).toEqual([
      { concept: 'brand', values: ['Southwest Style by JTV'] },
    ]);
  });

  it('skips the brand check without a declaration', async () => {
    const sparse = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) map.set(id, record(id, ['Other Line']));
      return map;
    };
    const present = createPresentProducts(sparse, { vocabulary: async () => vocabulary });
    const result = await present({ objectIDs: ['x1'] });
    expect(result.status).toBe('ok');
    expect(result.enforcedByDeclaration).toEqual([]);
  });

  it('backfills from the search pool to the shelf floor of six', async () => {
    const fetcher = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) map.set(id, record(id, ['Southwest Style by JTV']));
      return map;
    };
    const present = createPresentProducts(fetcher, {
      vocabulary: async () => vocabulary,
      searchPool: () => ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'sw1'],
    });
    const result = await present({
      objectIDs: ['sw'],
      understood: { material: [], gemstone: [], brand: ['Southwest Style by JTV'] },
    } as never);
    expect(result.status).toBe('ok');
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['sw', 'p1', 'p2', 'p3', 'p4', 'p5']);
    expect(result.backfilled).toBe(5);
  });

  it('never backfills past the nine-tile cap or above the floor', async () => {
    const fetcher = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) map.set(id, record(id, ['Southwest Style by JTV']));
      return map;
    };
    const present = createPresentProducts(fetcher, {
      searchPool: () => ['p1', 'p2', 'p3', 'p4'],
    });
    const result = await present({ objectIDs: ['a', 'b', 'c', 'd', 'e', 'f'] });
    expect(result.objectIDs).toHaveLength(6);
    expect(result.backfilled).toBeUndefined();
  });

  it('leaves a starved shelf untouched when there is no pool', async () => {
    const fetcher = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) map.set(id, record(id, ['Southwest Style by JTV']));
      return map;
    };
    const present = createPresentProducts(fetcher, {});
    const result = await present({ objectIDs: ['a', 'b'] });
    expect(result.objectIDs).toHaveLength(2);
    expect(result.backfilled).toBeUndefined();
  });

  it('runs the follow-up search when the pool is exhausted under the floor', async () => {
    const fetcher = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) map.set(id, record(id, ['Southwest Style by JTV']));
      return map;
    };
    const searched: string[][] = [];
    const present = createPresentProducts(fetcher, {
      vocabulary: async () => vocabulary,
      searchPool: () => [],
      appSearch: async (facetFilters) => {
        searched.push(...facetFilters.map((group) => [...group]));
        return ['f1', 'f2', 'f3', 'f4', 'f5'];
      },
    });
    const result = await present({
      objectIDs: ['sw'],
      understood: { material: [], gemstone: [], brand: ['Southwest Style by JTV'] },
    } as never);
    expect(result.objectIDs.map((i) => i.objectID)).toEqual(['sw', 'f1', 'f2', 'f3', 'f4', 'f5']);
    expect(result.backfilled).toBe(5);
    expect(searched[0]).toEqual(['Catalog_BrandNavigationName:"Southwest Style by JTV"']);
  });

  it('does not run the follow-up search without a declared requirement', async () => {
    const fetcher = async (ids: readonly string[]) => {
      const map = new Map();
      for (const id of ids) map.set(id, record(id, ['Other Line']));
      return map;
    };
    let searched = 0;
    const present = createPresentProducts(fetcher, {
      searchPool: () => [],
      appSearch: async () => {
        searched += 1;
        return [];
      },
    });
    const result = await present({ objectIDs: ['a', 'b'] });
    expect(result.objectIDs).toHaveLength(2);
    expect(searched).toBe(0);
  });
});
