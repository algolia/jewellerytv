/* apply-narration-bundle-dev.mjs: one PATCH that lands the 2026-10-30 narration
 * fix bundle (5 edits) on the DEV agent — kills the between-tool progress-line
 * allowance, makes corrective re-searches silent, scopes the one-search rule,
 * bans quoting how few, and adds the emerald-studs worked example. Candidate:
 * docs/config/concierge-development/candidates/narration-fix-2026-10-30/narration-bundle.md
 * All five OLD strings verified present in the live dev text before writing.
 *   NODE_USE_SYSTEM_CA=1 node scripts/baseline/apply-narration-bundle-dev.mjs                     preflight
 *   NODE_USE_SYSTEM_CA=1 node scripts/baseline/apply-narration-bundle-dev.mjs --execute --expect=<instr8>:<sys8>   apply
 */
import { writeFileSync } from 'node:fs';
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

const EDITS = [
  {
    id: 'E1-thin-shelf-row',
    old: '| Only a handful of matches | Say how few in plain words, show what exists, and ask whether to widen. If none are in stock, say so and offer the closest in stock. Never widen silently. |',
    new: '| Only a handful of matches | Say the shelf is thin in plain words, show what exists, and ask whether to widen. If none are in stock, say so and offer the closest in stock. Never widen silently, never quote how many. |',
  },
  {
    id: 'E2-progress-slot-dies',
    old: '- Do: between tool steps, at most one short progress line ("Let me pull those up"), and only when the shopper is left waiting.',
    new: "- Don't: put any line between tool steps. The shopper waits on the tiles, not on progress talk; the reply comes once, after the last tool result.",
  },
  {
    id: 'E3-silent-research',
    old: '- Don\'t: explain a tool\'s verdict or an empty first attempt ("The display tool is telling me these pieces don\'t read as pearl by its material-name check"). When a first shelf comes back empty or thin, search again with different facet values and show what you found; the shopper hears about what we hold, never about how the checking works.',
    new: "- Don't: explain a tool's verdict or an empty first attempt. When a first shelf comes back empty or thin, search again with different facet values and show what you found, silently: no count, no \"too thin\", no \"let me broaden\", no story about the first attempt. The shopper hears about what we hold, never about how the checking works.",
  },
  {
    id: 'E5-worked-example',
    old: 'Example, good: "a deep selection of tanzanite rings in yellow gold, and you can narrow by shape, setting or budget right here."',
    new: 'Example, good: "a deep selection of tanzanite rings in yellow gold, and you can narrow by shape, setting or budget right here."\nExample, a thin or contradicting first search: the shopper asks for emerald studs and the first search returns pieces whose stone fields say otherwise. Search again with the primary-stone facet filter, curate, and open on the shelf: "Emeralds run deep this season, and you can narrow by shape or budget right here." No count, no "only a few", no "let me broaden", no story about the first attempt.',
  },
  {
    id: 'E4-systemPrompt-one-search',
    old: 'One search per turn, always. Send exactly one query in the search call; a call carrying several queries renders nothing. The shopper\'s tap or next message takes the search deeper; you never preempt it with a second query in the same turn.',
    new: 'One search per turn, always. Send exactly one query in the search call; a call carrying several queries renders nothing. A corrective second search in the same turn is allowed only when the first results contradict the request or come back empty or thin, and that correction is silent. The shopper\'s tap or next message takes the search deeper; you never preempt it with a second query otherwise.',
  },
];

const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`;
const apiKey = S.editKey;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};

const live = await get();
const misses = EDITS.filter((e) => !live.instructions.includes(e.old) && !live.systemPrompt.includes(e.old));
if (misses.length) throw new Error(`OLD string(s) not found in live agent: ${misses.map((m) => m.id).join(', ')} — prompt drifted, re-read the whole prompt before editing`);
const already = live.instructions.includes('Example, a thin or contradicting first search');
if (already && !execute) console.log('NOTE: bundle may already be applied (worked example present)');

let next = { instructions: live.instructions, systemPrompt: live.systemPrompt, tools: live.tools };
for (const e of EDITS) {
  const src = e.old.startsWith('One search') ? next.systemPrompt : next.instructions;
  const field = e.old.startsWith('One search') ? 'systemPrompt' : 'instructions';
  if (!src.includes(e.old)) throw new Error(`${e.id}: OLD string consumed by an earlier edit in an unexpected way`);
  next[field] = src.replace(e.old, e.new);
}
const targetHash = hash3(next);

console.log(JSON.stringify({
  phase: 'preflight',
  execute,
  live: { hash3: hash3(live), updatedAt: live.updatedAt, instructionsChars: live.instructions.length, systemPromptChars: live.systemPrompt.length },
  target: { hash3: targetHash, instructionsChars: next.instructions.length, systemPromptChars: next.systemPrompt.length },
  expectMatchesLive: !expect || hash3(live) === expect,
}, null, 2));

if (!execute) { console.log('preflight only; rerun with --execute --expect=' + hash3(live)); process.exit(0); }
if (hash3(live) !== expect) throw new Error(`Live hash ${hash3(live)} != expected ${expect}; agent changed since preflight, re-run preflight`);

const r = await fetch(url, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': apiKey, 'content-type': 'application/json' },
  body: JSON.stringify(patchBody(next)),
});
if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 400)}`);

const after = await get();
const receipt = {
  appliedAt: new Date().toISOString(),
  agent: S.devAgentId,
  edits: EDITS.map((e) => e.id),
  liveBefore: hash3(live),
  liveAfter: hash3(after),
  targetMatch: hash3(after) === targetHash,
  updatedAt: after.updatedAt,
};
writeFileSync(resolve(here, `snapshots/2026-10-30-narration-bundle-dev-receipt.json`), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
if (!receipt.targetMatch) throw new Error('Readback hash != target; verify before claiming applied');
