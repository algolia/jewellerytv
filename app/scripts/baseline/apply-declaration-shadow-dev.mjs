/* apply-declaration-shadow-dev.mjs: one PATCH that adds the Option B shadow
 * declaration to the DEV agent's present_products tool — an optional
 * `understood` input (material/gemstone/brand verbatim values) plus a
 * description telling the model how to declare. Nothing else changes: same
 * instructions, same system prompt, same other tools. The production agent
 * is never touched here; promotion after the shadow gate is promote-agent's
 * job. Safety: refuses unless the live Dev hash equals --expect, keeps a
 * full Dev snapshot on disk, sends ONE PATCH, and reads back to prove the
 * field.   NODE_USE_SYSTEM_CA=1 node apply-declaration-shadow-dev.mjs
 *                 preflight, READ-ONLY
 *   NODE_USE_SYSTEM_CA=1 node apply-declaration-shadow-dev.mjs --execute --expect=<hash3>
 */
import { writeFileSync, mkdirSync } from 'node:fs';
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

const NEW_DESCRIPTION =
  "Send 9-12 objectIDs best first, displayFacets (1-3), and understood: the material, gemstone and brand from the shopper's words, verbatim values, empty arrays when none or declined. Never invent.";
if (NEW_DESCRIPTION.length > 200)
  throw new Error(`Client-side tool descriptions cap at 200 characters; got ${NEW_DESCRIPTION.length}`);
const UNDERSTOOD_SCHEMA = {
  type: 'object',
  properties: {
    material: { type: 'array', items: { type: 'string' } },
    gemstone: { type: 'array', items: { type: 'string' } },
    brand: { type: 'array', items: { type: 'string' } },
    priceMax: {
      type: 'number',
      minimum: 0,
      description: 'Dollars the shopper will not go over, when they named a budget. Omit when they named none.',
    },
  },
  required: ['material', 'gemstone', 'brand'],
};

const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get();
const liveHash = hash3(live);
const livePresent = (live.tools ?? []).find((t) => t.name === 'present_products');
if (!livePresent) throw new Error('present_products missing from the live Dev tool sheet');

const priorPresent = { name: 'present_products', description: livePresent.description, inputSchema: livePresent.inputSchema };
const tools = normTools(live.tools).map((t) =>
  t.name === 'present_products'
    ? {
        ...t,
        description: NEW_DESCRIPTION,
        inputSchema: {
          ...t.inputSchema,
          properties: { ...t.inputSchema.properties, understood: UNDERSTOOD_SCHEMA },
        },
      }
    : t,
);
const target = { instructions: live.instructions, systemPrompt: live.systemPrompt, tools };
const targetHash = hash3(target);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash3: liveHash, updatedAt: live.updatedAt, description: livePresent.description },
  change: { descriptionLength: `${livePresent.description.length} -> ${NEW_DESCRIPTION.length}` },
  expectMatchesLive: !expect || liveHash === expect,
}, null, 1));

if (expect && liveHash !== expect) throw new Error(`Live hash ${liveHash} does not equal --expect ${expect}; refusing`);
if (!execute) process.exit(0);

mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(resolve(here, `snapshots/dev-${new Date().toISOString().slice(0, 10)}-pre-declaration-full.json`), JSON.stringify({ agentId: S.devAgentId, capturedAt: new Date().toISOString(), agent: live }, null, 1));
writeFileSync(resolve(here, '../../../docs/config/concierge-development/candidates/declaration-shadow-2026-10-26/rollback.json'), JSON.stringify({ agentId: S.devAgentId, prior: priorPresent, rollbackAt: new Date().toISOString() }, null, 1));

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
const afterPresent = (after.tools ?? []).find((t) => t.name === 'present_products');
console.log(JSON.stringify({
  applied: hash3(after) === targetHash,
  readback: {
    descriptionMatches: afterPresent?.description === NEW_DESCRIPTION,
    hasUnderstood: !!afterPresent?.inputSchema?.properties?.understood,
    understoodRequired: afterPresent?.inputSchema?.properties?.understood?.required,
    topLevelRequired: afterPresent?.inputSchema?.required,
  },
  updatedAt: after.updatedAt,
}, null, 1));
if (hash3(after) !== targetHash) throw new Error('Readback hash mismatch after PATCH');
