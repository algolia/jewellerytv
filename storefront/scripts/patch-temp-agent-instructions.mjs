#!/usr/bin/env node
/**
 * Replace the instructions of the TEMPORARY test agent (8129ad66, "Option A test") with a candidate file.
 * Hard-locked to the temp agent id; refuses the live agent. Preflight by default, --execute to write.
 *
 *   node scripts/patch-temp-agent-instructions.mjs --candidate <path> [--execute]
 *
 * Keys come from env files and are never printed or saved.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TEMP = '8129ad66-170b-4bb5-926a-c81d2cb38f22';
const LIVE = '0bdf59fe-e598-4db7-b139-2b93d5255bb4';
const root = resolve(import.meta.dirname, '../..');
const candFlag = process.argv.indexOf('--candidate');
if (candFlag < 0) throw new Error('Pass --candidate <file>');
const candidate = readFileSync(resolve(process.argv[candFlag + 1]), 'utf8');
const execute = process.argv.includes('--execute');
const sha = (t) => createHash('sha256').update(t).digest('hex');

const readEnv = (p) => {
  const v = {};
  if (!existsSync(p)) return v;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) v[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return v;
};
const local = {
  ...readEnv(resolve(root, '.env.local')),
  ...readEnv(resolve(root, 'storefront/.env.local')),
};
const val = (n) => process.env[n] ?? local[n];
const appId = val('ALGOLIA_APP_ID');
const readKey = val('ALGOLIA_SEARCH_API_KEY');
const editKey =
  val('BLOG_INDEX_API_KEY') || val('ALGOLIA_AGENT_STUDIO_EDIT_API_KEY') || val('ALGOLIA_ADMIN_KEY');
if (!appId || !readKey) throw new Error('Missing read credentials');
const url = (id) => `https://${appId}.algolia.net/agent-studio/1/agents/${id}`;
const get = async (id) => {
  const r = await fetch(url(id), {
    headers: { 'x-algolia-application-id': appId, 'x-algolia-api-key': readKey },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`GET ${id} failed ${r.status}`);
  return r.json();
};
if (TEMP === LIVE) throw new Error('Refusing: temp id equals live id');

const liveBefore = await get(LIVE);
const before = await get(TEMP);
const summary = (a) => ({
  status: a.status,
  name: a.name,
  instructionsSha: sha(a.instructions).slice(0, 8),
  toolsSha: sha(JSON.stringify(a.tools)).slice(0, 8),
  systemPromptSha: sha(a.systemPrompt ?? '').slice(0, 8),
});
console.log(
  JSON.stringify({
    phase: 'preflight',
    temp: summary(before),
    live: summary(liveBefore),
    candidateSha: sha(candidate).slice(0, 8),
    candidateChars: candidate.length,
    execute,
  }),
);
if (!/temporary/i.test(before.name))
  throw new Error('Target name does not say temporary; no write');
if (!execute) process.exit(0);
if (!editKey) throw new Error('Missing edit credential');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dir = resolve(root, 'docs/workspace/simplify-2026-10-17/results/B0');
writeFileSync(
  resolve(dir, `temp-instructions-before-${stamp}.json`),
  `${JSON.stringify(before, null, 2)}\n`,
);
const r = await fetch(url(TEMP), {
  method: 'PATCH',
  headers: {
    'x-algolia-application-id': appId,
    'x-algolia-api-key': editKey,
    accept: 'application/json',
    'content-type': 'application/json',
  },
  body: JSON.stringify({ instructions: candidate }),
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw new Error(`PATCH failed ${r.status}: ${(await r.text()).slice(0, 600)}`);
let after;
for (let i = 0; i < 6; i++) {
  after = await get(TEMP);
  if (after.instructions === candidate) break;
  await new Promise((w) => setTimeout(w, 700));
}
const liveAfter = await get(LIVE);
writeFileSync(
  resolve(dir, `temp-instructions-after-${stamp}.json`),
  `${JSON.stringify(after, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    phase: 'readback',
    instructionsMatchCandidate: after.instructions === candidate,
    tempStatus: after.status,
    tempOtherFieldsUnchanged:
      sha(JSON.stringify(after.tools)) === sha(JSON.stringify(before.tools)) &&
      after.systemPrompt === before.systemPrompt &&
      JSON.stringify(after.config) === JSON.stringify(before.config),
    liveUnchanged:
      liveAfter.instructions === liveBefore.instructions &&
      JSON.stringify(liveAfter.tools) === JSON.stringify(liveBefore.tools) &&
      JSON.stringify(liveAfter.config) === JSON.stringify(liveBefore.config),
    liveStatus: liveAfter.status,
    tempAfter: summary(after),
  }),
);
if (after.instructions !== candidate || after.status !== 'published')
  throw new Error('Readback failed; inspect receipts');
