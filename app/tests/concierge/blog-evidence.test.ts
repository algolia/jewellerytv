import { describe, expect, it, vi } from 'vitest';
import { createAlgoliaEvidenceSearch } from '../../server/concierge/evidencePrimitives.js';

const blogChunk = {
  objectID: 'shared-id',
  article_id: 'article-1',
  title: 'Caring for gold-plated jewellery',
  heading_path: 'Gold plating > Care',
  content: 'Gold plating is a surface layer. Remove jewellery before swimming.',
  canonical_url: 'https://www.jtv.com/blog/gold-plated-jewelry',
  source_role: 'education',
  content_hash: 'chunk-hash-1',
};

describe('blog evidence source boundaries', () => {
  it('queries the blog index without product constraints and preserves article and passage provenance', async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ hits: [blogChunk] }] }), { status: 200 }),
    );
    const search = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });

    const hits = await search({
      source: 'blog',
      query: 'gold plating care',
      count: 2,
      exactObjectIDs: null,
      filters: [],
      signal: new AbortController().signal,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      objectID: 'shared-id',
      article_id: 'article-1',
      canonical_url: 'https://www.jtv.com/blog/gold-plated-jewelry',
      heading_path: 'Gold plating > Care',
      content: 'Gold plating is a surface layer. Remove jewellery before swimming.',
    });

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const request = JSON.parse(init.body as string).requests[0];
    expect(request.indexName).toBe('blog');
    const params = new URLSearchParams(request.params);
    expect(params.has('facetFilters')).toBe(false);
    expect(params.has('numericFilters')).toBe(false);
  });

  it('relaxes word matching only for education sources and keeps product search strict AND', async () => {
    const fetch = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ hits: [] }] }), { status: 200 }),
    );
    const search = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const call = (source: 'blog' | 'help' | 'prod_catalog', query: string) =>
      search({ source, query, count: 2, filters: [], signal: new AbortController().signal });

    await call('blog', 'choosing chain necklace guide');
    await call('help', 'ring sizing');
    await call('prod_catalog', 'gold ring');

    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    const requestAt = (index: number) => JSON.parse(calls[index][1].body as string).requests[0];

    expect(requestAt(0).indexName).toBe('blog');
    expect(requestAt(1).indexName).toBe('help_content');
    expect(requestAt(2).indexName).toBe('prod_catalog');

    expect(new URLSearchParams(requestAt(0).params).get('removeWordsIfNoResults')).toBe(
      'allOptional',
    );
    expect(new URLSearchParams(requestAt(1).params).get('removeWordsIfNoResults')).toBe(
      'allOptional',
    );
    expect(new URLSearchParams(requestAt(2).params).get('removeWordsIfNoResults')).toBeNull();
  });
});
