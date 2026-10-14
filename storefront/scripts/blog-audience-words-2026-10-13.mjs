// Craig Task 07 word-isolation probe, 2026-10-13 (read-only): which single
// word in the agent-crafted education queries zeroes the blog index?
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
    hitsPerPage: '3',
    attributesToRetrieve: JSON.stringify(['objectID', 'heading_path']),
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
  return payload.results?.[0] ?? {};
}

const words = ['men', "men's", 'chain', 'necklace', 'styles', 'choosing', 'guide'];
const rows = [];
for (const word of words) {
  const r = await searchBlog(word);
  rows.push({ word, nbHits: r.nbHits ?? 0 });
  console.log(`${String(r.nbHits ?? 0).padStart(4)} | ${word}`);
}
// Combinations to pin the interaction
for (const q of ['choosing chain necklace guide', 'styles choosing', 'guide choosing']) {
  const r = await searchBlog(q);
  rows.push({ word: q, nbHits: r.nbHits ?? 0 });
  console.log(`${String(r.nbHits ?? 0).padStart(4)} | ${q}`);
}
writeFileSync(join(OUT, 'd-word-isolation.json'), JSON.stringify(rows, null, 2));

// Quote the men's and women's length passages in full (Part A already saved
// the full inventory; here we re-fetch the two canonical passages for the
// receipt's verbatim quotes).
const full = await fetch(`https://${config.appId}.algolia.net/1/indexes/*/queries`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    requests: [
      {
        indexName: 'blog',
        params: new URLSearchParams({
          query: 'common chain lengths for men',
          hitsPerPage: '2',
          attributesToRetrieve: JSON.stringify(['objectID', 'heading_path', 'content', 'canonical_url']),
          analytics: 'false',
          clickAnalytics: 'false',
        }).toString(),
      },
      {
        indexName: 'blog',
        params: new URLSearchParams({
          query: 'chain lengths for women',
          hitsPerPage: '2',
          attributesToRetrieve: JSON.stringify(['objectID', 'heading_path', 'content', 'canonical_url']),
          analytics: 'false',
          clickAnalytics: 'false',
        }).toString(),
      },
    ],
  }),
});
const fullPayload = await full.json();
const quoted = (fullPayload.results ?? []).map((r) => ({
  nbHits: r.nbHits,
  hits: (r.hits ?? []).map((h) => ({
    objectID: h.objectID,
    heading_path: h.heading_path,
    canonical_url: h.canonical_url,
    content: h.content,
  })),
}));
writeFileSync(join(OUT, 'd-quoted-passages.json'), JSON.stringify(quoted, null, 2));
console.log('\n--- MEN passage quote ---');
console.log(quoted[0]?.hits?.[0]?.content ?? 'none');
console.log('\n--- WOMEN passage quote ---');
console.log(quoted[1]?.hits?.[0]?.content ?? 'none');
