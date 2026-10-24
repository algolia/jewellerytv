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

const gem = 'Catalog_GemstoneInformation.GemstoneName:"Opal"';
const ring = 'Catalog_ProductType:"Ring"';
const stock = 'Inventory_InStock:true';
const fine = '(Catalog_JewelryMaterialNavigationPurity:"10K" OR Catalog_JewelryMaterialNavigationPurity:"14K" OR Catalog_JewelryMaterialNavigationPurity:"18K" OR Catalog_JewelryMaterialNavigationPurity:"24K")';
const isFine = (h) => ['10K', '14K', '18K', '24K'].includes([].concat(h.Catalog_JewelryMaterialNavigationPurity ?? [])[0] ?? '');

// A. The aimed query the model never ran
const aimed = await post({ query: 'opal ring', filters: [gem, ring, fine, stock].join(' AND '), length: 8 });
console.log('AIMED fine-gold opal rings:', aimed.nbHits);
for (const h of aimed.hits) console.log('  ', h.objectID, '|', h.Catalog_TitleDescription?.slice(0, 60));

// B. The exact broadening query the model DID run (no purity facet) — where do fine gold pieces rank?
const actual = await post({ query: 'opal ring gold band solitaire', filters: [stock].join(' AND '), length: 24 });
const fineIds = actual.hits.filter(isFine);
console.log('model query "opal ring gold band solitaire": nbHits(page)=', actual.nbHits, 'fine-gold pieces in first 24:', fineIds.map((h) => h.objectID));

// C. What did the model's "opal ring" query window look like: fine gold present?
const q1 = await post({ query: 'opal ring', filters: [gem, ring, stock].join(' AND '), length: 24 });
const f1 = q1.hits.filter(isFine);
console.log('model query "opal ring" +gem+ring: nbHits(page)=', q1.nbHits, 'fine-gold in first 24:', f1.map((h) => h.objectID + ' ' + (h.Catalog_TitleDescription || '').slice(0, 40)));
