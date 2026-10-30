/* apply-drift-reconcile.mjs: resolve the instruction collision the drift
 * guard caught (2026-10-30). The prompt-review lane added "never call
 * anything top-selling, popular or trending" from a stale base, silently
 * dropping the merchandised-trending rule Arijit approved. The merge keeps
 * the lane's intent (no invented popularity claims) and restores the
 * verified mechanism (name the site's own merchandised trends).
 * Snapshot, preflight hash, ONE PATCH, readback. Runs on BOTH agents.
 *   NODE_USE_SYSTEM_CA=1 node apply-drift-reconcile.mjs                preflight
 *   NODE_USE_SYSTEM_CA=1 node apply-drift-reconcile.mjs --execute --expect=<hash3>
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

const FIND = "Search order is not popularity: never call anything top-selling, popular or trending.";
const REPLACE = "Search order is not popularity: never claim sales figures, best-seller data or view counts. What is trending on our site is merchandised, not measured: the site currently features the collections Bangles, Beaded, Bow, Cocktail Rings, Color of the Year, Initial, Layered Necklaces, Modern Clover, Novelty, Stackable Earrings and Team Shop, and the gemstones Amethyst, Chrome Diopside, Morganite, Ruby, Sapphire, Spinel, Strontium Titanate, Tanzanite, Topaz, Turquoise and Black. When the shopper asks what is trending or popular, name two or three of these from the site's own merchandising and offer to show pieces from one.";

const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${process.env.JTV_TARGET_AGENT_ID ?? S.devAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get();
if (!live.instructions.includes(FIND)) throw new Error('Collision sentence not found; the lane may have edited again — re-read before writing');
const target = { instructions: live.instructions.replace(FIND, REPLACE), systemPrompt: live.systemPrompt, tools: live.tools };
const targetHash = hash3(target);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash3: hash3(live), updatedAt: live.updatedAt },
  expectMatchesLive: !expect || hash3(live) === expect,
}, null, 1));
if (expect && hash3(live) !== expect) throw new Error(`Live hash ${hash3(live)} != --expect ${expect}; refusing`);
if (!execute) process.exit(0);

mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(resolve(here, `snapshots/reconcile-${new Date().toISOString().slice(0, 10)}-${process.env.JTV_TARGET_AGENT_ID?.slice(0, 8) ?? 'dev'}-pre.json`), JSON.stringify({ agentId: process.env.JTV_TARGET_AGENT_ID ?? S.devAgentId, capturedAt: new Date().toISOString(), instructions: live.instructions }, null, 1));

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
console.log(JSON.stringify({
  applied: hash3(after) === targetHash,
  readback: { merged: after.instructions.includes(REPLACE.slice(0, 80)), collisionGone: !after.instructions.includes(FIND) },
  updatedAt: after.updatedAt,
}, null, 1));
if (hash3(after) !== targetHash) throw new Error('Readback hash mismatch after PATCH');
