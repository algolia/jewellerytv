/* apply-narration-bar-dev.mjs: one PATCH that adds the narration bar to the
 * DEV agent's instructions — a worked example closing the exact trap Arijit
 * caught live (2026-10-27): the model explaining "the display tool is telling
 * me these don't read as pearl" after an empty first shelf. The rule slots
 * directly under the existing system-internals Don't, same block, one rule
 * one place. Snapshot, preflight hash, ONE PATCH, readback.
 *   NODE_USE_SYSTEM_CA=1 node apply-narration-bar-dev.mjs                     preflight
 *   NODE_USE_SYSTEM_CA=1 node apply-narration-bar-dev.mjs --execute --expect=<instr8>:<sys8>:<tools8>
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
const hash3 = (a) => [s8(a.instructions), s8(a.systemPrompt), s8(normTools(a.tools))].join(':');
const patchBody = (src) => ({
  instructions: src.instructions,
  systemPrompt: src.systemPrompt,
  tools: normTools(src.tools).map((t) => (t.type === 'algolia_search_index' ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'description')) : t)),
});

const ANCHOR = "Don't: tell the shopper about system internals: retries, what the system accepts, evidence, verification, how the display is built, where the narrowing options came from.";
const ADDITION = "- Don't: explain a tool's verdict or an empty first attempt (\"The display tool is telling me these pieces don't read as pearl by its material-name check\"). When a first shelf comes back empty or thin, search again with different facet values and show what you found; the shopper hears about what we hold, never about how the checking works.";

const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${process.env.JTV_TARGET_AGENT_ID ?? S.devAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get();
if (!live.instructions.includes(ANCHOR)) throw new Error('Anchor line not found in live instructions; prompt drifted — re-read the whole prompt before editing');
if (live.instructions.includes("don't read as pearl")) throw new Error('Narration bar already present; nothing to do');
const nextInstructions = live.instructions.replace(ANCHOR, `${ANCHOR}\n${ADDITION}`);
const target = { instructions: nextInstructions, systemPrompt: live.systemPrompt, tools: live.tools };
const targetHash = hash3(target);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash3: hash3(live), updatedAt: live.updatedAt },
  addition: ADDITION,
  expectMatchesLive: !expect || hash3(live) === expect,
}, null, 1));
if (expect && hash3(live) !== expect) throw new Error(`Live hash ${hash3(live)} != --expect ${expect}; refusing`);

if (!execute) process.exit(0);
mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(resolve(here, `snapshots/dev-${new Date().toISOString().slice(0, 10)}-pre-narration-bar-full.json`), JSON.stringify({ agentId: S.devAgentId, capturedAt: new Date().toISOString(), agent: live }, null, 1));

if (!S.editKey) throw new Error('Missing edit credential');
const r = await fetch(url, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify(patchBody(target)),
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
  readback: { containsBar: after.instructions.includes("don't read as pearl"), instructionsLength: after.instructions.length },
  updatedAt: after.updatedAt,
}, null, 1));
if (hash3(after) !== targetHash) throw new Error('Readback hash mismatch after PATCH');
