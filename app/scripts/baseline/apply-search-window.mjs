/* apply-search-window.mjs: set the developer-level hitsPerPage on the
 * prod_catalog search tool. Measured trigger (2026-10-30): with no developer
 * window the model requested 30 results per query; full-record payloads
 * flooded the conversation context (3.27M tokens for a 3-message session)
 * and turned brand searches into slow, narrated recoveries. 12 results give
 * the curation tool its candidate pool without the flood.
 * Applies to BOTH agents (dev target via JTV_TARGET_AGENT_ID).
 *   NODE_USE_SYSTEM_CA=1 node apply-search-window.mjs                preflight
 *   NODE_USE_SYSTEM_CA=1 node apply-search-window.mjs --execute --expect=<hash3>
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadSettings } from './settings.mjs';
const S = loadSettings();
const here = dirname(fileURLToPath(import.meta.url));
const execute = process.argv.includes('--execute');
const expect = process.argv.find((x) => x.startsWith('--expect='))?.split('=')[1];
const s8 = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 8);
const hash3 = (a) => [s8(a.instructions), s8(a.systemPrompt), s8(a.tools ?? [])].join(':');

const WINDOW = 12;
const FILTERS = 'Inventory_InStock:true AND NOT Catalog_PreviouslyOwned:true';
const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${process.env.JTV_TARGET_AGENT_ID ?? S.devAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get();
const liveHash = hash3(live);
const searchTool = (live.tools ?? []).find((t) => t.type === 'algolia_search_index');
if (!searchTool) throw new Error('search tool missing');
const catalog = (searchTool.indices ?? []).find((ix) => ix.index === 'prod_catalog');
if (!catalog) throw new Error('prod_catalog index config missing');
if (catalog.searchParameters?.hitsPerPage != null && catalog.searchParameters.hitsPerPage !== WINDOW) {
  console.log(JSON.stringify({ note: `existing developer window ${catalog.searchParameters.hitsPerPage}; replacing with ${WINDOW}` }));
}

const target = {
  ...live,
  tools: (live.tools ?? []).map((t) =>
    t.type === 'algolia_search_index'
      ? { ...t, indices: (t.indices ?? []).map((ix) => ix.index === 'prod_catalog' ? { ...ix, searchParameters: { ...ix.searchParameters, hitsPerPage: WINDOW, filters: FILTERS } } : ix) }
      : t),
};
const targetHash = hash3(target);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash3: liveHash, updatedAt: live.updatedAt },
  change: { hitsPerPage: catalog.searchParameters?.hitsPerPage ?? null, to: WINDOW, filters: catalog.searchParameters?.filters ?? null },
  expectMatchesLive: !expect || liveHash === expect,
}, null, 1));
if (expect && liveHash !== expect) throw new Error(`Live hash ${liveHash} != --expect ${expect}; refusing`);
if (!execute) process.exit(0);

mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(resolve(here, `snapshots/agent-${new Date().toISOString().slice(0, 10)}-${process.env.JTV_TARGET_AGENT_ID?.slice(0, 8) ?? 'dev'}-pre-search-window.json`), JSON.stringify({ agentId: process.env.JTV_TARGET_AGENT_ID ?? S.devAgentId, capturedAt: new Date().toISOString(), tools: live.tools }, null, 1));

if (!S.editKey) throw new Error('Missing edit credential');
const r = await fetch(url, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ instructions: target.instructions, systemPrompt: target.systemPrompt, tools: target.tools }),
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0, 400)}`);
let after;
for (let i = 0; i < 8; i++) {
  after = await get();
  if (hash3(after) === targetHash) break;
  await new Promise((w) => setTimeout(w, 700));
}
const afterTool = (after.tools ?? []).find((t) => t.type === 'algolia_search_index');
const afterCat = (afterTool?.indices ?? []).find((ix) => ix.index === 'prod_catalog');
console.log(JSON.stringify({
  applied: hash3(after) === targetHash,
  readback: { hitsPerPage: afterCat?.searchParameters?.hitsPerPage ?? null, filters: afterCat?.searchParameters?.filters ?? null },
  updatedAt: after.updatedAt,
}, null, 1));
if (hash3(after) !== targetHash) throw new Error('Readback hash mismatch after PATCH');
