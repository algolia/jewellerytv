/* One-off: what do REAL sterling silver pieces carry in material fields? */
import { loadSettings } from './baseline/settings.mjs';
const S = loadSettings();
const res = await fetch('https://' + S.appId + '-dsn.algolia.net/1/indexes/prod_catalog/query', {
  method: 'POST',
  headers: { 'X-Algolia-Application-Id': S.appId, 'X-Algolia-API-Key': S.searchKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ params: 'query=Sterling Silver Textured Heart&hitsPerPage=3&filters=Inventory_InStock:true&attributesToRetrieve=objectID,Catalog_TitleDescription,Catalog_JewelryMaterialNavigationName,Catalog_JewelryMaterialNavigationPurity' }),
});
const j = await res.json();
for (const h of j.hits ?? [])
  console.log(JSON.stringify({ t: (h.Catalog_TitleDescription ?? '').slice(0, 45), name: h.Catalog_JewelryMaterialNavigationName, purity: h.Catalog_JewelryMaterialNavigationPurity }));
