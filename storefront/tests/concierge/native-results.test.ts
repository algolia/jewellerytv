import { describe, expect, it } from 'vitest';
import {
  extractMessageFacetPicks,
  extractMessageAnchors,
  NOTE_ECHO_ENABLED,
  stripTrailingNote,
} from '../../src/concierge/nativeResults';

/* Part shapes mirror the raw C2 captures: a search part is
 * `tool-algolia_search_index_<index>` with `output.hits`. */

const userMessage = (text: string) => ({
  id: 'u1',
  role: 'user',
  parts: [{ type: 'text', text }],
});

const searchPart = (
  hits: unknown[],
  options: { queries?: number; id?: string } = {},
) => ({
  type: 'tool-algolia_search_index_prod_catalog',
  toolCallId: options.id ?? 'call-1',
  state: 'output-available',
  input: {
    queries: Array.from({ length: options.queries ?? 1 }, (_, index) => ({
      query: index === 0 ? 'tanzanite ring' : `other query ${index}`,
    })),
  },
  output: { hits },
});

const hit = (objectID: string, extra: Record<string, unknown> = {}) => ({
  objectID,
  Catalog_TitleDescription: `Product ${objectID}`,
  Pricing_ActivePrice: 635.11,
  Inventory_InStock: false,
  Media_Images: ['https://example.com/a.jpg'],
  ...extra,
});

const group = (title: string, ids: string[], why?: string) =>
  why === undefined
    ? { title, results: ids.map((objectID) => ({ objectID })) }
    : { title, why, results: ids.map((objectID) => ({ objectID })) };

describe('stripTrailingNote', () => {
  it('strips a plain trailing NOTE line', () => {
    const { display, note } = stripTrailingNote('Here is a first look.\n\nNOTE: shown IDs A, B');
    expect(display).toBe('Here is a first look.');
    expect(note).toBe('shown IDs A, B');
  });

  it('strips a bolded trailing NOTE line (C2 c04c05 deviation shape)', () => {
    const { display, note } = stripTrailingNote('Reply text.\n\n**NOTE:** constraint set');
    expect(display).toBe('Reply text.');
    expect(note).toBe('constraint set');
  });

  it('keeps a NOTE that is not the last line', () => {
    const text = 'NOTE: earlier context\n\nActual closing answer.';
    const { display, note } = stripTrailingNote(text);
    expect(display).toBe(text);
    expect(note).toBeNull();
  });

  it('returns empty note content when the line is a bare marker', () => {
    const { display, note } = stripTrailingNote('Answer.\nNOTE:');
    expect(display).toBe('Answer.');
    expect(note).toBe('');
  });

  it('leaves NOTE-free text byte-identical', () => {
    const text = 'Plain answer with **bold** text.';
    expect(stripTrailingNote(text)).toEqual({ display: text, note: null });
  });

  it('handles empty text', () => {
    expect(stripTrailingNote('')).toEqual({ display: '', note: null });
  });
});

describe('NOTE_ECHO_ENABLED', () => {
  it('defaults OFF per F1 (Arijit is deciding whether the NOTE stays)', () => {
    expect(NOTE_ECHO_ENABLED).toBe(false);
  });
});

/* Mobile anchored cards (2026-10-23): each assistant message that carries a
 * grouped or arranged tool output anchors its own cards, so the conversation
 * keeps every turn's picks in place instead of one latest-turn canvas. */

describe('extractMessageAnchors (chips-native)', () => {
  it('returns one anchor per assistant message that carries a single-query search', () => {
    const messages = [
      userMessage('show me opal rings'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [searchPart([hit('WPG776'), hit('WPG777'), hit('WPG778'), hit('WPG779'), hit('WPG780')])],
      },
      userMessage('make it yellow gold'),
      {
        id: 'a2',
        role: 'assistant',
        parts: [searchPart([hit('WPG781')], { id: 'call-2' })],
      },
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
      {
        id: 'a1',
        role: 'assistant',
        parts: [searchPart([hit('WPG776')], { queries: 2 })],
      },
    ];
    expect(extractMessageAnchors(messages)).toEqual([]);
  });

  it('skips assistant messages with no search output', () => {
    const messages = [
      userMessage('what makes opal different?'),
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Play of color.' }] },
    ];
    expect(extractMessageAnchors(messages)).toEqual([]);
  });

  it('skips a search part whose output has not arrived', () => {
    const messages = [
      userMessage('show me opal rings'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [{ type: 'tool-algolia_search_index_prod_catalog', toolCallId: 'c1', state: 'input-available', input: { queries: [{ query: 'opal' }] } }],
      },
    ];
    expect(extractMessageAnchors(messages)).toEqual([]);
  });
});

/* Facet chips spike (2026-10-23): the streamed search tool result carries
 * aggregate `facets` counts, and the arrange call may carry a `displayFacets`
 * pick. The client renders chips from these — no second query, no proxy. */

describe('extractMessageFacetPicks', () => {
  const facetSearchPart = {
    type: 'tool-algolia_search_index_prod_catalog',
    toolCallId: 's1',
    state: 'output-available',
    input: { queries: [{ query: "men's watch classic" }] },
    output: {
      hits: [hit('12TB0A'), hit('1BC76B')],
      nbHits: 24,
      facets: { Catalog_Brand: { 'Charles Hubert': 360, Bulova: 37 } },
    },
  };
  const arrangeWithPick = {
    type: 'tool-arrange_groups',
    toolCallId: 'a1',
    state: 'output-available',
    input: { groups: [{ title: 'G', objectIDs: ['12TB0A'] }], displayFacets: ['Catalog_Brand'] },
    output: { status: 'ok', groups: [{ title: 'G', items: [{ objectID: '12TB0A' }] }] },
  };

  it('attaches one pick per message with accumulated facets and hits, derived from the counts', () => {
    const picks = extractMessageFacetPicks([
      userMessage('watch for dad'),
      { id: 'a1', role: 'assistant', parts: [facetSearchPart] },
      { id: 'a2', role: 'assistant', parts: [{ type: 'text', text: 'No tools here.' }] },
    ]);
    expect(picks).toHaveLength(1);
    expect(picks[0].messageId).toBe('a1');
    /* Derived, not model-supplied: Catalog_Brand has two values, so it is the
     * whole pick. No arrange call involved. */
    expect(picks[0].pick.displayFacets).toEqual(['Catalog_Brand']);
    expect(picks[0].pick.queryText).toBe("men's watch classic");
    expect(picks[0].hits).toHaveLength(2);
  });
});

describe('extractMessageFacetPicks multi-scope guard', () => {
  it('skips chips on a multi-query (multi-direction) turn', () => {
    const multiQuerySearch = {
      type: 'tool-algolia_search_index_prod_catalog',
      toolCallId: 's1',
      state: 'output-available',
      input: { queries: [{ query: 'gold hoop earrings' }, { query: 'gold necklace pendant' }] },
      output: { hits: [hit('a')], nbHits: 2, facets: { Catalog_NecklaceType: { Pendant: 4, Chain: 2 } } },
    };
    const arrangeWithPick = {
      type: 'tool-arrange_groups',
      toolCallId: 'a1',
      state: 'output-available',
      input: { groups: [{ title: 'G', objectIDs: ['a'] }], displayFacets: ['Catalog_NecklaceType'] },
      output: { status: 'ok', groups: [{ title: 'G', items: [{ objectID: 'a' }] }] },
    };
    const picks = extractMessageFacetPicks([
      userMessage('what goes with gold hoops'),
      { id: 'a1', role: 'assistant', parts: [multiQuerySearch, arrangeWithPick] },
    ]);
    expect(picks).toEqual([]);
  });

  it('keeps chips on a single-scope turn', () => {
    const singleSearch = {
      type: 'tool-algolia_search_index_prod_catalog',
      toolCallId: 's1',
      state: 'output-available',
      input: { queries: [{ query: 'opal rings' }] },
      output: { hits: [hit('a')], nbHits: 2, facets: { Catalog_RingType: { Halo: 4, Band: 2 } } },
    };
    const arrangeWithPick = {
      type: 'tool-arrange_groups',
      toolCallId: 'a1',
      state: 'output-available',
      input: { groups: [{ title: 'G', objectIDs: ['a'] }], displayFacets: ['Catalog_RingType'] },
      output: { status: 'ok', groups: [{ title: 'G', items: [{ objectID: 'a' }] }] },
    };
    const picks = extractMessageFacetPicks([
      userMessage('show me opal rings'),
      { id: 'a1', role: 'assistant', parts: [singleSearch, arrangeWithPick] },
    ]);
    expect(picks).toHaveLength(1);
  });
});
