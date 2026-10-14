// Read-only catalogue probe for Craig-feedback Task 01 (pearl evidence repair).
// Queries prod_catalog with the search-only key; changes nothing.
// Usage: node scripts/pearl-catalogue-probe-2026-10-12.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const local = {};
try {
  const path = fileURLToPath(new URL('../../.env.local', import.meta.url));
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) local[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {
  // environment-only use
}
const appId = process.env.ALGOLIA_APP_ID ?? local.ALGOLIA_APP_ID;
const apiKey = process.env.ALGOLIA_SEARCH_API_KEY ?? local.ALGOLIA_SEARCH_API_KEY;
if (!appId || !apiKey) throw new Error('Missing ALGOLIA_APP_ID / ALGOLIA_SEARCH_API_KEY');

async function search(requests) {
  const res = await fetch(`https://${appId}-dsn.algolia.net/1/indexes/*/queries`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-algolia-application-id': appId,
      'x-algolia-api-key': apiKey,
    },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).results;
}

const out = {};

// 1. How many records carry pearl info at all, and by condition/price?
const [pearlText, condFacets] = await search([
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: 'Pearl',
      hitsPerPage: '0',
    }).toString(),
  },
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: 'Pearl',
      filters: 'Catalog_Condition:"First Quality" AND Pricing_ActivePrice <= 1000 AND Inventory_InStock:true',
      hitsPerPage: '0',
    }).toString(),
  },
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: 'Pearl',
      hitsPerPage: '0',
    }).toString(),
  },
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: 'Pearl',
      facets: 'Catalog_Condition,Catalog_Quantity',
      hitsPerPage: '0',
    }).toString(),
  },
]);
out.counts = {
  textQueryPearl: pearlText.nbHits,
  conditionFacets: condFacets.facets ?? {},
};

// 2. Distinct pearl material names (facet-free: sample top hits and group)
const [sample] = await search([
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: 'Pearl',
      hitsPerPage: '100',
      attributesToHighlight: 'none',
      attributesToRetrieve:
        'objectID,Catalog_ProductNumber,Catalog_TitleDescription,Catalog_Condition,Catalog_Price,Catalog_Quantity,Catalog_PearlInformation,Catalog_PearlInformationPrimary,Catalog_GemstoneInformationPrimary,Catalog_ProductType,Catalog_JewelryMaterialNavigationName',
    }).toString(),
  },
]);
const byPearlType = new Map();
for (const h of sample.hits) {
  const names = (h.Catalog_PearlInformation ?? [])
    .map((p) => p.PrimaryMaterialName ?? p.MaterialName ?? JSON.stringify(Object.keys(p)))
    .filter(Boolean);
  const key = names.join('|') || '(empty)';
  if (!byPearlType.has(key)) byPearlType.set(key, []);
  byPearlType.get(key).push(`${h.objectID} ${h.Catalog_Condition ?? ''} $${h.Catalog_Price ?? ''} ${(h.Catalog_TitleDescription ?? '').slice(0, 60)}`);
}
out.pearlTypeGroups = Object.fromEntries([...byPearlType.entries()].map(([k, v]) => [k, { count: v.length, sample: v.slice(0, 5) }]));

// 3. Classic strands: the brief's exact eligible-filter chain (readback parity)
const [strands] = await search([
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: '',
      filters:
        'Catalog_ProductType:"Necklace" AND Catalog_NecklaceType:"Strand" AND Catalog_PearlInformationPrimary.PearlFullName:"Freshwater Pearl" AND Pricing_ActivePrice<=1000 AND Inventory_InStock:true AND Catalog_Condition:"First Quality"',
      hitsPerPage: '20',
      attributesToHighlight: 'none',
      attributesToRetrieve:
        'objectID,Catalog_ProductNumber,Catalog_TitleDescription,Catalog_Condition,Pricing_ActivePrice,Inventory_InStock,Catalog_PearlInformation,Catalog_PearlInformationPrimary',
    }).toString(),
  },
]);
out.classicStrandCandidates = strands.hits.map((h) => ({
  objectID: h.objectID,
  sku: h.Catalog_ProductNumber,
  title: h.Catalog_TitleDescription,
  condition: h.Catalog_Condition,
  price: h.Pricing_ActivePrice,
  inStock: h.Inventory_InStock,
  pearl: h.Catalog_PearlInformation,
  pearlPrimary: h.Catalog_PearlInformationPrimary,
}));

console.log(JSON.stringify(out, null, 2));
