#!/usr/bin/env node
/**
 * Narrow one output-guardrail category on the published Concierge agent
 * (0bdf59fe-e598-4db7-b139-2b93d5255bb4). Only `description` and `examples`
 * of the named category change; everything else must stay byte-identical.
 *
 *   node scripts/patch-guardrail-category.mjs              preflight only
 *   node scripts/patch-guardrail-category.mjs --execute    write + readback
 *   node scripts/patch-guardrail-category.mjs --rollback   restore the saved before-snapshot
 *
 * Gates: status must be published; live guardrail must byte-match the recorded
 * baseline (or, for rollback, the candidate). Keys are read from env files and
 * are never printed or saved.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packageDir = resolve(
  root,
  'docs/config/concierge-development/candidates/guardrail-care-2026-10-20',
);
const agentId = '0bdf59fe-e598-4db7-b139-2b93d5255bb4';
const category = 'unsupported_assurance_or_contradiction';
const execute = process.argv.includes('--execute');
const rollback = process.argv.includes('--rollback');
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

const readEnvFile = (path) => {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
};
const local = {
  ...readEnvFile(resolve(root, '.env.local')),
  ...readEnvFile(resolve(root, 'storefront/.env.local')),
};
const getValue = (name) => process.env[name] ?? local[name];
const appId = getValue('ALGOLIA_APP_ID');
const readKey = getValue('ALGOLIA_SEARCH_API_KEY');
const editKey =
  getValue('BLOG_INDEX_API_KEY') ||
  getValue('ALGOLIA_AGENT_STUDIO_EDIT_API_KEY') ||
  getValue('ALGOLIA_ADMIN_KEY') ||
  getValue('CONCIERGE_AGENT_AUTHENTICATION_KEY');
if (!appId || !readKey) throw new Error('Missing read credentials');

const endpoint = `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}`;
const getAgent = async () => {
  const response = await fetch(endpoint, {
    headers: { 'x-algolia-application-id': appId, 'x-algolia-api-key': readKey },
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Agent GET failed with HTTP ${response.status}`);
  return response.json();
};

// Locate the guardrail object wherever it lives and return the path of keys to it.
const findPath = (node, path = []) => {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'guardrail') return [...path, key];
      const found = findPath(value, [...path, key]);
      if (found) return found;
    }
  }
  return null;
};
const getAt = (obj, path) => path.reduce((o, k) => o[k], obj);
const withGuardrail = (agent, path, guardrail) => {
  const clone = structuredClone(agent);
  let cursor = clone;
  for (const key of path.slice(0, -1)) cursor = cursor[key];
  cursor[path.at(-1)] = guardrail;
  return clone;
};

const candidate = JSON.parse(readFileSync(resolve(packageDir, 'category-candidate.json'), 'utf8'));
const before = await getAgent();
const path = findPath(before);
if (!path) throw new Error('No guardrail object found in the agent');
const liveGuardrail = getAt(before, path);
const index = liveGuardrail.categories.findIndex((c) => c.name === category);
if (index < 0) throw new Error(`Category ${category} not found`);

const baselinePath = resolve(packageDir, 'rollback-guardrail.json');
if (!existsSync(baselinePath)) {
  if (rollback) throw new Error('No rollback snapshot saved yet');
  writeFileSync(baselinePath, `${JSON.stringify(liveGuardrail, null, 2)}\n`);
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

const candidateGuardrail = structuredClone(baseline);
candidateGuardrail.categories[index] = { ...baseline.categories[index], ...candidate };
const target = rollback ? baseline : candidateGuardrail;
const expectedLive = rollback ? candidateGuardrail : baseline;

console.log(
  JSON.stringify({
    phase: 'preflight',
    guardrailPath: path.join('.'),
    status: before.status,
    liveGuardrailSha: sha(liveGuardrail),
    baselineSha: sha(baseline),
    candidateSha: sha(candidateGuardrail),
    liveMatchesExpected: sha(liveGuardrail) === sha(expectedLive),
    changedKeys: Object.keys(candidate),
    otherCategoriesUntouched: baseline.categories.every(
      (c, i) => i === index || sha(c) === sha(candidateGuardrail.categories[i]),
    ),
    editCredentialPresent: Boolean(editKey),
    execute,
    rollback,
  }),
);
if (before.id !== agentId || before.status !== 'published')
  throw new Error('Identity or status changed; no write');
if (sha(liveGuardrail) !== sha(expectedLive))
  throw new Error('Live guardrail differs from expected bytes; no write');
if (!execute && !rollback) process.exit(0);
if (!editKey) throw new Error('Missing edit credential; no write');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const beforePath = resolve(packageDir, `${rollback ? 'rollback-run-' : ''}before-${stamp}.json`);
const afterPath = resolve(packageDir, `${rollback ? 'rollback-run-' : ''}after-${stamp}.json`);
writeFileSync(beforePath, `${JSON.stringify(before, null, 2)}\n`);

// PATCH only the top-level key that contains the guardrail, with everything else in it unchanged.
const topKey = path[0];
const body = { [topKey]: withGuardrail(before, path, target)[topKey] };
const response = await fetch(endpoint, {
  method: 'PATCH',
  headers: {
    'x-algolia-application-id': appId,
    'x-algolia-api-key': editKey,
    accept: 'application/json',
    'content-type': 'application/json',
  },
  body: JSON.stringify(body),
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) {
  const detail = (await response.text()).slice(0, 1500);
  throw new Error(
    `PATCH failed with HTTP ${response.status}; before snapshot: ${beforePath}; response: ${detail}`,
  );
}

let after;
for (let attempt = 0; attempt < 6; attempt++) {
  after = await getAgent();
  if (sha(getAt(after, path)) === sha(target)) break;
  await new Promise((wait) => setTimeout(wait, 700));
}
writeFileSync(afterPath, `${JSON.stringify(after, null, 2)}\n`);
const strip = (agent) => {
  const clone = structuredClone(agent);
  let cursor = clone;
  for (const key of path.slice(0, -1)) cursor = cursor[key];
  delete cursor[path.at(-1)];
  delete clone.updatedAt;
  return clone;
};
const otherUnchanged = sha(strip(before)) === sha(strip(after));
console.log(
  JSON.stringify({
    phase: 'readback',
    patchStatus: response.status,
    guardrailMatchesTarget: sha(getAt(after, path)) === sha(target),
    everythingElseUnchanged: otherUnchanged,
    instructionsSha: sha(after.instructions).slice(0, 8),
    toolsSha: sha(after.tools).slice(0, 8),
    status: after.status,
    beforePath,
    afterPath,
  }),
);
if (sha(getAt(after, path)) !== sha(target) || !otherUnchanged || after.status !== 'published') {
  throw new Error('Readback failed exact-match or unchanged-field checks; inspect receipts');
}
