/* apply-guardrail-carry-prod.mjs: carry the DEV agent's complete V10
 * guardrail to the production agent. Measured drift (2026-10-27): prod runs
 * four pre-V10 categories and withheld a help-grounded men's chain-length
 * answer; dev carries the five-category V10 package whose education-aware
 * rule passed every probe on 2026-10-22. The October 22 production carry
 * was evidently overwritten by a later save — this restores it.
 * Snapshot, preflight hash, ONE PATCH, readback. Source: DEV live readback.
 *   NODE_USE_SYSTEM_CA=1 node apply-guardrail-carry-prod.mjs               preflight
 *   NODE_USE_SYSTEM_CA=1 node apply-guardrail-carry-prod.mjs --execute --expect=<hash4>
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
const hash4 = (a) => [s8(a.instructions), s8(a.systemPrompt), s8(normTools(a.tools)), s8(a.config)].join(':');

const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/0bdf59fe-e598-4db7-b139-2b93d5255bb4`;
const devUrl = `https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`;
const get = async (u) => {
  const r = await fetch(u, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get(url);
const dev = await get(devUrl);
const liveHash = hash4(live);
const liveGuardrail = live.config?.guardrail ?? {};
const devGuardrail = dev.config?.guardrail ?? {};
if (!(devGuardrail.categories ?? []).some((c) => (c.description ?? '').includes('never flag education merely because'))) {
  throw new Error('DEV guardrail does not carry the V10 education-aware rule; refusing to carry a regressed state');
}

const target = {
  ...live,
  config: { ...live.config, guardrail: JSON.parse(JSON.stringify(devGuardrail)) },
};
const targetHash = hash4(target);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash4: liveHash, categories: (liveGuardrail.categories ?? []).map((c) => (c.description ?? '').length), updatedAt: live.updatedAt },
  source: { categories: (devGuardrail.categories ?? []).map((c) => (c.description ?? '').length) },
  expectMatchesLive: !expect || liveHash === expect,
}, null, 1));
if (expect && liveHash !== expect) throw new Error(`Live hash ${liveHash} != --expect ${expect}; refusing`);
if (!execute) process.exit(0);

mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(resolve(here, `snapshots/prod-${new Date().toISOString().slice(0, 10)}-pre-guardrail-carry-full.json`), JSON.stringify({ agentId: '0bdf59fe-e598-4db7-b139-2b93d5255bb4', capturedAt: new Date().toISOString(), agent: live }, null, 1));

if (!S.editKey) throw new Error('Missing edit credential');
const r = await fetch(url, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({
    instructions: target.instructions,
    systemPrompt: target.systemPrompt,
    tools: normTools(target.tools).map((t) => (t.type === 'algolia_search_index' ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'description')) : t)),
    config: target.config,
  }),
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0, 400)}`);
let after;
for (let i = 0; i < 8; i++) {
  after = await get(url);
  if (hash4(after) === targetHash) break;
  await new Promise((w) => setTimeout(w, 700));
}
const afterCats = (after.config?.guardrail?.categories ?? []).map((c) => (c.description ?? '').length);
console.log(JSON.stringify({
  applied: hash4(after) === targetHash,
  readback: { categories: afterCats, educationRulePresent: (after.config?.guardrail?.categories ?? []).some((c) => (c.description ?? '').includes('never flag education merely because')) },
  updatedAt: after.updatedAt,
}, null, 1));
if (hash4(after) !== targetHash) throw new Error('Readback hash mismatch after PATCH');
