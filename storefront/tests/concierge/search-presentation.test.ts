import { describe, expect, it } from 'vitest';
import {
  deriveFacetPick,
  extractMessageFacetPicks,
  extractSearchPresentation,
} from '../../src/concierge/nativeResults';
import { dedupeVariants } from '../../src/concierge/ConciergeWorkspaceProvider';
import { normalizeProduct } from '../../src/catalog';

/* Chips-native cut (2026-10-24): the presentation derives from the streamed
 * search output alone. Part shapes mirror the C2 captures the other
 * native-results tests use. */

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

describe('deriveFacetPick', () => {
  it('drops single-value facets: they are already narrowed', () => {
    const pick = deriveFacetPick({ MetalColor: counts(3), OnlyOne: { a: 5 } });
    expect(pick).toEqual(['MetalColor']);
  });

  it('drops very long tails: identifier noise, not a shopping choice', () => {
    const pick = deriveFacetPick({ MetalColor: counts(3), SkuNoise: counts(25, 's') });
    expect(pick).toEqual(['MetalColor']);
  });

  it('orders fewest distinct values first: the narrow-fastest cascade', () => {
    const pick = deriveFacetPick({ Wide: counts(12), Narrow: counts(2), Mid: counts(5) });
    expect(pick).toEqual(['Narrow', 'Mid', 'Wide']);
  });

  it('breaks ties alphabetically so the order is deterministic', () => {
    const pick = deriveFacetPick({ zircon: counts(4), agate: counts(4), beryl: counts(4) });
    expect(pick).toEqual(['agate', 'beryl', 'zircon']);
  });

  it('caps at three attributes', () => {
    const pick = deriveFacetPick({ a: counts(2), b: counts(3), c: counts(4), d: counts(5) });
    expect(pick).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty pick when nothing qualifies', () => {
    expect(deriveFacetPick({ OnlyOne: { a: 1 }, Noise: counts(30) })).toEqual([]);
  });
});

describe('extractSearchPresentation', () => {
  it('takes the single-query search hits in streamed order', () => {
    const messages = [
      userMessage('show me tanzanite rings'),
      message('a1', [searchPart([hit('h1'), hit('h2'), hit('h3')])]),
    ];
    const presentation = extractSearchPresentation(messages as never);
    expect(presentation?.objectIDs).toEqual(['h1', 'h2', 'h3']);
    expect(presentation?.queryText).toBe('tanzanite ring');
    expect(presentation?.records.get('h2')).toMatchObject({ objectID: 'h2' });
  });

  it('skips duplicate objectIDs across parts of the same turn', () => {
    const messages = [
      userMessage('show me tanzanite rings'),
      message('a1', [searchPart([hit('h1'), hit('h2')]), searchPart([hit('h2'), hit('h3')], { id: 'call-2' })]),
    ];
    expect(extractSearchPresentation(messages as never)?.objectIDs).toEqual(['h1', 'h2', 'h3']);
  });

  it('caps the tiles at eight', () => {
    const hits = Array.from({ length: 14 }, (_, index) => hit(`h${index}`));
    const messages = [userMessage('q'), message('a1', [searchPart(hits)])];
    expect(extractSearchPresentation(messages as never)?.objectIDs).toHaveLength(8);
  });

  it('suppresses the presentation when a search carried several queries', () => {
    const messages = [
      userMessage('q'),
      message('a1', [searchPart([hit('h1')], { queries: 3 })]),
    ];
    expect(extractSearchPresentation(messages as never)).toBeNull();
  });

  it('returns null without hits or without a query text', () => {
    expect(extractSearchPresentation([userMessage('q'), message('a1', [searchPart([])])])).toBeNull();
    const noQuery = {
      type: 'tool-algolia_search_index_prod_catalog',
      toolCallId: 'c',
      state: 'output-available',
      input: { queries: [{}] },
      output: { hits: [hit('h1')] },
    };
    expect(extractSearchPresentation([userMessage('q'), message('a1', [noQuery])] as never)).toBeNull();
  });

  it('reads only the latest turn: an earlier presentation stays staged', () => {
    const messages = [
      userMessage('first'),
      message('a1', [searchPart([hit('old')])]),
      userMessage('what about silver'),
      message('a2', [{ type: 'text', text: 'answer without a search' }]),
    ];
    expect(extractSearchPresentation(messages as never)).toBeNull();
  });
});

describe('extractMessageFacetPicks (chips-native derivation)', () => {
  it('derives the pick from the search response facet counts, not a model list', () => {
    const facets = { MetalColor: counts(3), OnlyOne: { a: 2 } };
    const messages = [userMessage('q'), message('a1', [searchPart([hit('h1')], { facets })])];
    const picks = extractMessageFacetPicks(messages as never);
    expect(picks).toHaveLength(1);
    expect(picks[0].pick.displayFacets).toEqual(['MetalColor']);
    expect(picks[0].pick.queryText).toBe('tanzanite ring');
    expect(picks[0].hits).toHaveLength(1);
  });

  it('suppresses chips on a multi-query message', () => {
    const facets = { MetalColor: counts(3) };
    const messages = [userMessage('q'), message('a1', [searchPart([hit('h1')], { queries: 2, facets })])];
    expect(extractMessageFacetPicks(messages as never)).toHaveLength(0);
  });

  it('emits no pick when no facet qualifies', () => {
    const messages = [
      userMessage('q'),
      message('a1', [searchPart([hit('h1')], { facets: { OnlyOne: { a: 2 } } })]),
    ];
    expect(extractMessageFacetPicks(messages as never)).toHaveLength(0);
  });

  it('accumulates facet counts per message across the conversation', () => {
    const messages = [
      userMessage('q'),
      message('a1', [searchPart([hit('h1')], { facets: { MetalColor: counts(3) }, id: 'c1' })]),
      message('a2', [searchPart([hit('h2')], { facets: { Gemstone: counts(4) }, id: 'c2' })]),
    ];
    const picks = extractMessageFacetPicks(messages as never);
    expect(picks[0].pick.displayFacets).toEqual(['MetalColor']);
    expect(picks[1].pick.displayFacets).toEqual(['MetalColor', 'Gemstone']);
  });
});

describe('dedupeVariants', () => {
  const product = (id: string, familyId: string | null, title: string, price: number | null) =>
    normalizeProduct({
      objectID: id,
      Catalog_ProductNumber: familyId,
      Catalog_TitleDescription: title,
      Pricing_ActivePrice: price,
      Inventory_InStock: true,
    });

  it('keeps the first of a family and drops its later variants', () => {
    const kept = dedupeVariants([
      product('a', 'F1', 'Huggie Hoop Earrings', 249.99),
      product('b', 'F1', 'Huggie Hoop Earrings', 252.99),
    ]);
    expect(kept.map((p) => p.id)).toEqual(['a']);
  });

  it('keeps genuinely different families', () => {
    const kept = dedupeVariants([
      product('a', 'F1', 'Huggie Hoop Earrings', 249.99),
      product('b', 'F2', 'Drop Earrings', 249.99),
    ]);
    expect(kept.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('falls back to price plus normalized title when the family is missing', () => {
    const kept = dedupeVariants([
      product('a', null, 'Huggie Hoop Earrings', 249.99),
      product('b', null, 'Huggie   HOOP earrings', 249.99),
      product('c', null, 'Huggie Hoop Earrings', 259.0),
    ]);
    expect(kept.map((p) => p.id)).toEqual(['a', 'c']);
  });

  it('never collapses records with no price under the fallback key', () => {
    const kept = dedupeVariants([
      product('a', null, 'Mystery Pendant', null),
      product('b', null, 'Mystery Pendant', null),
    ]);
    expect(kept.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
