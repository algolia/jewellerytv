// Read-only verification of the help_content index: existence, record count,
// and attribute shape of one sample record. Makes no writes of any kind.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Configuration comes from the same place the rest of the app reads it: the
 * process environment first, then the gitignored env file beside package.json.
 * There is no application server to ask any more, so this script reads the
 * two values it needs directly (mirrors scripts/baseline/settings.mjs). */
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function loadConfig() {
  const fileValues = {
    ...readEnvFile(resolve(appRoot, '.env')),
    ...readEnvFile(resolve(appRoot, '.env.local')),
  };
  const value = (name) => process.env[name] ?? fileValues[name];
  const appId = value('ALGOLIA_APP_ID');
  const apiKey = value('ALGOLIA_SEARCH_API_KEY');
  const missing = [appId ? '' : 'ALGOLIA_APP_ID', apiKey ? '' : 'ALGOLIA_SEARCH_API_KEY'].filter(
    Boolean,
  );
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(' and ')}. Set them in the environment or in app/.env.`,
    );
  }
  return { appId, apiKey };
}

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
