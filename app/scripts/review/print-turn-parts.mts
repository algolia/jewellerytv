import { createAgentStudioClient, loadCredentials } from '../conversation-reader/agentStudio.ts';
import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
const c = createAgentStudioClient(await loadCredentials(), S.devAgentId);
const conv: any = await c.fetchConversation('mission-0b932050-8921-42b3-aabf-0149a2780340');
let userTurn = 0;
for (const m of conv.messages) {
  if (m.role === 'user') { userTurn++; continue; }
  if (userTurn !== 1) continue;
  console.log('=== J1 t1 text parts in stream order:');
  let i = 0;
  for (const p of m.parts) {
    if (p.type === 'text') { i++; console.log(`-- text part ${i} --`); console.log(JSON.stringify(p.text)); }
    else if (p.type === 'tool-call') console.log(`-- tool call: ${p.toolName}`);
  }
}
