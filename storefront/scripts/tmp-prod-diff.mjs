/* One-off coordination check: what changed on the production agent at 16:51Z? */
import { loadSettings } from './baseline/settings.mjs';
const S = loadSettings();
const url = (id) => `https://${S.appId}.algolia.net/agent-studio/1/agents/${id}`;
const get = async (id) => {
  const r = await fetch(url(id), { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  if (!r.ok) throw new Error(`GET ${r.status}`);
  return r.json();
};
const prod = await get(S.productionAgentId);
console.log('updatedAt', prod.updatedAt);
console.log('instr', prod.instructions.length, 'ch | sys', prod.systemPrompt.length, 'ch');
console.log('tools:', (prod.tools ?? []).map((t) => t.name || t.type).join(','));
console.log('--- instructions head ---');
console.log(prod.instructions.slice(0, 400));
