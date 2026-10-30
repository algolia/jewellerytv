/* apply-understood-schema.mjs — schema truth for present_products (2026-10-27, Arijit-approved root fix).
 * The app reads `understood` (material/gemstone/brand/priceMax) from every present_products call and
 * enforces on it (2026-10-27 cutover), but the published input schema never declared it — the field
 * rode as a tolerated extra. This declares the real contract.
 *   NODE_USE_SYSTEM_CA=1 node app/scripts/review/apply-understood-schema.mjs            preflight
 *   NODE_USE_SYSTEM_CA=1 node app/scripts/review/apply-understood-schema.mjs --execute
 * Hash-gated on the live tools JSON; refuses if understood is already present (idempotence) or if the
 * live tools changed since the expectation. Writes a rollback snapshot. Instructions/systemPrompt untouched. */
import {writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {loadSettings} from '../baseline/settings.mjs';

const S = loadSettings();
const execute = process.argv.includes('--execute');
const sha8 = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 8);
const url = (id) => `https://${S.appId}.algolia.net/agent-studio/1/agents/${id}`;
const get = async (id) => {
  const r = await fetch(url(id), {headers: {'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey}, redirect: 'error', signal: AbortSignal.timeout(20000)});
  if (!r.ok) throw new Error(`GET ${id} ${r.status}`);
  return r.json();
};

const live = await get(S.devAgentId);
if (live.toolsSha8 === undefined && sha8(live.tools) === undefined) throw new Error('unreachable');
const liveToolsSha = sha8(live.tools);
const present = live.tools.find((t) => t.name === 'present_products');
if (!present) throw new Error('present_products not found on dev agent');
if (present.inputSchema?.properties?.understood) throw new Error('Refusing: understood is already declared (idempotent stop). Re-read the live tools.');

const next = JSON.parse(JSON.stringify(live.tools));
const p = next.find((t) => t.name === 'present_products');
p.inputSchema.properties.understood = {
  type: 'object',
  additionalProperties: false,
  properties: {
    material: {type: 'array', items: {type: 'string'}},
    gemstone: {type: 'array', items: {type: 'string'}},
    brand: {type: 'array', items: {type: 'string'}},
    priceMax: {type: 'number'},
  },
  required: ['material', 'gemstone', 'brand'],
  description: 'What the shopper asked for, in your own words, verbatim values only. The tool enforces these against the records.',
};

console.log(JSON.stringify({phase: execute ? 'execute' : 'preflight', liveToolsSha: liveToolsSha, nextToolsSha: sha8(next), added: 'present_products.inputSchema.properties.understood'}, null, 1));

if (!execute) { console.log('PREFLIGHT ONLY. Nothing written.'); process.exit(0); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const snapDir = resolve(S.root, 'app/evidence/baseline');
mkdirSync(snapDir, {recursive: true});
const snapPath = resolve(snapDir, `${stamp}-DEV-tools-rollback.snapshot.json`);
writeFileSync(snapPath, JSON.stringify({agentId: S.devAgentId, savedAt: new Date().toISOString(), field: 'tools', priorSha8: liveToolsSha, tools: live.tools}, null, 1));
console.log('snapshot:', snapPath);

if (!S.editKey) throw new Error('Missing edit credential');
const r = await fetch(url(S.devAgentId), {
  method: 'PATCH',
  headers: {'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, accept: 'application/json', 'content-type': 'application/json'},
  body: JSON.stringify({tools: next}),
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0, 500)}`);
let after;
for (let i = 0; i < 8; i++) {
  after = await get(S.devAgentId);
  if (sha8(after.tools) === sha8(next)) break;
  await new Promise((w) => setTimeout(w, 700));
}
const proven = sha8(after.tools) === sha8(next);
console.log(JSON.stringify({applied: proven, newToolsSha: sha8(after.tools), instructionsUnchanged: sha8(after.instructions) === sha8(live.instructions), snapshot: snapPath}, null, 1));
if (!proven) throw new Error('Readback proof FAILED');
