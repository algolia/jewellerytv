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
