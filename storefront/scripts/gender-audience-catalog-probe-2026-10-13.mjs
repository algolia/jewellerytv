// Read-only catalogue probe for Craig-feedback Task 02 (men's product audience).
// Queries prod_catalog with the search-only key; changes nothing.
// Verifies the real semantics of Catalog_Gender and Catalog_TargetConsumer:
// filterability, live value lists, cross-field agreement on real records, and
// the exact Craig repro population (men's watch under $1,000).
// Usage: node scripts/gender-audience-catalog-probe-2026-10-13.mjs
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

// 1. Filterability + live value lists for both audience attributes.
//    facets=['Catalog_Gender','Catalog_TargetConsumer'] over the whole index:
//    a value list here means the attribute is facetable (filterable) today.
const [unfiltered] = await search([
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: '',
      hitsPerPage: '0',
      facets: JSON.stringify(['Catalog_Gender', 'Catalog_TargetConsumer']),
      maxValuesPerFacet: '100',
      analytics: 'false',
      clickAnalytics: 'false',
    }).toString(),
  },
]);
out.filterable = {
  Catalog_Gender: Object.keys(unfiltered.facets?.Catalog_Gender ?? {}),
  Catalog_TargetConsumer: Object.keys(unfiltered.facets?.Catalog_TargetConsumer ?? {}),
};
out.genderCountsAll = unfiltered.facets?.Catalog_Gender ?? {};
out.targetConsumerCountsAll = unfiltered.facets?.Catalog_TargetConsumer ?? {};

// 2. Wrist-watch-scoped value lists (the audience question is watch-scoped for
//    Craig's repro; this also tells us whether Gender narrows by product type).
const [watchFacets] = await search([
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: '',
      hitsPerPage: '0',
      facets: JSON.stringify(['Catalog_Gender', 'Catalog_TargetConsumer']),
      maxValuesPerFacet: '100',
      filters: 'Catalog_ProductType:"Wrist Watch"',
      analytics: 'false',
      clickAnalytics: 'false',
    }).toString(),
  },
]);
out.genderCountsWristWatch = watchFacets.facets?.Catalog_Gender ?? {};
out.targetConsumerCountsWristWatch = watchFacets.facets?.Catalog_TargetConsumer ?? {};

// 3. Cross-field agreement on real records: sample 3 records per Gender value
//    carrying both fields, to see how Catalog_TargetConsumer tracks
//    Catalog_Gender (the record-level check must not contradict the filter).
const genderValues = Object.keys(out.genderCountsWristWatch);
out.crossFieldSamples = {};
for (const gender of genderValues) {
  const [sample] = await search([
    {
      indexName: 'prod_catalog',
      params: new URLSearchParams({
        query: '',
        hitsPerPage: '3',
        filters: `Catalog_ProductType:"Wrist Watch" AND Catalog_Gender:"${gender}"`,
        attributesToRetrieve: JSON.stringify([
          'objectID',
          'Catalog_Gender',
          'Catalog_TargetConsumer',
          'Catalog_Condition',
          'Inventory_InStock',
          'Pricing_ActivePrice',
        ]),
        analytics: 'false',
        clickAnalytics: 'false',
      }).toString(),
    },
  ]);
  out.crossFieldSamples[gender] = sample.hits.map((h) => ({
    objectID: h.objectID,
    gender: h.Catalog_Gender,
    targetConsumer: h.Catalog_TargetConsumer ?? null,
    condition: h.Catalog_Condition ?? null,
    inStock: h.Inventory_InStock ?? null,
    price: h.Pricing_ActivePrice ?? null,
  }));
}

// 4. The exact Craig repro records: three shown Female substitutes and three
//    verified male/unisex eligible examples. Exact-object reads prove the
//    record-level audience fields the post-search exclusion will verify.
const ids = ['JRJ802A', 'PPR7845', 'IRE616', '1ZPF6B', '1ZLZDA', '1Z8KBE'];
const reads = await Promise.all(
  ids.map((id) =>
    fetch(
      `https://${appId}-dsn.algolia.net/1/indexes/prod_catalog/${encodeURIComponent(id)}?attributesToRetrieve=${encodeURIComponent(
        JSON.stringify([
          'objectID',
          'Catalog_Gender',
          'Catalog_TargetConsumer',
          'Catalog_Condition',
          'Inventory_InStock',
          'Pricing_ActivePrice',
          'Catalog_ProductType',
          'Catalog_WatchStyle',
        ]),
      )}`,
      {
        headers: {
          'x-algolia-application-id': appId,
          'x-algolia-api-key': apiKey,
        },
      },
    ).then((r) => (r.ok ? r.json() : { objectID: id, missing: true })),
  ),
);
out.reproRecords = Object.fromEntries(reads.map((r) => [r.objectID ?? 'unknown', r]));

// 5. Craig's variant under the proposed authoritative filter: how many male or
//    unisex, first-quality, in-stock wrist watches under $1,000 exist today.
const [repro] = await search([
  {
    indexName: 'prod_catalog',
    params: new URLSearchParams({
      query: '',
      hitsPerPage: '5',
      filters:
        'Catalog_ProductType:"Wrist Watch" AND (Catalog_Gender:"Male" OR Catalog_Gender:"Unisex") AND Pricing_ActivePrice <= 1000 AND Inventory_InStock:true AND Catalog_Condition:"First Quality"',
      attributesToRetrieve: JSON.stringify([
        'objectID',
        'Catalog_Gender',
        'Catalog_TargetConsumer',
        'Pricing_ActivePrice',
        'Catalog_WatchStyle',
      ]),
      analytics: 'false',
      clickAnalytics: 'false',
    }).toString(),
  },
]);
out.mensWatchUnder1000 = {
  nbHits: repro.nbHits,
  samples: repro.hits.map((h) => ({
    objectID: h.objectID,
    gender: h.Catalog_Gender,
    targetConsumer: h.Catalog_TargetConsumer ?? null,
    price: h.Pricing_ActivePrice ?? null,
    style: h.Catalog_WatchStyle ?? null,
  })),
};

console.log(JSON.stringify(out, null, 2));
