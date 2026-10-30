/* apply-prod-to-dev.mjs: restore the DEV agent from the production agent's
 * verified state (tools, instructions, systemPrompt, config). Measured
 * trigger (2026-10-30): a parallel lane's save rebuilt the dev agent from a
 * much older snapshot — retired tool sheet (algolia_grouped_results, no
 * present_products), mixed-era instructions. Prod had just been reconciled
 * to the full correct state (all drift-guard markers present), so dev:=prod
 * is the clean restore. The two agents are clones by design ("Dev/Live
 * identical, ids settings only").
 * Snapshot, preflight hash, ONE PATCH, readback.
 *   NODE_USE_SYSTEM_CA=1 node apply-prod-to-dev.mjs                preflight
 *   NODE_USE_SYSTEM_CA=1 node apply-prod-to-dev.mjs --execute --expect=<hash3>
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
const hash3 = (a) => [s8(a.instructions), s8(a.systemPrompt), s8(a.tools ?? [])].join(':');

const prodUrl = `https://${S.appId}.algolia.net/agent-studio/1/agents/0bdf59fe-e598-4db7-b139-2b93d5255bb4`;
const devUrl = `https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`;
const get = async (u) => {
  const r = await fetch(u, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const prod = await get(prodUrl);
const dev = await get(devUrl);
const prodHash = hash3(prod);
const target = { instructions: prod.instructions, systemPrompt: prod.systemPrompt, tools: prod.tools, config: prod.config };
const targetHash = hash3(target);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  prod: { hash3: prodHash, tools: (prod.tools ?? []).map((t) => t.name || t.type), updatedAt: prod.updatedAt },
  dev: { hash3: hash3(dev), tools: (dev.tools ?? []).map((t) => t.name || t.type), updatedAt: dev.updatedAt },
  expectMatchesProd: !expect || prodHash === expect,
}, null, 1));
if (expect && prodHash !== expect) throw new Error(`Prod hash ${prodHash} != --expect ${expect}; refusing (prod changed since preflight)`);

if (!execute) process.exit(0);
mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(resolve(here, `snapshots/dev-${new Date().toISOString().slice(0, 10)}-pre-restore-from-prod-full.json`), JSON.stringify({ agentId: S.devAgentId, capturedAt: new Date().toISOString(), agent: dev }, null, 1));

if (!S.editKey) throw new Error('Missing edit credential');
const r = await fetch(devUrl, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ instructions: target.instructions, systemPrompt: target.systemPrompt, tools: target.tools, config: target.config }),
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0, 400)}`);
let after;
for (let i = 0; i < 8; i++) {
  after = await get(devUrl);
  if (hash3(after) === targetHash) break;
  await new Promise((w) => setTimeout(w, 700));
}
console.log(JSON.stringify({
  applied: hash3(after) === targetHash,
  readback: { tools: (after.tools ?? []).map((t) => t.name || t.type), instructionsChars: after.instructions.length },
  updatedAt: after.updatedAt,
}, null, 1));
if (hash3(after) !== targetHash) throw new Error('Readback hash mismatch after PATCH');
