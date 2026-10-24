import { readFileSync, writeFileSync } from 'node:fs';
const env = {};
for (const line of readFileSync('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const body = readFileSync('/tmp/jtv-patch-body.json', 'utf8');
const res = await fetch('https://agent-studio.us.algolia.com/1/agents/8129ad66-170b-4bb5-926a-c81d2cb38f22', {
  method: 'PATCH',
  headers: {
    'X-Algolia-Application-Id': env.ALGOLIA_APP_ID,
    'X-Algolia-API-Key': env.BLOG_INDEX_API_KEY,
    'Content-Type': 'application/json',
  },
  body,
});
console.log('PATCH status:', res.status);
const out = await res.text();
console.log(out.slice(0, 300));
writeFileSync('/tmp/jtv-patch-response.json', out);
