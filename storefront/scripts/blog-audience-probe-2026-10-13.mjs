// Craig Task 07 (article-audience) read-only blog probe, 2026-10-13.
// ZERO paid turns: this never touches /api/chat or any agent. It issues the
// same read-only Algolia search request the app's retrieveEvidence blog path
// issues (same endpoint shape, same BLOG_PROJECTION attributesToRetrieve, no
// filters for blog/help), and additionally an object fetch by objectID.
// No writes of any kind; no index settings are read or changed.
import { loadConfig } from '../server/config.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const config = loadConfig();
const OUT = process.argv[2] || '../.checkpoint/runs/article-audience-2026-10-13/probe';
mkdirSync(OUT, { recursive: true });

const BLOG_PROJECTION = [
  'objectID',
  'article_id',
  'title',
  'heading_path',
  'content',
  'scope_text',
  'canonical_url',
  'source_role',
  'author',
  'published_at',
  'modified_at',
  'content_hash',
  'category',
  'tags',
  'language',
  'run_id',
  'fetched_at',
  'schema_version',
];

const headers = {
  'content-type': 'application/json',
  'x-algolia-application-id': config.appId,
  'x-algolia-api-key': config.apiKey,
};

async function searchBlog(query, hitsPerPage = 8) {
  const params = new URLSearchParams({
    query,
    hitsPerPage: String(hitsPerPage),
    attributesToRetrieve: JSON.stringify(BLOG_PROJECTION),
    analytics: 'false',
    clickAnalytics: 'false',
  });
  const response = await fetch(`https://${config.appId}.algolia.net/1/indexes/*/queries`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ requests: [{ indexName: 'blog', params: params.toString() }] }),
  });
  if (!response.ok) throw new Error(`search HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return payload.results?.[0] ?? {};
}

function summarize(hit) {
  const content = typeof hit.content === 'string' ? hit.content : '';
  return {
    objectID: hit.objectID,
    article_id: hit.article_id,
    title: hit.title,
    heading_path: hit.heading_path,
    scope_text: hit.scope_text,
    canonical_url: hit.canonical_url,
    source_role: hit.source_role,
    category: hit.category,
    tags: hit.tags,
    published_at: hit.published_at,
    modified_at: hit.modified_at,
    contentLength: content.length,
    contentPreview: content.slice(0, 500),
    contentFull: content,
  };
}

// ---- Part A: what chain-necklace article records exist in the blog index? ----
const inventoryQuery = 'chain necklaces';
const inventory = await searchBlog(inventoryQuery, 20);
const inventoryHits = (inventory.hits ?? []).map(summarize);
writeFileSync(join(OUT, 'a-inventory-query.json'), JSON.stringify({
  probe: 'article-audience Part A: blog index inventory for chain necklaces',
  query: inventoryQuery,
  nbHits: inventory.nbHits,
  hitCount: inventoryHits.length,
  hits: inventoryHits,
}, null, 2));

// Compact inventory listing for stdout
for (const h of inventoryHits) {
  console.log(`INVENTORY ${h.objectID} | ${h.canonical_url} | ${h.heading_path}`);
}

// ---- Part B: mirror the app's blog queries (Craig's exact + women's + neutral) ----
const queries = [
  { label: "craig-mens-exact", query: "men's chain necklace styles choosing chain necklace guide" },
  { label: "womens-chain", query: "women's chain necklace length guide choosing the right length" },
  { label: "neutral-chain", query: "chain necklace guide" },
  { label: "mens-chain-plain", query: "chain necklaces for men" },
];

const probes = [];
for (const { label, query } of queries) {
  const result = await searchBlog(query, 8);
  const hits = (result.hits ?? []).map(summarize);
  probes.push({
    label,
    query,
    nbHits: result.nbHits,
    hits,
  });
  writeFileSync(join(OUT, `b-${label}.json`), JSON.stringify({
    probe: 'article-audience Part B: app-path blog query',
    query,
    nbHits: result.nbHits,
    hits,
  }, null, 2));
  console.log(`\n=== ${label}: "${query}" (nbHits=${result.nbHits}) ===`);
  hits.forEach((h, i) => {
    console.log(`  ${i + 1}. ${h.objectID} | ${h.canonical_url} | heading_path=${JSON.stringify(h.heading_path)}`);
  });
}

writeFileSync(join(OUT, 'probe-summary.json'), JSON.stringify({
  probe: 'article-audience read-only blog probe 2026-10-13',
  appPathMirror: 'POST /1/indexes/*/queries, indexName=blog, BLOG_PROJECTION, no filters (blog/help branch has none)',
  inventory: { query: inventoryQuery, nbHits: inventory.nbHits, count: inventoryHits.length },
  queries: probes.map(({ label, query, nbHits }) => ({
    label,
    query,
    nbHits,
    rankedObjectIDs: probes.find((p) => p.label === label).hits.map((h) => h.objectID),
  })),
}, null, 2));
console.log(`\nReceipts written under ${OUT}`);
