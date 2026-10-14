// Read-only catalogue probe for the Father's Day watch scenario design.
// Queries prod_catalog with the search-only key; changes nothing.
// Questions answered:
//  1. Which band/strap material and water-resistance fields actually exist on watch records?
//  2. What are the live Catalog_WatchStyle, Catalog_Gender and Catalog_TargetConsumer values?
//  3. Do swim-compatible band materials have in-stock first-quality men's/unisex examples at mid budget?
// Usage: node scripts/watch-attribute-probe-2026-10-13.mjs
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

// 1. Full attribute set on real wrist-watch records (no restrictedAttributes to limit fields).
const [oneWatch] = await search([
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: 'wrist watch',
      hitsPerPage: '3',
      attributesToRetrieve: '[]',
    }),
  },
]);
const watchHits = oneWatch.hits.filter((h) => (h.Catalog_ProductType ?? '') === 'Wrist Watch');
const attrKeys = new Set();
for (const h of watchHits) for (const k of Object.keys(h)) if (!k.startsWith('_')) attrKeys.add(k);
out.watchRecordAttributes = [...attrKeys].sort();
out.sampleWatchObjectIDs = watchHits.map((h) => h.objectID);

// 2. Which of those fields mention band/strap/material/water/resist?
out.materialWaterCandidates = out.watchRecordAttributes.filter((k) =>
  /band|strap|material|water|resist|bracelet|metal/i.test(k)
);

// 3. Live facet values for the audience + style fields over the watch population.
const [watchFacets] = await search([
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: '',
      hitsPerPage: '0',
      filters: 'Catalog_ProductType:"Wrist Watch"',
      facets: JSON.stringify([
        'Catalog_Gender',
        'Catalog_TargetConsumer',
        'Catalog_WatchStyle',
        'Catalog_Condition',
      ]),
      maxValuesPerFacet: '60',
    }),
  },
]);
out.watchFacets = watchFacets.facets ?? {};

// 4. Swim-friendliness check: men's/unisex, first-quality, in-stock, under $1,000,
//    grouped by the band material field if one exists (found dynamically above).
const bandField = out.materialWaterCandidates.find((k) => /band/i.test(k)) ?? null;
out.bandFieldUsed = bandField;
if (bandField) {
  const [bandFacets] = await search([
    {
      indexName: 'prod_catalog',
      params: new URLSearchParams({
        query: '',
        hitsPerPage: '0',
        filters: `Catalog_ProductType:"Wrist Watch" AND Catalog_Gender:"Male" OR Catalog_ProductType:"Wrist Watch" AND Catalog_Gender:"Unisex"`,
        facets: JSON.stringify([bandField, 'Catalog_WatchStyle']),
        maxValuesPerFacet: '60',
      }),
    },
  ]);
  out.bandValuesMaleUnisex = bandFacets.facets ?? {};
  // 5. Concrete example records per promising band value (steel/rubber/silicone/resin).
  const promising = Object.entries(bandFacets.facets?.[bandField] ?? {})
    .filter(([v]) => /steel|rubber|silicone|resin|titanium|nylon/i.test(v))
    .map(([v]) => v)
    .slice(0, 6);
  out.promisingBandValues = promising;
  const examples = [];
  for (const value of promising) {
    const [r] = await search([
      {
        indexName: 'prod_catalog',
        params: new URLSearchParams({
          query: '',
          hitsPerPage: '4',
          filters: `Catalog_ProductType:"Wrist Watch" AND ${bandField}:"${value}" AND Pricing_ActivePrice < 1000`,
          facets: JSON.stringify(['Catalog_Gender', 'Catalog_Condition', 'Catalog_WatchStyle']),
          attributesToRetrieve: JSON.stringify([
            'objectID',
            'Catalog_TitleDescription',
            'Catalog_Gender',
            'Catalog_TargetConsumer',
            'Catalog_Condition',
            'Catalog_WatchStyle',
            'Pricing_ActivePrice',
            'Inventory_InStock',
            bandField,
          ]),
        }),
      },
    ]);
    examples.push({ band: value, nbHits: r.nbHits, facets: r.facets, hits: r.hits });
  }
  out.bandExamples = examples;
}

// 6. Leather-band sporty watches exist? (the contradiction needs a real leather sporty pool)
const [leatherSport] = await search([
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: '',
      hitsPerPage: '5',
      filters: `Catalog_ProductType:"Wrist Watch" AND ${bandField}:"Leather"`,
      facets: JSON.stringify(['Catalog_WatchStyle', 'Catalog_Gender']),
      attributesToRetrieve: JSON.stringify([
        'objectID',
        'Catalog_TitleDescription',
        'Catalog_Gender',
        'Catalog_WatchStyle',
        'Pricing_ActivePrice',
        'Inventory_InStock',
        bandField,
      ]),
    }),
  },
]);
out.leatherSportFacets = leatherSport.facets;
out.leatherExamples = leatherSport.hits.map((h) => ({
  id: h.objectID,
  title: h.Catalog_TitleDescription,
  gender: h.Catalog_Gender,
  style: h.Catalog_WatchStyle,
  price: h.Pricing_ActivePrice,
  inStock: h.Inventory_InStock,
}));

console.log(JSON.stringify(out, null, 2));
