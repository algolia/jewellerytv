import { liteClient as algoliasearch } from 'algoliasearch/lite';
import type { SearchClient } from 'instantsearch.js';
const appId=import.meta.env.VITE_ALGOLIA_APP_ID;
const apiKey=import.meta.env.VITE_ALGOLIA_SEARCH_API_KEY;
if(!appId||!apiKey)throw new Error('Missing VITE_ALGOLIA_APP_ID and/or VITE_ALGOLIA_SEARCH_API_KEY. The storefront queries Algolia directly, so both must be set at build time (search-only key).');
const client=algoliasearch(appId,apiKey);
// The retired /api/search proxy forced these off on every request. The storefront
// is not an analytics source, so keep them off now that queries leave the browser.
const offByPolicy={analytics:false,clickAnalytics:false,enableABTest:false};
export const searchClient:SearchClient={
 ...client,
 search:requests=>client.search(requests.map(request=>({...request,params:{...request.params,...offByPolicy}}))),
};

/* One catalogue record by objectID. The retired server had /api/products/:id
 * for this; with the proxy gone the browser reads the record straight from
 * the index. Worth being explicit about the failure mode it replaces: the
 * dead route did not 404, it fell through to the SPA shell and returned
 * index.html with a 200, so the page reported a JSON parse error instead of a
 * missing product. */
export async function getProductRecord(
  objectID: string,
  options: { signal?: AbortSignal } = {},
): Promise<Record<string, unknown>> {
  const id = encodeURIComponent(objectID);
  const response = await fetch(`https://${appId}-dsn.algolia.net/1/indexes/prod_catalog/${id}`, {
    headers: { 'x-algolia-application-id': appId, 'x-algolia-api-key': apiKey },
    signal: options.signal,
  });
  if (response.status === 404) throw new Error('This item is no longer in the catalogue.');
  if (!response.ok) throw new Error('Product information could not be loaded.');
  return (await response.json()) as Record<string, unknown>;
}
