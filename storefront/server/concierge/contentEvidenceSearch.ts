import {
  INDEXES,
  type EffectiveFilter,
  type EvidenceSearch,
} from './retrieveEvidence.js';

/**
 * Content-source query relaxation (Craig Task 05).
 *
 * Diagnosis, measured 2026-10-13 on the live read-only help_content index
 * (.checkpoint/runs/help-misses-2026-10-13/): the connected battery's two
 * misses (q16 "What types of auctions are on JTV Auctions?", q25 "How can I
 * watch JTV live?") took the correct help source path, but the agent's natural
 * multi-word queries matched zero records under Algolia's default AND word
 * semantics because one word of the paraphrase ("formats", "streaming") does
 * not exist in the target record. The records themselves are intact and rank
 * first for their own titles.
 *
 * Fix class: a general two-step search ladder for blog/help content sources.
 * The verbatim query is searched first, exactly as before. Only when it
 * returns zero hits does a second search run with the query-level parameter
 * removeWordsIfNoResults=lastWords, which lets Algolia progressively treat
 * trailing words as optional. Measured on the live index: both missed records
 * are recovered (ranked 1st and 2nd), while nonsense queries still return
 * zero hits, so better recall never manufactures evidence for a topic the
 * corpus does not cover.
 *
 * Boundary: this is a request-time parameter only. No index record, ranking,
 * searchable attribute, synonym, rule or index setting is read for write or
 * changed, and no query text is rewritten by application code.
 *
 * The relaxed request is pinned to the app's own search request by contract
 * tests (tests/concierge/help-query-relaxation.test.ts): same index name,
 * same projection, same query text, only the relaxation parameter added.
 */
export const CONTENT_PROJECTIONS: Record<'blog' | 'help', readonly string[]> = {
  blog: [
    'objectID',
    'article_id',
    'title',
    'heading_path',
    'content',
    'scope_text',
    'canonical_url',
    'source_role',
    'author',
    'published_at',
    'modified_at',
    'content_hash',
    'category',
    'tags',
    'language',
    'run_id',
    'fetched_at',
    'schema_version',
  ],
  help: [
    'objectID',
    'document_id',
    'title',
    'heading_path',
    'content',
    'scope_text',
    'canonical_url',
    'source_role',
    'topic',
    'content_hash',
    'fetched_at',
    'modified_at',
  ],
};

export function createContentEvidenceSearch(options: {
  appId: string;
  searchOnlyApiKey: string;
  fetch: typeof fetch;
  /** The application's own evidence search; owns the first (verbatim) request. */
  inner: EvidenceSearch;
}): EvidenceSearch {
  if (!/^[A-Za-z0-9]+$/.test(options.appId) || !options.searchOnlyApiKey.trim())
    throw new Error('Search-only Algolia credentials are required');
  const inner = options.inner;
  const request = options.fetch ?? fetch;
  class UpstreamRelaxedHttpError extends Error {
    constructor(readonly status: number) {
      super(`Algolia upstream HTTP ${status}`);
    }
  }
  async function relaxedSearch(
    source: 'blog' | 'help',
    query: string,
    count: number,
    filters: readonly EffectiveFilter[],
    signal: AbortSignal,
  ): Promise<readonly Record<string, unknown>[]> {
    const numericOperator: Record<string, string> = {
      lt: '<',
      lte: '<=',
      gt: '>',
      gte: '>=',
      eq: '=',
    };
    const numeric = filters
      .filter((f) => f.field === 'Pricing_ActivePrice')
      .map((f) => {
        if (f.operator === 'in') throw new Error('Unsupported numeric operator: in');
        const operator = numericOperator[f.operator];
        if (!operator) throw new Error(`Unsupported numeric operator: ${f.operator}`);
        return `${f.field}${operator}${f.value}`;
      });
    const facets = filters
      .filter((f) => f.field !== 'Pricing_ActivePrice')
      .map((f) =>
        f.operator === 'in'
          ? f.value.map((value) => `${f.field}:${value}`)
          : `${f.field}:${f.operator === 'neq' ? '-' : ''}${String(f.value)}`,
      );
    const params = new URLSearchParams({
      query,
      hitsPerPage: String(count),
      attributesToRetrieve: JSON.stringify(CONTENT_PROJECTIONS[source]),
      analytics: 'false',
      clickAnalytics: 'false',
      removeWordsIfNoResults: 'lastWords',
      ...(numeric.length ? { numericFilters: JSON.stringify(numeric) } : {}),
      ...(facets.length ? { facetFilters: JSON.stringify(facets) } : {}),
    });
    const response = await request(`https://${options.appId}.algolia.net/1/indexes/*/queries`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-algolia-application-id': options.appId,
        'x-algolia-api-key': options.searchOnlyApiKey,
      },
      body: JSON.stringify({
        requests: [{ indexName: INDEXES[source], params: params.toString() }],
      }),
      signal,
      redirect: 'error',
    });
    if (!response.ok) throw new UpstreamRelaxedHttpError(response.status);
    const payload = (await response.json()) as {
      results?: Array<{ hits?: Record<string, unknown>[] }>;
    };
    return payload.results?.[0]?.hits ?? [];
  }
  return async ({ source, query, count, exactObjectIDs = null, filters, signal }) => {
    if ((source !== 'blog' && source !== 'help') || exactObjectIDs !== null)
      return inner({ source, query, count, exactObjectIDs, filters, signal });
    const first = await inner({ source, query, count, exactObjectIDs, filters, signal });
    if (first.length > 0 || signal.aborted) return first;
    return relaxedSearch(source, query, count, filters, signal);
  };
}
