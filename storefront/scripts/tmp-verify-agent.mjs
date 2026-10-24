import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const env = {};
for (const line of readFileSync('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const res = await fetch('https://agent-studio.us.algolia.com/1/agents/8129ad66-170b-4bb5-926a-c81d2cb38f22', {
  headers: { 'X-Algolia-Application-Id': env.ALGOLIA_APP_ID, 'X-Algolia-API-Key': env.ALGOLIA_SEARCH_API_KEY },
});
const live = await res.json();
writeFileSync('/tmp/jtv-dev-agent-live-after.json', JSON.stringify(live, null, 1));
const want = JSON.parse(readFileSync('/tmp/jtv-dev-agent-new.json', 'utf8'));
const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
console.log('systemPrompt sha live/want:', sha(live.systemPrompt), sha(want.systemPrompt), live.systemPrompt === want.systemPrompt ? 'MATCH' : 'MISMATCH');
console.log('instructions sha live/want:', sha(live.instructions), sha(want.instructions), live.instructions === want.instructions ? 'MATCH' : 'MISMATCH');
const liveArrange = live.tools.find((t) => t.name === 'arrange_groups');
console.log('arrange desc:', liveArrange.description);
const liveSearch = live.tools.find((t) => t.name === 'algolia_search_index');
console.log('search tool unchanged:', liveSearch.indices[0].searchParameters.filters);
