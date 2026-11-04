/* One-shot Dev-agent instruction amendment, 2026-11-04 (second narration fix):
 * the worked example alone did not stop the model ("I'll search for pieces
 * under $200..."). Adds a hard, repeatable test to the same spot: banned
 * openings listed verbatim, rewrite rule stated. Appends after the existing
 * example line. Readback-verified; never prints the key. */
import { readFileSync } from 'node:fs';

const ROOT = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv';
const ID = '8129ad66-170b-4bb5-926a-c81d2cb38f22';
const env = {};
for (const line of readFileSync(`${ROOT}/.env.local`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z0-9_-]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const headers = {
  'x-algolia-application-id': env.ALGOLIA_APP_ID,
  'x-algolia-api-key': env.BLOG_INDEX_API_KEY,
  'content-type': 'application/json',
};

const get = async () => {
  const r = await fetch(`https://agent-studio.us.algolia.com/1/agents/${ID}`, { headers });
  const b = await r.json();
  return b.data ?? b;
};

const anchor = `(starts with what the shopper will learn).\n`;
const insertion = `${anchor}- Test, every reply's first sentence: if it contains "I'll search", "I will search", "let me", "let's", or "I will show", it is narration and it is wrong, whatever the wording around them. Rewrite it to state what the shopper is looking at or what the pieces say: "Under $200, these three stand out." The shopper asked; the searching is assumed.\n`;

const dev = await get();
if (!dev.instructions.includes(anchor)) throw new Error('anchor not found in live instructions');
const instructions = dev.instructions.replace(anchor, insertion);

const patch = await fetch(`https://agent-studio.us.algolia.com/1/agents/${ID}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ instructions }),
});
if (!patch.ok) throw new Error(`PATCH: ${patch.status} ${(await patch.text()).slice(0, 200)}`);
console.log('PATCH: 200');

const after = await get();
console.log('readback identical:', after.instructions === instructions);
console.log('contains test rule:', after.instructions.includes('Test, every reply'));
console.log('bytes:', after.instructions.length, '(was', dev.instructions.length + ')');
