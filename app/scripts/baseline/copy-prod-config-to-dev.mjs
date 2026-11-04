/* Copy the Production concierge config to the Dev agent, one way, with receipts.
 *
 * Source of truth: the live Production agent (read via GET). Payload carries
 * model, instructions, systemPrompt, tools and config — everything that makes
 * the agent behave. Name, status and provider binding stay Dev's own.
 *
 * SHA discipline per the standing rule: pre-save sha of Dev's instructions,
 * readback x3 after the write, and a hard failure if the readback does not
 * carry the copied bytes. The API key is read from the env file and never
 * printed. NODE_USE_SYSTEM_CA=1 required on this machine.
 *
 * Usage: NODE_USE_SYSTEM_CA=1 node scripts/baseline/copy-prod-config-to-dev.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv';
const HOST = 'https://agent-studio.us.algolia.com/1/agents';
const PROD = 'd466b4a6-1373-4708-a97f-532bb322c1c1';
const DEV = '8129ad66-170b-4bb5-926a-c81d2cb38f22';

const env = {};
for (const line of readFileSync(`${ROOT}/.env.local`, 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z0-9_-]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const key = env.BLOG_INDEX_API_KEY;
if (!key) throw new Error('BLOG_INDEX_API_KEY missing from .env.local');
const headers = {
  'x-algolia-application-id': env.ALGOLIA_APP_ID,
  'x-algolia-api-key': key,
  'content-type': 'application/json',
};

const get = async (id) => {
  const r = await fetch(`${HOST}/${id}`, { headers });
  if (!r.ok) throw new Error(`GET ${id.slice(0, 8)}: ${r.status}`);
  const body = await r.json();
  return body.data ?? body;
};

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 8);

const prod = await get(PROD);
const devBefore = await get(DEV);
console.log('prod  instructions sha:', await hash(prod.instructions), 'bytes:', prod.instructions.length);
console.log('dev   instructions sha (before):', await hash(devBefore.instructions), 'bytes:', devBefore.instructions.length);

/* The display-shape rule currently on Production conditions multi-group on
 * "when the results support more than one distinct direction", which the
 * model reads as an easy out (verified live 2026-11-03: an earrings-varieties
 * ask still produced one group). Dev gets the tightened default-to-3-groups
 * wording so the change is verified here before it is promoted. */
const OLD_SHAPE = /Shape the display to the search:[\s\S]*?look fuller\.\n?/;
const NEW_SHAPE = `Default the display to 3 groups of 4 pieces whenever at least 8 usable pieces survive your checks, naming each group by a real difference the records show — type, collection, material or price world (for example studs, hoops and drops). Show one group only when every surviving piece belongs to one type or collection, or when fewer than 8 pieces survive. Never pad or split artificially: a group must name a difference a shopper would choose between, and every piece must earn its place.`;

let instructions = prod.instructions;
if (OLD_SHAPE.test(instructions)) {
  instructions = instructions.replace(OLD_SHAPE, `${NEW_SHAPE}\n\n`);
  console.log('display-shape paragraph swapped to the tightened wording');
} else {
  instructions = `${instructions}\n\n${NEW_SHAPE}\n`;
  console.log('display-shape paragraph appended (source paragraph not found verbatim)');
}

const payload = {
  model: prod.model,
  instructions,
  systemPrompt: prod.systemPrompt,
  tools: prod.tools,
  config: prod.config,
};

const patch = await fetch(`${HOST}/${DEV}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify(payload),
});
if (!patch.ok) throw new Error(`PATCH dev: ${patch.status} ${(await patch.text()).slice(0, 300)}`);
console.log('PATCH dev: 200');

for (let i = 1; i <= 3; i++) {
  const after = await get(DEV);
  const ok = after.instructions === instructions
    && after.systemPrompt === prod.systemPrompt
    && JSON.stringify(after.tools) === JSON.stringify(prod.tools)
    && after.model === prod.model;
  console.log(`readback ${i}: instructions ${after.instructions === instructions ? 'MATCH' : 'MISMATCH'}`
    + ` | systemPrompt ${after.systemPrompt === prod.systemPrompt ? 'MATCH' : 'MISMATCH'}`
    + ` | tools ${JSON.stringify(after.tools) === JSON.stringify(prod.tools) ? 'MATCH' : 'MISMATCH'}`
    + ` | model ${after.model === prod.model ? 'MATCH' : `MISMATCH (${after.model})`}`);
  if (ok && i >= 2) { console.log('copy verified'); break; }
  if (i === 3 && !ok) throw new Error('readback mismatch after 3 attempts');
  await new Promise((r) => setTimeout(r, 1500));
}
