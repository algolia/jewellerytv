// Read-only verification of the help_content index: existence, record count,
// and attribute shape of one sample record. Makes no writes of any kind.
import { loadConfig } from '../server/config.js';

const INDEX = 'help_content';
const config = loadConfig();
const headers = {
  'X-Algolia-Application-Id': config.appId,
  'X-Algolia-API-Key': config.apiKey,
  'Content-Type': 'application/json',
};

const search = await fetch(
  `https://${config.appId}-dsn.algolia.net/1/indexes/${INDEX}/query`,
  {
    method: 'POST',
    headers,
    body: JSON.stringify({ params: 'query=&hitsPerPage=1' }),
  },
);
if (search.status === 404) {
  console.log(JSON.stringify({ exists: false, index: INDEX }));
  process.exit(0);
}
if (!search.ok) {
  console.log(JSON.stringify({ exists: 'error', status: search.status, body: await search.text() }));
  process.exit(1);
}
const data = await search.json();
const sample = data.hits[0] ?? null;
if (process.argv.includes('--shape')) {
  console.log(
    JSON.stringify(
      {
        facets: data.facets ?? null,
        contentLen: (sample?.content ?? '').length,
        contentHead: (sample?.content ?? '').slice(0, 300),
        headingPath: sample?.heading_path ?? null,
        scopeText: sample?.scope_text ?? null,
        sourceRole: sample?.source_role ?? null,
        url: sample?.canonical_url ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
console.log(
  JSON.stringify(
    {
      exists: true,
      index: INDEX,
      nbHits: data.nbHits,
      sampleObjectID: sample?.objectID ?? null,
      sampleAttributes: sample ? Object.keys(sample).sort() : [],
      sampleTitle: sample?.title ?? sample?.name ?? sample?.question ?? null,
    },
    null,
    2,
  ),
);
