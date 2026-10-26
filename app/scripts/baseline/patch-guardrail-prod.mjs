/* patch-guardrail-prod.mjs: remove the 'unsupported_assurance_or_contradiction'
 * output category from the PRODUCTION agent's guardrail (Arijit's go,
 * 2026-10-26, after the story run measured 6/9 watch-dad turns withheld and
 * the audit measured ~4x false kills). The four real safety categories stay:
 * instruction_override, unavailable_action_claim, confidential_output,
 * unapproved_sizing_procedure.
 *   NODE_USE_SYSTEM_CA=1 node patch-guardrail-prod.mjs             preflight
 *   NODE_USE_SYSTEM_CA=1 node patch-guardrail-prod.mjs --execute --expect=<guardrailSha8>
 * Safety: snapshots the full production agent first, refuses unless the live
 * guardrail hash equals --expect, sends ONE PATCH, reads back and proves the
 * category is gone and every other config field is untouched. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from './settings.mjs';
const S = loadSettings();
const here = dirname(fileURLToPath(import.meta.url));
const arg = (n) => {
  const a = process.argv.find((x) => x.startsWith('--' + n + '='));
  return a ? a.split('=').slice(1).join('=') : null;
};
const execute = process.argv.includes('--execute');
const expect = arg('expect');
const sha8 = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 8);
const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${S.productionAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const KILL = 'unsupported_assurance_or_contradiction';
const live = await get();
const guardrail = JSON.parse(JSON.stringify(live.config.guardrail));
const before = sha8(guardrail);
const target = JSON.parse(JSON.stringify(guardrail));
target.categories = target.categories.filter((c) => c.name !== KILL);
target.scope = target.scope.replace(/unsupported assurances,?\s*/i, '');
if (target.categories.length !== guardrail.categories.length - 1)
  throw new Error(`Refusing: category ${KILL} not found exactly once`);
console.log(JSON.stringify({ before, after: sha8(target), removed: KILL, remaining: target.categories.map((c) => c.name) }, null, 1));
if (!execute) {
  console.log('PREFLIGHT ONLY. Live guardrail hash:', before, expect ? `(expect ${expect}: ${before === expect ? 'MATCH' : 'MISMATCH'})` : '');
  process.exit(0);
}
if (expect !== before) throw new Error(`Refusing: live guardrail ${before} != --expect ${expect}; someone changed it; re-read and re-decide`);
mkdirSync(resolve(here, '../../evidence/baseline'), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const snapPath = resolve(here, `../../evidence/baseline/${stamp}-PRODUCTION-guardrail-snapshot.json`);
writeFileSync(snapPath, JSON.stringify({ kind: 'guardrail-snapshot', takenAt: new Date().toISOString(), agentId: S.productionAgentId, guardrail }, null, 1) + '\n');
console.log('snapshot written:', snapPath);
if (!S.editKey) throw new Error('Missing edit credential');
const r = await fetch(url, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({ config: { guardrail: target } }),
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0, 400)}`);
let after;
for (let i = 0; i < 8; i++) {
  after = await get();
  if (sha8(after.config.guardrail) === sha8(target)) break;
  await new Promise((w) => setTimeout(w, 700));
}
const otherConfigSame = JSON.stringify({ ...after.config, guardrail: null }) === JSON.stringify({ ...live.config, guardrail: null });
const receipt = {
  at: new Date().toISOString(),
  removed: KILL,
  guardrailNow: sha8(after.config.guardrail),
  categoryGone: !after.config.guardrail.categories.some((c) => c.name === KILL),
  remaining: after.config.guardrail.categories.map((c) => c.name),
  otherConfigUntouched: otherConfigSame,
  status: after.status,
  snapshot: snapPath,
};
writeFileSync(resolve(here, `../../evidence/baseline/${stamp}-PRODUCTION-guardrail-receipt.json`), JSON.stringify(receipt, null, 1) + '\n');
console.log(JSON.stringify(receipt, null, 1));
if (!receipt.categoryGone || !receipt.otherConfigUntouched) throw new Error('Guardrail patch proof FAILED');
