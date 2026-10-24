import { readFileSync, writeFileSync } from 'node:fs';
const agent = JSON.parse(readFileSync('/tmp/jtv-dev-agent-new.json', 'utf8'));
for (const t of agent.tools) {
  if (t.name === 'arrange_groups') {
    t.description =
      'Decide what displays. Up to 3 titled groups, up to 6 objectIDs each, best first. Ineligible pieces drop with a reason. The first pieces per group display; the rest return as surplus, by group. Nothing moves between groups on its own. Bounds strict unless ceilingInclusive or floorInclusive is set.';
  }
}
writeFileSync('/tmp/jtv-dev-agent-new.json', JSON.stringify(agent));
writeFileSync(
  '/tmp/jtv-patch-body.json',
  JSON.stringify({ systemPrompt: agent.systemPrompt, instructions: agent.instructions, tools: agent.tools }),
);
const desc = agent.tools.find((t) => t.name === 'arrange_groups').description;
console.log('desc chars:', desc.length, '| bounds kept:', desc.includes('Bounds strict'));
