/* apply-facet-compute-dev.mjs: one PATCH that sets searchParameters.facets = ["*"]
 * on the dev agent's prod_catalog search tool entry. The platform's search
 * stopped returning facet counts (measured 2026-10-30: model-side AND client-side
 * tool outputs carry only hits, nbHits, queryID), which kills the narrowing
 * chips and blinds the model's curation. Forcing facets re-computes them on
 * every search regardless of the model's call shape. Agent-level tool config
 * only; the customer index is untouched.
 *   NODE_USE_SYSTEM_CA=1 node scripts/baseline/apply-facet-compute-dev.mjs                    preflight
 *   NODE_USE_SYSTEM_CA=1 node scripts/baseline/apply-facet-compute-dev.mjs --execute --expect=<instr8>:<sys8>:<tools8>
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadSettings } from './settings.mjs';

const S = loadSettings();
const here = dirname(fileURLToPath(import.meta.url));
const execute = process.argv.includes('--execute');
const expect = process.argv.find((x) => x.startsWith('--expect='))?.split('=')[1];
const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const s8 = (v) => sha(v).slice(0, 8);
const stripNulls = (v) =>
  Array.isArray(v) ? v.map(stripNulls) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]))
    : v;
const normTools = (tools) =>
  stripNulls((tools ?? []).map((t) => ({
    ...t,
    description: t.type === 'algolia_search_index' ? undefined : t.description,
    indices: (t.indices ?? []).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'enhancedDescription'))),
  })));
const hash3 = (a) => [s8(a.instructions), s8(a.systemPrompt), s8(normTools(a.tools))].join(':');

const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get();
const idx = (t) => (t ?? []).find((x) => x.type === 'algolia_search_index')?.indices?.find((i) => i.index === 'prod_catalog');
const entry = idx(live.tools);
if (!entry) throw new Error('prod_catalog index entry not found on dev search tool');
if (Array.isArray(entry.searchParameters?.facets) && entry.searchParameters.facets.includes('*')) {
  console.log(JSON.stringify({ phase: 'already-applied', updatedAt: live.updatedAt })); process.exit(0);
}
const next = structuredClone(live);
idx(next.tools).searchParameters = { ...entry.searchParameters, facets: ['*'] };
const targetHash = hash3(next);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash3: hash3(live), updatedAt: live.updatedAt, facetsNow: entry.searchParameters?.facets ?? null },
  target: { hash3: targetHash, facetsNext: ['*'] },
}, null, 2));
if (!execute) { console.log('preflight only; rerun with --execute --expect=' + hash3(live)); process.exit(0); }
if (hash3(live) !== expect) throw new Error(`Live hash ${hash3(live)} != expected ${expect}; agent changed since preflight`);

const r = await fetch(url, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, 'content-type': 'application/json' },
  body: JSON.stringify({ instructions: next.instructions, systemPrompt: next.systemPrompt, tools: next.tools }),
});
if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 400)}`);

const after = await get();
const receipt = {
  appliedAt: new Date().toISOString(),
  agent: S.devAgentId,
  change: 'searchParameters.facets = ["*"] on prod_catalog entry',
  liveBefore: hash3(live),
  liveAfter: hash3(after),
  targetMatch: hash3(after) === targetHash,
  updatedAt: after.updatedAt,
};
writeFileSync(resolve(here, 'snapshots/2026-10-30-facet-compute-dev-receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
if (!receipt.targetMatch) throw new Error('Readback hash != target');
