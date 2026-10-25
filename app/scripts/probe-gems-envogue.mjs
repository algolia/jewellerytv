/* probe-gems-envogue.mjs: read-only diagnosis of the Gems en Vogue failure.
 * Compares what the concierge's search shape returns vs what the website's
 * facet-filtered search returns, on prod_catalog. Never writes. */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, '../../.env.local'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
);
const appId = env.ALGOLIA_APP_ID;
const key = env.ALGOLIA_SEARCH_API_KEY;
const index = env.INDEX_NAME || 'prod_catalog';
const post = (path, body) =>
  fetch(`https://${appId}-dsn.algolia.net/1/indexes/${index}${path}`, {
    method: 'POST',
    headers: { 'x-algolia-application-id': appId, 'x-algolia-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

/* Leg A: what the concierge sends today — brand as bare query words. */
const query = await post('/query', { query: 'gems en vogue', hitsPerPage: 8, facets: ['*'] });
console.log('A query="gems en vogue":', JSON.stringify({
  nbHits: query.nbHits,
  titles: (query.hits ?? []).slice(0, 8).map((h) => h.name?.slice(0, 60)),
  brandFacet: query.facets?.['Catalog_BrandNavigationName'],
}, null, 1));

/* Leg B: what the website does — brand facet filter with the exact value. */
const filtered = await post('/query', {
  query: '',
  facets: ['*'],
  maxValuesPerFacet: 200,
  filters: 'Catalog_BrandNavigationName:"Gems en Vogue"',
  hitsPerPage: 8,
});
console.log('B filter=Brand:"Gems en Vogue":', JSON.stringify({
  nbHits: filtered.nbHits,
  titles: (filtered.hits ?? []).slice(0, 8).map((h) => h.name?.slice(0, 60)),
}, null, 1));

/* Leg C: is the value case/spacing sensitive — scan the brand facet values. */
const scan = await post('/query', { query: '', facets: ['Catalog_BrandNavigationName'], maxValuesPerFacet: 500, hitsPerPage: 0 });
const brands = Object.entries(scan.facets?.['Catalog_BrandNavigationName'] ?? {}).filter(([name]) =>
  /gem|vogue/i.test(name),
);
console.log('C brand values matching /gem|vogue/i:', JSON.stringify(brands, null, 1));
