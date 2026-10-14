// Craig Task 07 follow-up probe, 2026-10-13: apostrophe hypothesis + settings.
// Read-only. Mirrors the app blog search; adds settings GET (diagnosis only,
// nothing written) and controlled query variants.
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

const paramsFor = (query) =>
  new URLSearchParams({
    query,
    hitsPerPage: '5',
    attributesToRetrieve: JSON.stringify(['objectID', 'heading_path', 'canonical_url', 'content']),
    analytics: 'false',
    clickAnalytics: 'false',
  }).toString();

async function searchBlog(query) {
  const response = await fetch(`https://${config.appId}.algolia.net/1/indexes/*/queries`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ requests: [{ indexName: 'blog', params: paramsFor(query) }] }),
  });
  if (!response.ok) throw new Error(`search HTTP ${response.status}`);
  const payload = await response.json();
  const result = payload.results?.[0] ?? {};
  return {
    query,
    nbHits: result.nbHits ?? 0,
    hits: (result.hits ?? []).map((h) => ({
      objectID: h.objectID,
      heading_path: h.heading_path,
      contentHead: (h.content ?? '').slice(0, 220),
    })),
  };
}

const variants = [
  "men's chain necklace styles choosing chain necklace guide",
  'men’s chain necklace styles choosing chain necklace guide',
  "men's chain necklace styles",
  'men’s chain necklace styles',
  "men's chain necklace",
  'men s chain necklace',
  "women's chain necklace length",
  'women s chain necklace length',
  'chain necklace lengths for men',
  'chain necklace lengths for women',
  'what are common chain lengths for men',
  'what are the different chain lengths for women',
];

const results = [];
for (const query of variants) {
  const r = await searchBlog(query);
  results.push(r);
  console.log(
    `${JSON.stringify(r.nbHits).padStart(3)} hits | ${JSON.stringify(query)} | ` +
      (r.hits[0] ? `1st: ${JSON.stringify(r.hits[0].heading_path)}` : 'no hits'),
  );
}

// Index settings: read-only diagnosis of searchableAttributes/typo behavior.
const settingsResponse = await fetch(
  `https://${config.appId}-dsn.algolia.net/1/indexes/blog/settings`,
  { headers },
);
const settings = settingsResponse.ok ? await settingsResponse.json() : { error: settingsResponse.status };
writeFileSync(join(OUT, 'c-apostrophe-variants.json'), JSON.stringify(results, null, 2));
writeFileSync(join(OUT, 'c-blog-settings-readonly.json'), JSON.stringify(settings, null, 2));
console.log('\nsearchableAttributes:', JSON.stringify(settings.searchableAttributes));
console.log('typoTolerance:', JSON.stringify(settings.typoTolerance));
console.log('removeWordsIfNoResults:', JSON.stringify(settings.removeWordsIfNoResults));
console.log('ignorePlurals:', JSON.stringify(settings.ignorePlurals));
console.log('queryType:', JSON.stringify(settings.queryType));
console.log(`\nReceipts: ${OUT}/c-apostrophe-variants.json, ${OUT}/c-blog-settings-readonly.json`);
