import { createAgentStudioClient, loadCredentials } from '../conversation-reader/agentStudio.ts';
import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
const c = createAgentStudioClient(await loadCredentials(), S.devAgentId);
const conv: any = await c.fetchConversation('mission-dec53f54-03d3-4895-802a-19c0e51d3326');
let userTurn = 0;
for (const m of conv.messages) {
  if (m.role === 'user') { userTurn++; continue; }
  if (userTurn !== 2 || m.role !== 'assistant') continue;
  let i = 0;
  for (const p of m.parts) {
    if (p.type === 'text') { i++; console.log(`-- text part ${i} --\n${p.text}\n`); }
  }
}
