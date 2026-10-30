/* apply-candidate-to-dev.mjs: write the reviewed candidate instructions to the DEV agent (8129ad66).
 * Hash-gated: refuses unless live dev instructions sha equals --expect (default: tonight's live pull b3f987ba),
 * so exactly what was reviewed ships. Saves a full dev snapshot first (rollback), sends ONE PATCH
 * (instructions only — systemPrompt and tools untouched), reads back and proves the field.
 *   NODE_USE_SYSTEM_CA=1 node app/scripts/review/apply-candidate-to-dev.mjs            preflight (read-only)
 *   NODE_USE_SYSTEM_CA=1 node app/scripts/review/apply-candidate-to-dev.mjs --execute
 * Production is NOT touched by this script. */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {loadSettings} from '../baseline/settings.mjs';

const S = loadSettings();
const arg = (n) => { const a = process.argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : null; };
const execute = process.argv.includes('--execute');
const sha8 = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 8);
const url = (id) => `https://${S.appId}.algolia.net/agent-studio/1/agents/${id}`;
const get = async (id) => {
  const r = await fetch(url(id), {headers: {'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey}, redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!r.ok) throw new Error(`GET ${id} ${r.status}`);
  return r.json();
};

const live = await get(S.devAgentId);
const candidate = readFileSync(resolve(S.root, 'docs/workspace/prompt-review-2026-10-26/candidate-instructions.md'), 'utf8');
const expect = arg('expect') ?? 'b3f987ba';
const liveSha = sha8(live.instructions);

console.log(JSON.stringify({
  phase: execute ? 'execute' : 'preflight',
  devAgent: S.devAgentId,
  liveInstructionsSha: liveSha,
  expectedSha: expect,
  liveChars: live.instructions.length,
  candidateChars: candidate.length,
  candidateSha: sha8(candidate),
  systemPromptSha: sha8(live.systemPrompt),
  tools: live.tools.map((t) => t.name),
}, null, 1));

if (liveSha !== expect) throw new Error(`Refusing: live dev instructions ${liveSha} != expected ${expect}. Someone changed the dev agent; re-read and re-decide.`);
if (candidate.length < 10000) throw new Error('Refusing: candidate looks truncated.');
if (!execute) { console.log('\nPREFLIGHT ONLY. Nothing written.'); process.exit(0); }

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const snapDir = resolve(S.root, 'app/evidence/baseline');
mkdirSync(snapDir, {recursive: true});
const snapPath = resolve(snapDir, `${stamp}-DEV-instructions-rollback.snapshot.json`);
writeFileSync(snapPath, JSON.stringify({agentId: S.devAgentId, savedAt: new Date().toISOString(), field: 'instructions', priorSha8: liveSha, instructions: live.instructions}, null, 1));
console.log('snapshot:', snapPath);

if (!S.editKey) throw new Error('Missing edit credential');
const r = await fetch(url(S.devAgentId), {
  method: 'PATCH',
  headers: {'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, accept: 'application/json', 'content-type': 'application/json'},
  body: JSON.stringify({instructions: candidate}),
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0, 500)}`);

let after;
for (let i = 0; i < 8; i++) {
  after = await get(S.devAgentId);
  if (sha8(after.instructions) === sha8(candidate)) break;
  await new Promise((w) => setTimeout(w, 700));
}
const proven = sha8(after.instructions) === sha8(candidate);
console.log(JSON.stringify({applied: proven, newSha: sha8(after.instructions), systemPromptUnchanged: sha8(after.systemPrompt) === sha8(live.systemPrompt), toolsUnchanged: JSON.stringify(after.tools) === JSON.stringify(live.tools), snapshot: snapPath}, null, 1));
if (!proven) throw new Error('Readback proof FAILED');
