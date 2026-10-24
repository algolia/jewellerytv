import { readFileSync } from 'node:fs';
const a = JSON.parse(readFileSync('/tmp/jtv-dev-agent.json', 'utf8'));
for (const t of a.tools ?? []) {
  if (t.name !== 'algolia_search_index') continue;
  for (const idx of t.indices ?? []) {
    const slim = {};
    for (const [k, v] of Object.entries(idx))
      if (k !== 'description' && k !== 'enhancedDescription') slim[k] = v;
    console.log(JSON.stringify(slim, null, 1));
  }
  console.log('tool-level keys:', Object.keys(t).join(', '));
}
