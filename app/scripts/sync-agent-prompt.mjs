/* Pulls the dev agent's instructions and system prompt into the tracked tree.
 *
 * Both are edited by hand in Agent Studio, so the copies in this repository
 * drift the moment a paste block is applied — on 2026-11-04 the tracked
 * instructions were nine days and six applied blocks behind the live agent,
 * which made every reading of them unreliable. Run this after pasting
 * anything, and the diff shows exactly what changed.
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

const header = (what) =>
  `<!-- Pulled from the live dev agent by scripts/sync-agent-prompt.mjs.\n` +
  `     Do not edit here: edit in Agent Studio and re-run the script.\n` +
  `     Agent ${agent.id} · model ${agent.model?.id ?? agent.model ?? 'unknown'} · updated ${agent.updatedAt} -->\n\n` +
  `# ${what}\n\n`;

const targets = [
  ['docs/agent/instructions.md', 'Agent instructions', agent.instructions],
  ['docs/agent/system-prompt.md', 'Agent system prompt', agent.systemPrompt],
];
for (const [path, title, body] of targets) {
  if (typeof body !== 'string') {
    console.error(`${path}: agent has no ${title.toLowerCase()}`);
    continue;
  }
  writeFileSync(resolve(here, '..', path), header(title) + body.trimEnd() + '\n');
  console.log(`${path}  ${body.length.toLocaleString()} chars`);
}
console.log(`updated ${agent.updatedAt}`);
