import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const env = {};
for (const line of readFileSync('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const get = async (id) =>
  (await fetch('https://agent-studio.us.algolia.com/1/agents/' + id, {
    headers: { 'X-Algolia-Application-Id': env.ALGOLIA_APP_ID, 'X-Algolia-API-Key': env.ALGOLIA_SEARCH_API_KEY },
  })).json();
const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 8);
for (const [name, id] of [['DEV', '8129ad66-170b-4bb5-926a-c81d2cb38f22'], ['PROD', '0bdf59fe-e598-4db7-b139-2b93d5255bb4']]) {
  const a = await get(id);
  console.log('==', name, 'updatedAt', a.updatedAt);
  for (const t of a.tools ?? []) {
    console.log('  tool:', t.name, '| sha', sha(t), '| indices:', (t.indices ?? []).map(i => i.index).join(',') || '-', '| type:', t.type);
    if (t.name === 'arrange_groups') console.log('    desc:', t.description);
    if (t.name === 'algolia_search_index') console.log('    facets default count:', (t.indices?.[0]?.searchControls?.facets?.default ?? []).length, '| filters:', t.indices?.[0]?.searchParameters?.filters);
  }
}
