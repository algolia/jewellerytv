/* apply-cut-to-dev.mjs: one PATCH that moves the Dev agent to the chips-native
 * cut — cut instructions + cut system prompt + tool sheet without
 * arrange_groups. The production agent is never touched here; promotion is
 * promote-agent.mjs's job. Safety: refuses unless the live Dev hashes equal
 * the --expect values, keeps a full Dev snapshot on disk, sends ONE PATCH,
 * and reads back to prove every field. Production writes need promote-agent.
 *   NODE_USE_SYSTEM_CA=1 node apply-cut-to-dev.mjs                      preflight, READ-ONLY
 *   NODE_USE_SYSTEM_CA=1 node apply-cut-to-dev.mjs --execute --expect=<instr8>:<sys8>:<tools8>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadSettings } from './settings.mjs';
const S = loadSettings();
const here = dirname(fileURLToPath(import.meta.url));
const arg = (n) => {
  const a = process.argv.find((x) => x.startsWith('--' + n + '='));
  return a ? a.split('=').slice(1).join('=') : null;
};
const execute = process.argv.includes('--execute');
const expect = arg('expect');
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

const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get();
const liveHash = hash3(live);
const liveTools = (live.tools ?? []).map((t) => t.name || t.type).join(',');

const instructions = readFileSync(resolve(here, '../../docs/workspace/prompt-review-2026-10-23/cut/instructions.md'), 'utf8');
const systemPrompt = readFileSync(resolve(here, '../../docs/workspace/prompt-review-2026-10-23/cut/systemprompt.md'), 'utf8');
const tools = normTools(live.tools).filter((t) => (t.name || t.type) !== 'arrange_groups');
const cutNames = tools.map((t) => t.name || t.type).join(',');
if ((live.tools ?? []).some((t) => t.type === 'algolia_search_index') === false) throw new Error('search tool missing from live sheet');
const target = { instructions, systemPrompt, tools };
const targetHash = hash3(target);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash3: liveHash, instr: live.instructions.length, tools: liveTools, updatedAt: live.updatedAt },
  target: { hash3: targetHash, instr: instructions.length, sys: systemPrompt.length, tools: cutNames },
  expectMatchesLive: !expect || liveHash === expect,
}, null, 1));

if (expect && liveHash !== expect) throw new Error(`Live hash ${liveHash} does not equal --expect ${expect}; refusing`);
if (!execute) process.exit(0);

mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(resolve(here, `snapshots/dev-${new Date().toISOString().slice(0, 10)}-precut-full.json`), JSON.stringify({ agentId: S.devAgentId, capturedAt: new Date().toISOString(), agent: live }, null, 1));

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
  hash3Now: hash3(after),
  instr: after.instructions.length,
  sys: after.systemPrompt.length,
  tools: (after.tools ?? []).map((t) => t.name || t.type).join(','),
  status: after.status,
}, null, 1));
if (hash3(after) !== targetHash) throw new Error('Readback proof FAILED');
