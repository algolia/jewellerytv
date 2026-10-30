/* restore-verified-lineage-2026-10-30.mjs: restore the verified Oct 30 prompt
 * lineage (narration bundle + all Oct 27 fixes) to the DEV agent after the
 * 19:36:45Z wholesale apply of the stale prompt-review-2026-10-23 draft.
 * Target state = pre-draft dev snapshot + the 5 narration-bundle edits + the
 * systemPrompt one-search edit (hash 762a95d7:2c02f7de:754837ce), i.e. exactly
 * what was verified end to end on 5173 today. Run WITHOUT --execute to
 * preflight against live hashes.
 *   NODE_USE_SYSTEM_CA=1 node scripts/baseline/restore-verified-lineage-2026-10-30.mjs                    preflight
 *   NODE_USE_SYSTEM_CA=1 node scripts/baseline/restore-verified-lineage-2026-10-30.mjs --execute --expect-dev=<instr8>:<sys8>:<tools8>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadSettings } from './settings.mjs';

const S = loadSettings();
const here = dirname(fileURLToPath(import.meta.url));
const execute = process.argv.includes('--execute');
const expect = process.argv.find((x) => x.startsWith('--expect-dev='))?.split('=')[1];
const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
const s8 = (v) => sha(v).slice(0, 8);

const snapshot = JSON.parse(readFileSync(resolve(here, '../../evidence/baseline/2026-10-30T19-20-00Z-DEV-pre-narrationfix.snapshot.json'), 'utf8'));
const base = snapshot.agent ?? snapshot;

const EDITS = [
  {
    old: '| Only a handful of matches | Say how few in plain words, show what exists, and ask whether to widen. If none are in stock, say so and offer the closest in stock. Never widen silently. |',
    new: '| Only a handful of matches | Say the shelf is thin in plain words, show what exists, and ask whether to widen. If none are in stock, say so and offer the closest in stock. Never widen silently, never quote how many. |',
  },
  {
    old: '- Do: between tool steps, at most one short progress line ("Let me pull those up"), and only when the shopper is left waiting.',
    new: "- Don't: put any line between tool steps. The shopper waits on the tiles, not on progress talk; the reply comes once, after the last tool result.",
  },
  {
    old: '- Don\'t: explain a tool\'s verdict or an empty first attempt ("The display tool is telling me these pieces don\'t read as pearl by its material-name check"). When a first shelf comes back empty or thin, search again with different facet values and show what you found; the shopper hears about what we hold, never about how the checking works.',
    new: "- Don't: explain a tool's verdict or an empty first attempt. When a first shelf comes back empty or thin, search again with different facet values and show what you found, silently: no count, no \"too thin\", no \"let me broaden\", no story about the first attempt. The shopper hears about what we hold, never about how the checking works.",
  },
  {
    old: 'Example, good: "a deep selection of tanzanite rings in yellow gold, and you can narrow by shape, setting or budget right here."',
    new: 'Example, good: "a deep selection of tanzanite rings in yellow gold, and you can narrow by shape, setting or budget right here."\nExample, a thin or contradicting first search: the shopper asks for emerald studs and the first search returns pieces whose stone fields say otherwise. Search again with the primary-stone facet filter, curate, and open on the shelf: "Emeralds run deep this season, and you can narrow by shape or budget right here." No count, no "only a few", no "let me broaden", no story about the first attempt.',
  },
];

let instructions = base.instructions;
for (const e of EDITS) {
  if (!instructions.includes(e.old)) throw new Error('base snapshot no longer matches the bundle edits; rebuild the target from a fresh verified source');
  instructions = instructions.replace(e.old, e.new);
}
const systemPrompt = base.systemPrompt.replace(
  'One search per turn, always. Send exactly one query in the search call; a call carrying several queries renders nothing. The shopper\'s tap or next message takes the search deeper; you never preempt it with a second query in the same turn.',
  'One search per turn, always. Send exactly one query in the search call; a call carrying several queries renders nothing. A corrective second search in the same turn is allowed only when the first results contradict the request or come back empty or thin, and that correction is silent. The shopper\'s tap or next message takes the search deeper; you never preempt it with a second query otherwise.',
);
if (systemPrompt === base.systemPrompt) throw new Error('systemPrompt one-search anchor missing from base snapshot');
/* tools: the verified state's present_products carries the nullable priceMax schema */
const tools = JSON.parse(JSON.stringify(base.tools));
const pp = tools.find((t) => t.name === 'present_products');
pp.inputSchema.properties.understood.properties.priceMax = {
  type: ['number', 'null'],
  minimum: 0,
  description: 'Dollars the shopper will not go over, when they named a budget. Null or omitted when they named none.',
};
/* the verified state also carries searchControls.facets.default = ["*"] (harmless, measured) — not restored; null stays */

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

const target = { instructions, systemPrompt, tools };
const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`;
const get = async () => {
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};
const live = await get();
console.log(JSON.stringify({
  phase: execute ? 'execute' : 'preflight',
  live: { hash3: hash3(live), updatedAt: live.updatedAt, chars: live.instructions.length },
  target: { hash3: hash3(target), chars: instructions.length },
  note: 'target = verified Oct 30 lineage (bundle + priceMax nullable); the 19:36 draft state is replaced',
}, null, 2));
if (!execute) { console.log('preflight only; rerun with --execute --expect-dev=' + hash3(live)); process.exit(0); }
if (hash3(live) !== expect) throw new Error(`live hash ${hash3(live)} != expected ${expect}; agent changed since preflight`);

const r = await fetch(url, {
  method: 'PATCH',
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.editKey, 'content-type': 'application/json' },
  body: JSON.stringify({ instructions, systemPrompt, tools }),
});
if (!r.ok) throw new Error(`PATCH ${r.status}: ${(await r.text()).slice(0, 400)}`);
const after = await get();
const receipt = {
  restoredAt: new Date().toISOString(),
  agent: S.devAgentId,
  liveBefore: hash3(live),
  liveAfter: hash3(after),
  targetMatch: hash3(after) === hash3(target),
  updatedAt: after.updatedAt,
};
writeFileSync(resolve(here, 'snapshots/2026-10-30-restore-verified-lineage-receipt.json'), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt, null, 2));
if (!receipt.targetMatch) throw new Error('readback != target');
