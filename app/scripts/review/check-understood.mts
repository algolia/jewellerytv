import { createAgentStudioClient, loadCredentials } from '../conversation-reader/agentStudio.ts';
import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
const c = createAgentStudioClient(await loadCredentials(), S.devAgentId);
for (const [label, id] of [
  ['C2-r2 (WPD2292 leak)', 'mission-dec53f54-03d3-4895-802a-19c0e51d3326'],
  ['C1-r2', 'mission-c0261177-b618-4aef-a3fa-447ca9b5d7e7'],
] as const) {
  const conv: any = await c.fetchConversation(id);
  let userTurn = 0;
  console.log('==', label);
  for (const m of conv.messages) {
    if (m.role === 'user') { userTurn++; continue; }
    if (m.role !== 'assistant') continue;
    for (const p of m.parts) {
      if (p.type === 'tool-call' && String(p.toolName).includes('present')) {
        let a: any = p.args;
        if (a == null && typeof p.rawArgs === 'string') { try { a = JSON.parse(p.rawArgs); } catch {} }
        console.log(` t${userTurn} present_products understood:`, JSON.stringify(a?.understood ?? null));
      }
    }
  }
}
