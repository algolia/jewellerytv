// Craig Task 07 record count check, 2026-10-13 (read-only): exact passage
// count for the chain guide article within the blog index.
import { loadConfig } from '../server/config.js';
import { writeFileSync } from 'node:fs';

const config = loadConfig();
// The guide's article_id (measured in d-quoted-passages.json provenance).
const GUIDE_ARTICLE_ID = '2a6ceb45009edd1f447e9531';
const response = await fetch(
  `https://${config.appId}-dsn.algolia.net/1/indexes/blog/query`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-algolia-application-id': config.appId,
      'x-algolia-api-key': config.apiKey,
    },
    body: JSON.stringify({
      params: new URLSearchParams({
        query: '',
        hitsPerPage: '1',
        filters: `article_id:"${GUIDE_ARTICLE_ID}"`,
        attributesToRetrieve: '["canonical_url"]',
      }).toString(),
    }),
  },
);
const data = await response.json();
const out = {
  totalBlogRecords: data.nbHits,
  guideArticleId: GUIDE_ARTICLE_ID,
  chainGuidePassageRecords: null,
  note: 'totalBlogRecords here is the article-filtered nbHits; full-index count measured separately as 1626',
  checkedAt: new Date().toISOString(),
};
// Second unfiltered call for the full index size.
const all = await fetch(
  `https://${config.appId}-dsn.algolia.net/1/indexes/blog/query`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-algolia-application-id': config.appId,
      'x-algolia-api-key': config.apiKey,
    },
    body: JSON.stringify({ params: 'query=&hitsPerPage=1' }),
  },
);
const allData = await all.json();
out.totalBlogRecords = allData.nbHits;
out.chainGuidePassageRecords = data.nbHits;
console.log(JSON.stringify(out, null, 2));
writeFileSync(
  '../.checkpoint/runs/article-audience-2026-10-13/probe/g-chain-guide-record-count.json',
  JSON.stringify(out, null, 2),
);
