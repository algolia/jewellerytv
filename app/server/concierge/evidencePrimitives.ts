import { createHash } from 'node:crypto';
import type { EffectiveFilter, EvidenceSource } from '../../shared/concierge/retrieval/types.js';

/* Read-only Algolia access primitives (F3 native cleanup, extracted verbatim
 * from retrieveEvidence.ts). These serve the UI's exact price/stock refresh
 * (exactProductRefreshRoute) and the live catalogue vocabulary
 * (catalogVocabulary) — the parts of the old evidence layer the native app
 * still needs. The retrieval compiler that fed the removed client-tool path
 * is gone; see results/L2/F3-AUDIT.md. */

export const INDEXES: Record<EvidenceSource, string> = {
  prod_catalog: 'prod_catalog',
  blog: 'blog',
  help: 'help_content',
};

const PRODUCT_PROJECTION = [
  'objectID',
  'Catalog_ProductNumber',
  'Catalog_SKUNumbers',
  'Catalog_TitleDescription',
  'Catalog_LongDescription',
  'Catalog_ProductType',
  'Catalog_Condition',
  'Catalog_Motif',
  'Catalog_JewelryMaterialNavigationName',
  'Catalog_JewelryMaterialNavigationPurity',
  'Catalog_JewelryMaterialNavigationColor',
  'Catalog_MaterialInformation',
  'Catalog_GemstoneInformation',
  'Catalog_GemstoneInformationPrimary',
  'Catalog_PearlInformation',
  'Catalog_PearlInformationPrimary',
  'Catalog_BeadInformation',
  'Catalog_OtherMaterialInformation',
  'Catalog_BackingType',
  'Catalog_WatchDialInformation',
  'Catalog_WatchPrimaryDialPrimaryColor',
  'Catalog_WatchBandType',
  'Catalog_BandMaterialInformation',
  'Catalog_WatchCaseSize',
  'Catalog_WatchCaseShape',
  'Catalog_WatchStyle',
  // Watch evidence projection repair (STAGE2-WATER-RESISTANCE-PROJECTION-DESIGN,
  // red test first): the exact catalogue records carry both fields (measured on
  // 1W9E1B and 1DXZHA); the projection previously discarded them, so the agent
  // could not ground a stated water-resistance rating or a previously-owned
  // check. Query-level attributesToRetrieve only; no index setting changes.
  'Catalog_WaterResistanceRating',
  'Catalog_PreviouslyOwned',
  'Catalog_EarringType',
  'Catalog_NecklaceType',
  'Catalog_PendantType',
  'Catalog_RingType',
  'Catalog_BraceletType',
  'Inventory_AvailableSkuSizes',
  'Inventory_AvailableSkuSizeNames',
  'Inventory_InStock',
  'Pricing_ActivePrice',
  'Pricing_PriceRange',
  'Pricing_PriceLabelName',
  'Media_Images',
  'Ratings_AverageRating',
  // Audience projection (Craig-feedback Task 02, red test first): the exact
  // catalogue records carry both audience fields (verified live 2026-10-13 on
  // JRJ802A, 1ZPF6B and the 2026-10-12 Craig repro exact reads); the
  // projection previously discarded them, so no downstream identity check or
  // card display could ground an accepted men's audience scope. Query-level
  // attributesToRetrieve only; no index setting changes.
  'Catalog_Gender',
  'Catalog_TargetConsumer',
];
const BLOG_PROJECTION = [
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
];
// help_content record attributes verified live 2026-10-12
// (scripts/verify-help-index.mjs): document_id, title, content, heading_path,
// scope_text, canonical_url, source_role, topic, content_hash, fetched_at,
// modified_at. Same completeness contract as blog, with document_id in place
// of article_id.
const HELP_PROJECTION = [
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
];
const PROJECTIONS: Record<EvidenceSource, string[]> = {
  prod_catalog: PRODUCT_PROJECTION,
  blog: BLOG_PROJECTION,
  help: HELP_PROJECTION,
};

export type EvidenceSearchRequest = {
  source: EvidenceSource;
  query: string;
  count: number;
  exactObjectIDs?: readonly string[] | null;
  filters: readonly EffectiveFilter[];
  signal: AbortSignal;
};
export type EvidenceSearch = (
  request: EvidenceSearchRequest,
) => Promise<readonly Record<string, unknown>[]>;
/** Read-only facet-count interrogation for the discovery style overview.
 * Counts are candidates, never proof of eligibility. */
export type EvidenceFacetRequest = {
  source: EvidenceSource;
  query: string;
  filters: readonly EffectiveFilter[];
  facets: readonly string[];
  signal: AbortSignal;
};
export type EvidenceFacetSearch = (
  request: EvidenceFacetRequest,
) => Promise<Record<string, Record<string, number>>>;

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}
export function hashEvidenceRecord(record: Record<string, unknown>): string {
  return createHash('sha256').update(canonical(record)).digest('hex');
}
export function evidenceRef(source: EvidenceSource, objectID: string, contentHash: string): string {
  return `${source}/${encodeURIComponent(objectID)}/${contentHash}`;
}
export function projection(
  source: EvidenceSource,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const fields = PROJECTIONS[source];
  return Object.fromEntries(
    fields.filter((field) => Object.hasOwn(raw, field)).map((field) => [field, raw[field]]),
  );
}

class UpstreamFacetHttpError extends Error {
  constructor(readonly status: number) {
    super(`Algolia upstream HTTP ${status}`);
  }
}
/** Read-only facet-count interrogation for the discovery style overview: a
 * regular query-level `facets` request, brief filters applied as facet/numeric
 * filters. No index settings are read or changed. */
export function createAlgoliaFacetSearch(options: {
  appId: string;
  searchOnlyApiKey: string;
  fetch?: typeof fetch;
}): EvidenceFacetSearch {
  if (!/^[A-Za-z0-9]+$/.test(options.appId) || !options.searchOnlyApiKey.trim())
    throw new Error('Search-only Algolia credentials are required');
  const request = options.fetch ?? fetch;
  const numericOperator: Record<string, string> = {
    lt: '<',
    lte: '<=',
    gt: '>',
    gte: '>=',
    eq: '=',
  };
  return async ({ source, query, filters, facets, signal }) => {
    const numeric = filters
      .filter((f) => f.field === 'Pricing_ActivePrice')
      .map((f) => `${f.field}${numericOperator[f.operator]}${f.value}`);
    const facetFilters = filters
      .filter((f) => f.field !== 'Pricing_ActivePrice')
      .map((f) =>
        f.operator === 'in'
          ? f.value.map((value) => `${f.field}:${value}`)
          : `${f.field}:${f.operator === 'neq' ? '-' : ''}${String(f.value)}`,
      );
    const params = new URLSearchParams({
      query,
      hitsPerPage: '0',
      attributesToRetrieve: JSON.stringify(['objectID']),
      facets: JSON.stringify([...facets]),
      analytics: 'false',
      clickAnalytics: 'false',
      ...(numeric.length ? { numericFilters: JSON.stringify(numeric) } : {}),
      ...(facetFilters.length ? { facetFilters: JSON.stringify(facetFilters) } : {}),
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
    if (!response.ok) throw new UpstreamFacetHttpError(response.status);
    const payload = (await response.json()) as {
      results?: Array<{ facets?: Record<string, Record<string, number>> }>;
    };
    return payload.results?.[0]?.facets ?? {};
  };
}

export function createAlgoliaEvidenceSearch(options: {
  appId: string;
  searchOnlyApiKey: string;
  fetch?: typeof fetch;
}): EvidenceSearch {
  if (!/^[A-Za-z0-9]+$/.test(options.appId) || !options.searchOnlyApiKey.trim())
    throw new Error('Search-only Algolia credentials are required');
  const request = options.fetch ?? fetch;
  class UpstreamHttpError extends Error {
    constructor(readonly status: number) {
      super(`Algolia upstream HTTP ${status}`);
    }
  }
  const numericOperator: Record<string, string> = {
    lt: '<',
    lte: '<=',
    gt: '>',
    gte: '>=',
    eq: '=',
  };
  return async ({ source, query, count, exactObjectIDs = null, filters, signal }) => {
    if ((source === 'blog' || source === 'help') && exactObjectIDs !== null)
      throw new Error('Exact object lookup is only supported for prod_catalog');
    if (exactObjectIDs?.length) {
      const records = await Promise.all(
        exactObjectIDs.map(async (objectID) => {
          const params = new URLSearchParams({
            attributesToRetrieve: PROJECTIONS[source].join(','),
          });
          const response = await request(
            `https://${options.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(INDEXES[source])}/${encodeURIComponent(objectID)}?${params.toString()}`,
            {
              method: 'GET',
              headers: {
                'x-algolia-application-id': options.appId,
                'x-algolia-api-key': options.searchOnlyApiKey,
              },
              signal,
              redirect: 'error',
            },
          );
          if (response.status === 404) return null;
          if (!response.ok) throw new UpstreamHttpError(response.status);
          const record = (await response.json()) as Record<string, unknown>;
          return record.objectID === objectID ? record : null;
        }),
      );
      return records.filter((record): record is Record<string, unknown> => record !== null);
    }
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
      attributesToRetrieve: JSON.stringify(PROJECTIONS[source]),
      analytics: 'false',
      clickAnalytics: 'false',
      // Education passages are short, so one agent-crafted word absent from every
      // passage zeroes an otherwise well-aimed query (measured 2026-10-13:
      // "choosing chain necklace guide" -> 0 live blog hits; with allOptional it
      // returns 871 and well-matched queries keep identical hits, see
      // .checkpoint/runs/article-audience-2026-10-13/probe/f-mitigation-allOptional.json).
      // Query-level parameter only; the index setting stays untouched (read-only
      // boundary). prod_catalog keeps strict AND semantics.
      ...(source === 'prod_catalog' ? {} : { removeWordsIfNoResults: 'allOptional' }),
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
    if (!response.ok) throw new UpstreamHttpError(response.status);
    const payload = (await response.json()) as {
      results?: Array<{ hits?: Record<string, unknown>[] }>;
    };
    return payload.results?.[0]?.hits ?? [];
  };
}
