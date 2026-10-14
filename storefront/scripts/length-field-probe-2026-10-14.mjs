#!/usr/bin/env node
/**
 * Read-only diagnostic: sample a chain-necklace and a ring record and print
 * every field key containing "length" or "size" plus Material purity fields,
 * to identify the scannable attribute fields for Discover cards.
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

for (const query of ['chain necklace', 'stackable ring']) {
  const res = await fetch(`https://${appId}-dsn.algolia.net/1/indexes/prod_catalog/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ params: `query=${encodeURIComponent(query)}&hitsPerPage=2` }),
  });
  const j = await res.json();
  console.log(`QUERY ${query}: ${j.nbHits} hits`);
  for (const rec of (j.hits ?? []).slice(0, 2)) {
    console.log(`  ${rec.objectID} | ${String(rec.Catalog_ProductType ?? '')} | ${String(rec.Pricing_ActivePrice ?? '')}`);
    for (const k of Object.keys(rec).filter((k) => /length|size/i.test(k))) {
      console.log(`    ${k} = ${JSON.stringify(rec[k]).slice(0, 140)}`);
    }
  }
}
console.log('DONE read-only');
