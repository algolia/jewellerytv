// Craig Task 07 provenance check, 2026-10-13 (read-only): when was the blog
// index last ingested, and how many records does it hold?
import { loadConfig } from '../server/config.js';
import { writeFileSync } from 'node:fs';

const config = loadConfig();
const headers = {
  'content-type': 'application/json',
  'x-algolia-application-id': config.appId,
  'x-algolia-api-key': config.apiKey,
};
const response = await fetch(
  `https://${config.appId}-dsn.algolia.net/1/indexes/blog/query`,
  {
    method: 'POST',
    headers,
    body: JSON.stringify({
      params:
        'query=&hitsPerPage=1&attributesToRetrieve=%5B%22fetched_at%22%2C%22run_id%22%2C%22schema_version%22%2C%22modified_at%22%2C%22published_at%22%2C%22category%22%5D',
    }),
  },
);
const data = await response.json();
const out = {
  nbHits: data.nbHits,
  sample: data.hits?.[0] ?? null,
  checkedAt: new Date().toISOString(),
};
console.log(JSON.stringify(out, null, 2));
writeFileSync('../.checkpoint/runs/article-audience-2026-10-13/probe/e-blog-provenance.json', JSON.stringify(out, null, 2));
