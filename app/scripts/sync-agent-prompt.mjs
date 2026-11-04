/* Pulls the dev agent's live prompt down and compares it with the one this
 * repository intends.
 *
 * `docs/agent/instructions.md` and `system-prompt.md` are the intended
 * prompt: hand-authored here, pasted into Agent Studio whole. This script
 * writes what the agent actually has beside them as `*.live.md` and says
 * whether the two match.
 *
 * It exists because they kept not matching. On 2026-11-04 the tracked
 * instructions were nine days and six paste blocks behind, and a block
 * believed to be applied turned out never to have reached the agent — twice.
 * A one-line verdict is cheaper than finding out from a reply.
 *
 * Read-only: a GET with the search key, no writes to the agent.
 *
 *   node scripts/sync-agent-prompt.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(here, '../.env'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
);
const appId = env.VITE_ALGOLIA_APP_ID;
const apiKey = env.VITE_ALGOLIA_SEARCH_API_KEY;
const agentId = env.VITE_JTV_AGENT_ID;
if (!appId || !apiKey || !agentId) {
  console.error('Missing VITE_ALGOLIA_APP_ID, VITE_ALGOLIA_SEARCH_API_KEY or VITE_JTV_AGENT_ID in app/.env');
  process.exit(1);
}

const response = await fetch(`https://${appId}.algolia.net/agent-studio/1/agents/${agentId}`, {
  headers: { 'x-algolia-application-id': appId, 'x-algolia-api-key': apiKey },
});
if (!response.ok) {
  console.error(`GET agent ${agentId}: ${response.status}`);
  process.exit(1);
}
const agent = await response.json();

/* Compared with whitespace at the ends collapsed, since a paste box tends to
 * add or drop a trailing newline and that is not a difference worth
 * reporting. */
const settle = (text) => String(text ?? '').replace(/\r\n/g, '\n').trimEnd();

const pairs = [
  ['instructions', 'docs/agent/instructions.md', agent.instructions],
  ['system prompt', 'docs/agent/system-prompt.md', agent.systemPrompt],
];

let drifted = false;
for (const [label, intendedPath, liveBody] of pairs) {
  const livePath = intendedPath.replace(/\.md$/, '.live.md');
  writeFileSync(resolve(here, '..', livePath), settle(liveBody) + '\n');

  let intended = null;
  try {
    intended = settle(readFileSync(resolve(here, '..', intendedPath), 'utf8'));
  } catch {
    console.log(`${label}: no intended copy at ${intendedPath}`);
    continue;
  }
  const live = settle(liveBody);
  if (intended === live) {
    console.log(`${label}: MATCHES  (${live.length.toLocaleString()} chars)`);
    continue;
  }
  drifted = true;
  console.log(
    `${label}: DIFFERS  intended ${intended.length.toLocaleString()} chars, ` +
      `live ${live.length.toLocaleString()} chars`,
  );
  console.log(`  diff: git diff --no-index ${livePath} ${intendedPath}`);
}

console.log(`agent ${agent.id} · model ${agent.model?.id ?? agent.model ?? 'unknown'} · updated ${agent.updatedAt}`);
if (drifted) {
  console.log('\nPaste the intended file into Agent Studio, then run this again.');
  process.exitCode = 1;
}
