import { createAgentStudioClient, loadCredentials } from '../conversation-reader/agentStudio.ts';
import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
const c = createAgentStudioClient(await loadCredentials(), S.devAgentId);
const CONVS: [string, string][] = [
  ['J1', 'mission-0b932050-8921-42b3-aabf-0149a2780340'],
  ['J2', 'mission-a264b85c-55b5-479f-b1a8-429f4aa8d913'],
  ['J3', 'mission-39710bb2-cdf9-4f09-b2f1-36cf8af33c9b'],
  ['J4', 'mission-81a512bc-1ede-41d4-9505-a996a3ab8c1d'],
  ['J5', 'mission-542a8370-a883-4515-8eb8-28bc4c867764'],
];
for (const [name, id] of CONVS) {
  const conv: any = await c.fetchConversation(id);
  let userTurn = 0;
  for (const m of conv.messages) {
    if (m.role === 'user') { userTurn++; continue; }
    if (m.role !== 'assistant') continue;
    let text = '';
    let parts = 0;
    for (const p of m.parts) {
      if (p.type === 'text') { text += (text ? '\n\n' : '') + p.text; parts++; }
    }
    const paras = text.split(/\n\s*\n/).filter((b: string) => b.trim());
    const bold = (text.match(/\*\*[^*]+\*\*/g) ?? []).join(' | ');
    const questionMarks = (text.match(/\?/g) ?? []).length;
    console.log(`${name} t${userTurn}: parts=${parts} paras=${paras.length} ?=${questionMarks} bold=[${bold.slice(0, 90)}]`);
  }
}
