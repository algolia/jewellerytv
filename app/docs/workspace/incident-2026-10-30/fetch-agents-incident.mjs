/* fetch-agents-incident.mjs: read-only GET of both agents' full config for the
 * 2026-10-30 end-to-end diagnostics. Saves full JSON per agent, prints identity
 * hashes, updatedAt and sizes so drift vs baseline.json can be judged from the
 * live source of truth. No writes. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadSettings } from '../../../scripts/baseline/settings.mjs';

const S = loadSettings();
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(here, { recursive: true });
const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 8);

for (const [label, id] of [['dev', S.devAgentId], ['prod', S.productionAgentId]]) {
  const url = `https://${S.appId}.algolia.net/agent-studio/1/agents/${id}`;
  const r = await fetch(url, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) { console.log(`${label}: GET ${r.status}`); continue; }
  const agent = await r.json();
  const file = resolve(here, `agent-${label}-live.json`);
  writeFileSync(file, JSON.stringify(agent, null, 2));
  console.log(JSON.stringify({
    label,
    id,
    updatedAt: agent.updatedAt,
    name: agent.name,
    instructionsHash: sha(agent.instructions),
    systemPromptHash: sha(agent.systemPrompt),
    toolsHash: sha(agent.tools ?? []),
    instructionsChars: (agent.instructions ?? '').length,
    systemPromptChars: (agent.systemPrompt ?? '').length,
    toolNames: (agent.tools ?? []).map((t) => t.name ?? t.type),
    searchParameters: agent.searchParameters ?? null,
    file,
  }, null, 2));
}
