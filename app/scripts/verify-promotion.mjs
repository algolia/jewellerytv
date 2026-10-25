/* verify-promotion.mjs: prove the live production surface runs the curation
 * system — agent hashes equal Dev, the site serves the new deployment, and
 * the tool sheet matches. Read-only. */
import { loadSettings } from './baseline/settings.mjs';
const S = loadSettings();
const get = async (id) => {
  const r = await fetch(`https://${S.appId}.algolia.net/agent-studio/1/agents/${id}`, { headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey } });
  return r.json();
};
const c = (await import('node:crypto')).createHash;
const sha = (x) => c('sha256').update(x ?? '').digest('hex').slice(0, 8);
const dev = await get(S.devAgentId);
const prod = await get(S.productionAgentId);
const health = await (await fetch('https://jewellerytv.vercel.app/api/health')).json();
const result = {
  devInstr: sha(dev.instructions), prodInstr: sha(prod.instructions), equalInstr: sha(dev.instructions) === sha(prod.instructions),
  devSys: sha(dev.systemPrompt), prodSys: sha(prod.systemPrompt), equalSys: sha(dev.systemPrompt) === sha(prod.systemPrompt),
  tools: (prod.tools ?? []).map((t) => t.name || t.type).join(','),
  prodHasPresent: (prod.tools ?? []).some((t) => t.name === 'present_products'),
  liveHealth: health.ok, liveToolSheet: health.toolSheet?.status,
};
console.log(JSON.stringify(result, null, 1));
if (!result.equalInstr || !result.equalSys || !result.prodHasPresent || !result.liveHealth || result.liveToolSheet !== 'match') {
  console.log('VERIFICATION FAILED');
  process.exit(1);
}
console.log('VERIFICATION PASSED: production runs the curation system, agents identical, tool sheet matches.');
