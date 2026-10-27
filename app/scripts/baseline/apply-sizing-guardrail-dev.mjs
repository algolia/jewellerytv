/* apply-sizing-guardrail-dev.mjs: one PATCH that sharpens the guardrail's
 * sizing category on the target agent. Measured withholding (2026-10-27):
 * a men's chain-length answer drawn from a retrieved Help article was
 * withheld ("Unverified sizing instructions were withheld") because the
 * classifier had no pass case for help-grounded lengths. The sharpened rule
 * allows sizes, lengths and fit facts quoted from retrieved Help articles or
 * product records; invented procedures, age-based deductions and fit
 * guarantees stay blocked. Snapshot, preflight hash, ONE PATCH, readback.
 *   NODE_USE_SYSTEM_CA=1 node apply-sizing-guardrail-dev.mjs                preflight
 *   NODE_USE_SYSTEM_CA=1 node apply-sizing-guardrail-dev.mjs --execute --expect=<hash4>
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
const hash4 = (a) => [s8(a.instructions), s8(a.systemPrompt), s8(normTools(a.tools)), s8(a.config)].join(':');

const NEW_SIZING_DESCRIPTION = "Block step-by-step home measurement procedures, size-conversion formulas, or ring-size guesses when no approved sizing guidance from a retrieved Help article or catalogue record supports them. Block guessing a person's size or guaranteeing fit. Sizes, lengths and fit facts quoted from retrieved Help articles or product records are grounded and pass; block only invented procedures, age-based deductions or fit guarantees.";
const NEW_SIZING_EXAMPLES = "Flag: inventing string-measuring steps or choosing a ring size from age. Pass: do you already know the size; this record lists a 7-inch bracelet; the size still needs checking. Pass: quoting men's chain lengths from a retrieved style guide.";
if (NEW_SIZING_DESCRIPTION.length > 1024) throw new Error('guardrail description exceeds the 1024-character platform cap');

const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${process.env.JTV_TARGET_AGENT_ID ?? S.devAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get();
const liveHash = hash4(live);
const liveCategories = live.config?.guardrail?.categories ?? [];
if (!liveCategories[1]) throw new Error('guardrail sizing category missing');
if (liveCategories[1].description?.includes('retrieved style guide')) throw new Error('Sizing guardrail already sharpened; nothing to do');

const target = {
  ...live,
  config: {
    ...live.config,
    guardrail: {
      ...live.config.guardrail,
      categories: liveCategories.map((c, i) =>
        i === 1 ? { ...c, description: NEW_SIZING_DESCRIPTION, examples: NEW_SIZING_EXAMPLES } : c),
    },
  },
};
const targetHash = hash4(target);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash4: liveHash, updatedAt: live.updatedAt, sizingDescription: liveCategories[1].description },
  change: { descriptionLength: `${liveCategories[1].description.length} -> ${NEW_SIZING_DESCRIPTION.length}` },
  expectMatchesLive: !expect || liveHash === expect,
}, null, 1));
if (expect && liveHash !== expect) throw new Error(`Live hash ${liveHash} != --expect ${expect}; refusing`);
if (!execute) process.exit(0);

mkdirSync(resolve(here, 'snapshots'), { recursive: true });
writeFileSync(resolve(here, `snapshots/dev-${new Date().toISOString().slice(0, 10)}-pre-sizing-guardrail-full.json`), JSON.stringify({ agentId: process.env.JTV_TARGET_AGENT_ID ?? S.devAgentId, capturedAt: new Date().toISOString(), agent: live }, null, 1));

if (!S.editKey) throw new Error('Missing edit credential');
const r = await fetch(url, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, accept: 'application/json', 'content-type': 'application/json' },
  body: JSON.stringify({
    instructions: target.instructions,
    systemPrompt: target.systemPrompt,
    tools: normTools(target.tools).map((t) => (t.type === 'algolia_search_index' ? Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'description')) : t)),
    config: target.config,
  }),
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0, 400)}`);
let after;
for (let i = 0; i < 8; i++) {
  after = await get();
  if (hash4(after) === targetHash) break;
  await new Promise((w) => setTimeout(w, 700));
}
const afterCat = (after.config?.guardrail?.categories ?? [])[1] ?? {};
console.log(JSON.stringify({
  applied: hash4(after) === targetHash,
  readback: {
    sizingDescriptionMatches: afterCat.description === NEW_SIZING_DESCRIPTION,
    sizingExamplesMatch: afterCat.examples === NEW_SIZING_EXAMPLES,
  },
  updatedAt: after.updatedAt,
}, null, 1));
if (hash4(after) !== targetHash) throw new Error('Readback hash mismatch after PATCH');
