import { readFileSync } from 'node:fs';
const env = {};
for (const line of readFileSync('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const post = (body) =>
  fetch('https://' + env.ALGOLIA_APP_ID + '-dsn.algolia.net/1/indexes/prod_catalog/query', {
    method: 'POST',
    headers: {
      'X-Algolia-Application-Id': env.ALGOLIA_APP_ID,
      'X-Algolia-API-Key': env.ALGOLIA_SEARCH_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const stock = 'Inventory_InStock:true';

// 1. Total opal rings in stock
const total = await post({ query: '', filters: `Catalog_GemstoneAndPearlNavigationName:"Opal" AND Catalog_ProductType:"Ring" AND ${stock}`, length: 0 });
console.log('opal rings in stock (total):', total.nbHits);

// 2. Purity facet values across opal rings
const facet = await post({
  query: '',
  filters: `Catalog_GemstoneAndPearlNavigationName:"Opal" AND Catalog_ProductType:"Ring" AND ${stock}`,
  facets: ['Catalog_JewelryMaterialNavigationPurity', 'Catalog_JewelryMaterialNavigationName'],
  maxValuesPerFacet: 60,
  length: 0,
});
console.log('purity values:', JSON.stringify(facet.facets?.Catalog_JewelryMaterialNavigationPurity));
console.log('material names:', JSON.stringify(facet.facets?.Catalog_JewelryMaterialNavigationName)?.slice(0, 400));
