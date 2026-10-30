import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
const r = await fetch(`https://${S.appId}.algolia.net/agent-studio/1/agents/${S.devAgentId}`, {
  headers: { 'x-algolia-application-id': S.appId, 'x-algolia-api-key': S.searchKey },
});
const a: any = await r.json();
const p = (a.tools ?? []).find((t: any) => t.name === 'present_products');
console.log(JSON.stringify(p?.inputSchema ?? null, null, 1).slice(0, 1200));
console.log('instructionsSha8:', (await import('node:crypto')).createHash('sha256').update(a.instructions).digest('hex').slice(0, 8));
