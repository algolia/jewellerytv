import { readFileSync, writeFileSync } from 'node:fs';
const agent = JSON.parse(readFileSync('/tmp/jtv-dev-agent-new.json', 'utf8'));
const desc =
  'Decide what displays. Up to 3 groups, 6 objectIDs each, best first. Ineligible drops with reason; surplus returns by group; nothing moves between groups. Bounds strict unless inclusive flags.';
console.log('desc chars:', desc.length);
if (desc.length > 200) throw new Error('still over cap');
for (const t of agent.tools) if (t.name === 'arrange_groups') t.description = desc;
writeFileSync('/tmp/jtv-dev-agent-new.json', JSON.stringify(agent));
writeFileSync(
  '/tmp/jtv-patch-body.json',
  JSON.stringify({ systemPrompt: agent.systemPrompt, instructions: agent.instructions, tools: agent.tools }),
);
console.log('patch body regenerated');
