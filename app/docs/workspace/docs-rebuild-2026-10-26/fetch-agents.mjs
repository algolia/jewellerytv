/* Read-only: fetch the live dev + production agent configs for the docs
 * rebuild. Writes agent-{dev,prod}-<timestamp>.json into this folder. */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const { loadSettings } = await import(resolve(here, '../../../scripts/baseline/settings.mjs'));
const S = loadSettings();
const get = async (id) => {
  const r = await fetch(`https://${S.appId}.algolia.net/agent-studio/1/agents/${id}`, {
    headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey },
  });
  if (!r.ok) throw new Error(`agent ${id} HTTP ${r.status}`);
  return r.json();
};
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
for (const [name, id] of [['dev', S.devAgentId], ['prod', S.productionAgentId]]) {
  const agent = await get(id);
  const path = resolve(here, `agent-${name}-${stamp}.json`);
  writeFileSync(path, JSON.stringify(agent, null, 2) + '\n');
  console.log(name, id, '->', path, '| instructions sha8 sample:', (agent.instructions || '').length, 'chars');
}
