/* apply-fix4-voice-dev.mjs: one PATCH that moves the Dev agent to the fix-4
 * voice draft (docs/workspace/agent-lane-fix4-2026-11-04/DRAFT-instructions.md).
 * Instructions only: the systemPrompt and the tool sheet are untouched, so
 * the turn pipeline, tools and config stay exactly as the other lanes left
 * them. Safety: refuses unless the live Dev instructions still hash to the
 * --expect value captured at preflight (one writer, coordination law), keeps
 * a full Dev snapshot on disk, sends ONE PATCH touching only `instructions`,
 * and reads back to prove the bytes. Production writes need promote-agent.
 *   NODE_USE_SYSTEM_CA=1 node apply-fix4-voice-dev.mjs                     preflight, READ-ONLY
 *   NODE_USE_SYSTEM_CA=1 node apply-fix4-voice-dev.mjs --execute --expect=<instr8>
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
const sha = (v) => createHash('sha256').update(v).digest('hex');
const s8 = (v) => sha(v).slice(0, 8);

const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get();
const instructions = readFileSync(
  resolve(here, '../../docs/workspace/agent-lane-fix4-2026-11-04/DRAFT-instructions.md'),
  'utf8',
).replace(/\n$/, '');
if (instructions.includes('<<<<<<<') || instructions.includes('DRAFT FOR ARIJIT')) {
  throw new Error('Draft file carries a header or conflict markers; ship the body only');
}

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: {
    instr8: s8(live.instructions),
    instrLen: live.instructions.length,
    sys8: s8(live.systemPrompt),
    updatedAt: live.updatedAt,
    lastUsedAt: live.lastUsedAt,
  },
  target: { instr8: s8(instructions), instrLen: instructions.length },
  expectMatchesLive: !expect || s8(live.instructions) === expect,
}, null, 1));

if (expect && s8(live.instructions) !== expect) {
  throw new Error(`Live instructions ${s8(live.instructions)} do not equal --expect ${expect}; refusing (another lane wrote since preflight)`);
}
if (!execute) process.exit(0);

mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(
  resolve(here, `snapshots/dev-${new Date().toISOString().slice(0, 10)}-prefix4-full.json`),
  JSON.stringify({ agentId: S.devAgentId, capturedAt: new Date().toISOString(), agent: live }, null, 1),
);

if (!S.editKey) throw new Error('Missing edit credential');
const r = await fetch(url, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ instructions }),
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0, 400)}`);
let after;
for (let i = 0; i < 8; i++) {
  after = await get();
  if (after.instructions === instructions) break;
  await new Promise((w) => setTimeout(w, 700));
}
console.log(JSON.stringify({
  applied: after.instructions === instructions,
  instr8Now: s8(after.instructions),
  instrLen: after.instructions.length,
  sysUnchanged: after.systemPrompt === live.systemPrompt,
  toolsUnchanged: JSON.stringify(after.tools) === JSON.stringify(live.tools),
  updatedAt: after.updatedAt,
}, null, 1));
if (after.instructions !== instructions) throw new Error('Readback proof FAILED');
