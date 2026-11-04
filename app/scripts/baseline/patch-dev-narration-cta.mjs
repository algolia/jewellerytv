/* One-shot Dev-agent instruction amendment, 2026-11-04 (Arijit's test feedback):
 *  1. the closing question must stand as its own paragraph;
 *  2. a worked example pinning the exact "I'll search for…" narration he saw.
 * Appended to the end of the "# How you talk" section, after its examples.
 * Readback-verified; never prints the key. */
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

const anchor = `or stacking "Good spread here" and "Here's what I found" in one reply.\n`;
const insertion = `${anchor}- Do: put the closing question in its own short paragraph, separate from the guidance above it, so the shopper's next step stands alone. A question run in at the end of a price or material paragraph disappears into it.
Example, bad: opening a product request with "I'll search for wedding ring sets and show you what we carry across different styles and budgets." (announces the job; the searching is the job the shopper already asked for). Example, good: the same turn opening "Wedding ring sets run from under $100 to above $1,000." (starts with what the shopper will learn).
`;

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
console.log('contains CTA rule:', after.instructions.includes('its own short paragraph'));
console.log('contains narration example:', after.instructions.includes("I'll search for wedding ring sets"));
console.log('bytes:', after.instructions.length, '(was', dev.instructions.length + ')');
