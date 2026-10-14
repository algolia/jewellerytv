#!/usr/bin/env node
/**
 * Read-only diagnostic: list live MaterialType / MaterialColor / MaterialPurity
 * facet values on prod_catalog so a typed colour encoding can be drafted
 * against values that actually exist. Prints aggregate facet values only.
 */
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
const key = process.env.ALGOLIA_SEARCH_API_KEY ?? local.ALGOLIA_SEARCH_API_KEY;
if (!appId || !key) throw new Error('Missing ALGOLIA_APP_ID / ALGOLIA_SEARCH_API_KEY');
const headers = { 'x-algolia-application-id': appId, 'x-algolia-api-key': key, 'content-type': 'application/json' };
const facets = [
  'Catalog_MaterialInformation.MaterialType',
  'Catalog_MaterialInformation.MaterialColor',
  'Catalog_MaterialInformation.MaterialPurity',
];
const params = new URLSearchParams({
  facets: JSON.stringify(facets),
  maxValuesPerFacet: '200',
  hitsPerPage: '0',
});
const res = await fetch(`https://${appId}-dsn.algolia.net/1/indexes/prod_catalog/query`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ params: params.toString() }),
});
if (!res.ok) {
  console.log(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  process.exit(1);
}
const j = await res.json();
const f = j.facets ?? {};
for (const k of Object.keys(f)) {
  console.log(k);
  for (const [v, c] of Object.entries(f[k]).slice(0, 40)) console.log(`  ${c}\t${v}`);
}
console.log('DONE read-only');
