import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const env = {};
for (const line of readFileSync('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const get = async (id) => {
  const res = await fetch('https://agent-studio.us.algolia.com/1/agents/' + id, {
    headers: { 'X-Algolia-Application-Id': env.ALGOLIA_APP_ID, 'X-Algolia-API-Key': env.ALGOLIA_SEARCH_API_KEY },
  });
  return res.json();
};
const sha = (x) => createHash('sha256').update(x ?? '').digest('hex').slice(0, 8);
for (const [name, id] of [['DEV', '8129ad66-170b-4bb5-926a-c81d2cb38f22'], ['PROD', '0bdf59fe-e598-4db7-b139-2b93d5255bb4']]) {
  const a = await get(id);
  console.log(name, id.slice(0, 8), '| instructions', sha(a.instructions), a.instructions.length + 'ch', '| sysprompt', sha(a.systemPrompt), a.systemPrompt.length + 'ch', '| updatedAt', a.updatedAt);
  writeFileSync('/tmp/jtv-live-' + name.toLowerCase() + '-now.json', JSON.stringify(a, null, 1));
}
console.log('my baseline: DEV instr bb3faddd sys 544f80ab (my apply ~01:00 ET)');
