// Craig Task 07 mitigation validation, 2026-10-13 (read-only): prove that a
// QUERY-LEVEL removeWordsIfNoResults=allOptional (app-side parameter, index
// settings untouched) rescues Craig's zero-hit long query while full-word
// matches keep ranking first. This validates the collision patch proposed for
// storefront/server/concierge/retrieveEvidence.ts before anyone applies it.
import { loadConfig } from '../server/config.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const config = loadConfig();
const OUT = '../.checkpoint/runs/article-audience-2026-10-13/probe';
mkdirSync(OUT, { recursive: true });
const headers = {
  'content-type': 'application/json',
  'x-algolia-application-id': config.appId,
  'x-algolia-api-key': config.apiKey,
};

const paramsFor = (query, extra) =>
  new URLSearchParams({
    query,
    hitsPerPage: '5',
    attributesToRetrieve: JSON.stringify(['objectID', 'heading_path', 'title']),
    analytics: 'false',
    clickAnalytics: 'false',
    ...extra,
  }).toString();

async function searchBlog(query, extra = {}) {
  const response = await fetch(`https://${config.appId}.algolia.net/1/indexes/*/queries`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      requests: [{ indexName: 'blog', params: paramsFor(query, extra) }],
    }),
  });
  if (!response.ok) throw new Error(`search HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload.results?.[0] ?? {};
  return {
    query,
    extra,
    nbHits: result.nbHits ?? 0,
    hits: (result.hits ?? []).map((h) => ({
      objectID: h.objectID,
      title: h.title,
      heading_path: h.heading_path,
    })),
  };
}

const craig = "men's chain necklace styles choosing chain necklace guide";
const rows = [];
for (const [name, extra] of [
  ['baseline-none', {}],
  ['allOptional-query-level', { removeWordsIfNoResults: 'allOptional' }],
]) {
  const r = await searchBlog(craig, extra);
  rows.push({ name, ...r });
  console.log(`${name}: nbHits=${r.nbHits}`);
  r.hits.slice(0, 5).forEach((h, i) =>
    console.log(`  ${i + 1}. ${JSON.stringify(h.heading_path)}`),
  );
}

// Confirm the mitigation does not degrade the already-correct audience cases:
// the top hit must still be the audience-relevant passage.
for (const q of ['chain necklaces for men', 'chain necklace lengths for women', 'chain necklace guide']) {
  const base = await searchBlog(q);
  const mit = await searchBlog(q, { removeWordsIfNoResults: 'allOptional' });
  rows.push({ name: `audience-check:${q}`, ...mit, baselineNbHits: base.nbHits, baselineFirst: base.hits[0]?.heading_path ?? null });
  console.log(
    `${q} | baseline top=${JSON.stringify(base.hits[0]?.heading_path)} | ` +
      `allOptional top=${JSON.stringify(mit.hits[0]?.heading_path)} (nbHits ${base.nbHits} -> ${mit.nbHits})`,
  );
}
writeFileSync(join(OUT, 'f-mitigation-allOptional.json'), JSON.stringify(rows, null, 2));
console.log(`\nReceipt: ${OUT}/f-mitigation-allOptional.json`);
