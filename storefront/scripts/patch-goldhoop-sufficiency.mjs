#!/usr/bin/env node
/**
 * Gold-hoop sufficiency repair: single-field PATCH to the published Concierge
 * agent (0bdf59fe-e598-4db7-b139-2b93d5255bb4), one field per invocation.
 *
 *   node scripts/patch-goldhoop-sufficiency.mjs --field instructions
 *   node scripts/patch-goldhoop-sufficiency.mjs --field tools
 *   ... add --execute to write; without it, preflight only.
 *   ... add --rollback to restore the recorded pre-repair bytes.
 *
 * Gates: live status must be published, the live field must byte-match the
 * recorded rollback file, and after the PATCH the immediate GET must return
 * the candidate bytes with every other top-level field unchanged. Keys are
 * read from a key file passed via --key-file or the environment; they are
 * never printed, logged or written into receipts.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packageDir = resolve(
  root,
  'docs/config/concierge-development/candidates/gold-hoop-typed-color-v2-2026-10-14',
);
const agentId = '0bdf59fe-e598-4db7-b139-2b93d5255bb4';

const fieldFlag = process.argv.indexOf('--field');
const field = fieldFlag < 0 ? null : process.argv[fieldFlag + 1];
if (field !== 'instructions' && field !== 'tools') {
  throw new Error('Pass --field instructions or --field tools');
}
const execute = process.argv.includes('--execute');
const rollback = process.argv.includes('--rollback');
const sha = (text) => createHash('sha256').update(text).digest('hex');

function readEnvFile(path) {
  const values = {};
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    return values;
  }
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

const local = {
  ...readEnvFile(resolve(root, '.env.local')),
  ...readEnvFile(resolve(root, 'storefront/.env.local')),
};
const getValue = (name) => process.env[name] ?? local[name];
const appId = getValue('ALGOLIA_APP_ID');
const readKey = getValue('ALGOLIA_SEARCH_API_KEY');
const keyFileFlag = process.argv.indexOf('--key-file');
const keyFile = keyFileFlag < 0 ? null : process.argv[keyFileFlag + 1];
const editKey =
  (keyFile ? readFileSync(keyFile, 'utf8').trim() : '') ||
  getValue('ALGOLIA_AGENT_STUDIO_EDIT_API_KEY') ||
  getValue('ALGOLIA_ADMIN_KEY') ||
  getValue('CONCIERGE_AGENT_AUTHENTICATION_KEY');
if (!appId || !readKey) throw new Error('Missing read-only Agent Studio API credentials');

const endpoint = `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}`;
const readHeaders = { 'x-algolia-application-id': appId, 'x-algolia-api-key': readKey };
const editHeaders = {
  'x-algolia-application-id': appId,
  'x-algolia-api-key': editKey,
  accept: 'application/json',
  'content-type': 'application/json',
};

async function getAgent() {
  const response = await fetch(endpoint, { headers: readHeaders, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Agent GET failed with HTTP ${response.status}`);
  return response.json();
}

function otherFields(agent, patchedField) {
  return Object.fromEntries(
    ['id', 'name', 'description', 'providerId', 'model', 'instructions', 'systemPrompt', 'config', 'tools', 'templateType', 'status']
      .filter((key) => key !== patchedField)
      .map((key) => [key, agent[key]]),
  );
}

const rollbackPath =
  field === 'instructions'
    ? resolve(packageDir, 'rollback-instructions.txt')
    : resolve(packageDir, 'rollback-tools.json');
const candidatePath =
  field === 'instructions'
    ? resolve(packageDir, 'agent-instructions.candidate.txt')
    : resolve(packageDir, 'agent-tools.candidate.json');

const rollbackRaw = readFileSync(rollbackPath, 'utf8');
const candidateRaw = readFileSync(candidatePath, 'utf8');
const rollbackValue = field === 'tools' ? JSON.parse(rollbackRaw) : rollbackRaw;
const candidateValue = field === 'tools' ? JSON.parse(candidateRaw) : candidateRaw;
const bytesEqual = (a, b) =>
  field === 'tools' ? JSON.stringify(a) === JSON.stringify(b) : a === b;

const before = await getAgent();
const beforeSerialized = field === 'tools' ? JSON.stringify(before[field]) : before[field];
console.log(
  JSON.stringify({
    phase: 'preflight',
    field,
    agentId,
    status: before.status,
    liveFieldSha256: sha(beforeSerialized),
    rollbackFieldSha256: sha(field === 'tools' ? JSON.stringify(rollbackValue) : rollbackRaw),
    candidateFieldSha256: sha(field === 'tools' ? JSON.stringify(candidateValue) : candidateRaw),
    liveMatchesRollback: bytesEqual(before[field], rollbackValue),
    editCredentialPresent: Boolean(editKey),
    execute,
    rollback,
  }),
);
if (before.id !== agentId || before.status !== 'published') {
  throw new Error('Agent identity or status changed; no write attempted');
}
if (!bytesEqual(before[field], rollbackValue)) {
  throw new Error(`Live ${field} differ from the recorded rollback bytes; no write attempted`);
}
if (!execute) process.exit(0);
if (!editKey) throw new Error('Missing editSettings credential; no write attempted');

const toValue = rollback ? rollbackValue : candidateValue;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const beforePath = resolve(import.meta.dirname, `${rollback ? 'rollback-' : ''}${field}-${stamp}-before.json`);
const afterPath = resolve(import.meta.dirname, `${rollback ? 'rollback-' : ''}${field}-${stamp}-after.json`);
writeFileSync(beforePath, `${JSON.stringify(before, null, 2)}\n`);

const patchResponse = await fetch(endpoint, {
  method: 'PATCH',
  headers: editHeaders,
  body: JSON.stringify({ [field]: toValue }),
  redirect: 'error',
  signal: AbortSignal.timeout(30000),
});
if (!patchResponse.ok) {
  throw new Error(`${field} PATCH failed with HTTP ${patchResponse.status}; before snapshot: ${beforePath}`);
}
const patched = await patchResponse.json();
if (!bytesEqual(patched[field], toValue)) {
  throw new Error(`PATCH response ${field} mismatch; before snapshot: ${beforePath}`);
}
let after;
for (let attempt = 0; attempt < 5; attempt++) {
  after = await getAgent();
  if (bytesEqual(after[field], toValue)) break;
  await new Promise((wait) => setTimeout(wait, 500));
}
writeFileSync(afterPath, `${JSON.stringify(after, null, 2)}\n`);
const stable = JSON.stringify(otherFields(before, field)) === JSON.stringify(otherFields(after, field));
console.log(
  JSON.stringify({
    phase: 'readback',
    field,
    beforePath,
    afterPath,
    patchStatus: patchResponse.status,
    afterMatchesCandidate: bytesEqual(after[field], toValue),
    otherFieldsUnchanged: stable,
    status: after.status,
  }),
);
if (!bytesEqual(after[field], toValue) || !stable || after.status !== 'published') {
  throw new Error('Readback did not satisfy exact field and unchanged-field checks; inspect receipt');
}
