/* check-agent-drift.mjs: the config-drift guard (2026-10-27 incident). The
 * October guardrail fix was silently overwritten on production and sat there
 * invisible until a shopper tripped it. This guard makes an overwritten fix
 * surface as a diff report instead of a shopper complaint.
 *
 * Two checks:
 *  1. REQUIRED MARKERS — the rules every agent must carry, on BOTH agents:
 *     the guardrail education rule, pre-owned scope, trending merchandising,
 *     the narration bar, and the declaration contract (understood + priceMax).
 *     A missing marker is the silent-regression alarm (exit 1).
 *  2. PARITY REPORT — full-config hashes per agent plus instruction length
 *     drift, informational: dev and prod lineages carry known benign drift,
 *     so equality is reported, never enforced.
 *
 *   NODE_USE_SYSTEM_CA=1 node scripts/baseline/check-agent-drift.mjs            report
 *   NODE_USE_SYSTEM_CA=1 node scripts/baseline/check-agent-drift.mjs --release-gate
 * Exit codes: 0 all markers present; 1 a marker is missing (silent regression).
 */
import { loadSettings } from './settings.mjs';
const S = loadSettings();

const MARKERS = [
  { name: 'guardrail education-aware rule (V10)', where: 'config.guardrail.categories', test: (a) => (a.config?.guardrail?.categories ?? []).some((c) => (c.description ?? '').includes('never flag education merely because')) },
  { name: 'pre-owned scope rule', where: 'instructions', test: (a) => a.instructions.includes('Pre-owned is out of scope entirely') },
  { name: 'trending merchandising rule', where: 'instructions', test: (a) => a.instructions.includes('What is trending on our site is merchandised') },
  { name: 'narration bar', where: 'instructions', test: (a) => a.instructions.includes("don't read as pearl") },
  { name: 'declaration contract: understood field', where: 'tools', test: (a) => !!(a.tools ?? []).find((t) => t.name === 'present_products')?.inputSchema?.properties?.understood },
  { name: 'declaration contract: priceMax', where: 'tools', test: (a) => !!Object.keys((a.tools ?? []).find((t) => t.name === 'present_products')?.inputSchema?.properties?.understood?.properties ?? {}).includes('priceMax') },
];

const AGENTS = [
  { name: 'dev', id: S.devAgentId },
  { name: 'prod', id: S.productionAgentId },
];

const stripNulls = (v) =>
  Array.isArray(v) ? v.map(stripNulls) : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]))
    : v;
/* Tool objects normalize per-agent on the platform (field order, stripped
 * nulls) — compare semantics, not bytes. */
const normalizeTools = (tools) =>
  stripNulls((tools ?? []).map((t) => ({
    ...t,
    description: t.type === 'algolia_search_index' ? undefined : t.description,
    indices: (t.indices ?? []).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'enhancedDescription'))),
  })));

const fetchAgent = async (id) => {
  const r = await fetch(`https://${S.appId}.algolia.net/agent-studio/1/agents/${id}`, {
    headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey },
  });
  if (!r.ok) throw new Error(`GET agent ${id} failed: ${r.status}`);
  return r.json();
};

const agents = {};
for (const a of AGENTS) agents[a.name] = await fetchAgent(a.id);

const report = { checkedAt: new Date().toISOString(), markers: {}, parity: {}, alarm: [] };
for (const marker of MARKERS) {
  report.markers[marker.name] = {};
  for (const a of AGENTS) {
    const ok = marker.test(agents[a.name]);
    report.markers[marker.name][a.name] = ok ? 'present' : 'MISSING';
    if (!ok) report.alarm.push(`${marker.name} missing on ${a.name}`);
  }
}

for (const key of ['instructions', 'systemPrompt', 'config']) {
  report.parity[key] = {
    devLength: (key === 'config' ? JSON.stringify(agents.dev[key]) : agents.dev[key] ?? '').length,
    prodLength: (key === 'config' ? JSON.stringify(agents.prod[key]) : agents.prod[key] ?? '').length,
    equal: JSON.stringify(agents.dev[key]) === JSON.stringify(agents.prod[key]),
  };
}
report.parity.tools = { equal: JSON.stringify(normalizeTools(agents.dev.tools)) === JSON.stringify(normalizeTools(agents.prod.tools)) };

console.log(JSON.stringify(report, null, 1));
if (report.alarm.length) {
  console.error(`DRIFT ALARM: ${report.alarm.join('; ')}`);
  process.exit(1);
}
