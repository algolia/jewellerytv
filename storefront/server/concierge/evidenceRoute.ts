import { z } from 'zod';
import { briefStateV3Schema } from '../../shared/briefSchema.js';
import { retrieveEvidenceInputSchema } from '../../shared/concierge/retrieval/schema.js';
import {
  createAlgoliaEvidenceSearch,
  createAlgoliaFacetSearch,
  createEvidenceRetriever,
} from './retrieveEvidence.js';
import { createContentEvidenceSearch } from './contentEvidenceSearch.js';
import type { CatalogVocabularyCache } from './catalogVocabulary.js';

const requestSchema = z
  .object({
    input: retrieveEvidenceInputSchema,
    brief: briefStateV3Schema,
  })
  .strict();

/** The browser supplies its accepted brief snapshot, never a model-authored filter.
 * The client callback must recheck its live revision after this response, since
 * a server request cannot observe a later edit in tab-scoped session state. */
export async function runEvidenceRoute(
  raw: unknown,
  options: {
    appId: string;
    searchOnlyApiKey: string;
    fetch: typeof fetch;
    signal: AbortSignal;
    vocabulary?: CatalogVocabularyCache;
  },
) {
  const request = requestSchema.parse(raw);
  // Blog/help content searches get the zero-hit relaxation ladder (Craig Task
  // 05): the verbatim query is searched first, and only a zero-hit result is
  // retried once with query-level removeWordsIfNoResults=lastWords. Product
  // catalogue and exact-object lookups pass through untouched.
  const search = createContentEvidenceSearch({
    appId: options.appId,
    searchOnlyApiKey: options.searchOnlyApiKey,
    fetch: options.fetch,
    inner: createAlgoliaEvidenceSearch(options),
  });
  const retrieve = createEvidenceRetriever({
    search,
    facetSearch: createAlgoliaFacetSearch(options),
    currentState: () => request.brief,
    signal: options.signal,
    ...(options.vocabulary ? { vocabulary: options.vocabulary } : {}),
  });
  return retrieve(request.input);
}
