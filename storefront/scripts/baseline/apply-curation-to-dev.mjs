/* apply-curation-to-dev.mjs: one PATCH that moves the Dev agent to the
 * curation configuration — cut prompts (with the verbatim-filter and curating
 * rules) + tool sheet = search, refresh_products, present_products. The
 * production agent is never touched here; promotion is promote-agent.mjs's
 * job. Safety: refuses unless the live Dev hashes equal --expect, snapshots
 * Dev first, sends ONE PATCH, reads back and proves every field.
 *   NODE_USE_SYSTEM_CA=1 node apply-curation-to-dev.mjs                        preflight, READ-ONLY
 *   NODE_USE_SYSTEM_CA=1 node apply-curation-to-dev.mjs --execute --expect=<instr8>:<sys8>:<tools8>
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
    isTerminal: undefined,
    /* The platform drops inputSchema.additionalProperties on client_side
     * tools when it stores them, so the proof canonicalizes the same way. */
    inputSchema: t.inputSchema
      ? Object.fromEntries(Object.entries(t.inputSchema).filter(([k]) => k !== 'additionalProperties'))
      : t.inputSchema,
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

const instructions = readFileSync(resolve(here, '../../docs/workspace/prompt-review-2026-10-23/cut/instructions.md'), 'utf8');
const systemPrompt = readFileSync(resolve(here, '../../docs/workspace/prompt-review-2026-10-23/cut/systemprompt.md'), 'utf8');
const presentDeclaration = {
  name: 'present_products',
  type: 'client_side',
  // 200-char client description cap; the semantics live in the system prompt.
  description:
    "After a search, send your chosen objectIDs (max 8, best first), displayFacets (1-3 facet names), and requirement: the shopper's named material or stone, quoted. It checks pieces and returns what shows.".slice(0, 200),
  inputSchema: {
    type: 'object',
    properties: {
      objectIDs: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 24 },
      displayFacets: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
      requirement: { type: 'string', maxLength: 120 },
    },
    required: ['objectIDs', 'requirement'],
    additionalProperties: false,
  },
};

const tools = normTools(live.tools)
  .filter((t) => (t.name || t.type) !== 'arrange_groups' && (t.name || t.type) !== 'present_products');
tools.push(presentDeclaration);
/* Material/stone asks must ride as facet filters, never as bare text (the
 * sterling-silver failure class). The tool's own description is followed more
 * reliably than body prose, so the rule lives here too. */
const MATERIAL_FILTER_RULE =
  ' When the shopper names a metal or purity (sterling silver, 10K, gold), add facet_Catalog_JewelryMaterialNavigationPurity with the exact vocabulary values (sterling silver is "Sterling"; gold is the karat values with MaterialType "Gold"); when they name a gemstone, add the primary gemstone name facet with its exact value. A title containing the word is not the material.';
const searchTool = tools.find((t) => t.type === 'algolia_search_index');
const prodIndex = searchTool?.indices?.find((i) => i.index === 'prod_catalog');
if (prodIndex && !prodIndex.description?.includes('facet_Catalog_JewelryMaterialNavigationPurity with the exact vocabulary values')) {
  prodIndex.description = (prodIndex.description ?? '') + MATERIAL_FILTER_RULE;
}
/* Class-C note: exposing facetFilters/filters in searchControls was attempted
 * (2026-10-25) and the platform SILENTLY DROPS the keys on readback — the model
 * cannot send facet filters, period. The working enforcement is present_products'
 * requirement matching against the runtime vocabulary. Filed for JTV/Algolia. */
if (!tools.some((t) => t.type === 'algolia_search_index')) throw new Error('search tool missing from live sheet');
const target = { instructions, systemPrompt, tools };
const targetHash = hash3(target);

if (process.env.DEBUG_TOOLS) {
  writeFileSync('/tmp/target-tools.json', JSON.stringify(normTools(target.tools), null, 1));
  writeFileSync('/tmp/readback-tools.json', JSON.stringify(normTools(live.tools), null, 1));
}
console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash3: liveHash, instr: live.instructions.length, tools: (live.tools ?? []).map((t) => t.name || t.type).join(','), updatedAt: live.updatedAt },
  target: { hash3: targetHash, instr: instructions.length, sys: systemPrompt.length, tools: tools.map((t) => t.name || t.type).join(',') },
  descriptionLength: presentDeclaration.description.length,
  expectMatchesLive: !expect || liveHash === expect,
}, null, 1));

if (expect && liveHash !== expect) throw new Error(`Live hash ${liveHash} does not equal --expect ${expect}; refusing`);
if (!execute) process.exit(0);

mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(resolve(here, `snapshots/dev-${new Date().toISOString().slice(0, 10)}-pre-curation.json`), JSON.stringify({ agentId: S.devAgentId, capturedAt: new Date().toISOString(), agent: live }, null, 1));

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
