/* One-off: verify the worked-example facet values exist verbatim. */
import { loadSettings } from './baseline/settings.mjs';
const S = loadSettings();
const res = await fetch('https://' + S.appId + '-dsn.algolia.net/1/indexes/prod_catalog/query', {
  method: 'POST',
  headers: { 'X-Algolia-Application-Id': S.appId, 'X-Algolia-API-Key': S.searchKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ params: 'query=&hitsPerPage=0&facets=["Catalog_JewelryMaterialNavigationPurity","Catalog_GemstoneAndPearlNavigationName","Catalog_GemstoneInformationPrimary.GemstoneName","Catalog_JewelryMaterialNavigationName","Catalog_JewelryMaterialNavigationColor"]&maxValuesPerFacet=200&filters=Inventory_InStock:true' }),
});
const j = await res.json();
for (const [attr, values] of Object.entries(j.facets ?? {})) {
  const keys = Object.keys(values);
  console.log('==', attr, '(' + keys.length + ')');
  console.log(keys.filter((k) => /ruby|sterling|\d+K|gold/i.test(k)).slice(0, 20).join(' | '));
}
