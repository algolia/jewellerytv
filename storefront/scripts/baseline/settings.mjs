/* settings.mjs: the one place the baseline tools read configuration from.
 * These are the SAME settings the app uses (storefront/server/config.ts): the process environment first, then the
 * gitignored .env.local in the repository's primary checkout (credentials and agent identifiers are never committed;
 * on Vercel the same names are set as environment variables). The tools hold no agent identifier of their own. */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = execSync('git rev-parse --show-toplevel', { cwd: here, encoding: 'utf8' }).trim();
// A linked worktree has no .env.local of its own; the primary checkout does.
const primary =
  execSync('git worktree list --porcelain', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .find((line) => line.startsWith('worktree '))
    ?.slice(9) ?? root;

function readEnvFile(path) {
  const values = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

export function loadSettings() {
  const local = {
    ...readEnvFile(resolve(primary, '.env.local')),
    ...readEnvFile(resolve(root, '.env.local')),
  };
  const value = (name) => process.env[name] ?? local[name];
  const settings = {
    root,
    appId: value('ALGOLIA_APP_ID'),
    searchKey: value('ALGOLIA_SEARCH_API_KEY'),
    editKey:
      value('BLOG_INDEX_API_KEY') || value('ALGOLIA_AGENT_STUDIO_EDIT_API_KEY') || value('ALGOLIA_ADMIN_KEY'),
    devAgentId: value('JTV_CONCIERGE_DEVELOPMENT_AGENT_ID'),
    productionAgentId: value('JTV_CONCIERGE_PRODUCTION_AGENT_ID'),
  };
  const missing = ['appId', 'searchKey', 'devAgentId', 'productionAgentId'].filter((key) => !settings[key]);
  if (missing.length) {
    throw new Error(
      `Missing settings (${missing.join(', ')}). Set ALGOLIA_APP_ID, ALGOLIA_SEARCH_API_KEY, ` +
        'JTV_CONCIERGE_DEVELOPMENT_AGENT_ID and JTV_CONCIERGE_PRODUCTION_AGENT_ID in .env.local.',
    );
  }
  if (settings.devAgentId === settings.productionAgentId) {
    throw new Error(
      'JTV_CONCIERGE_DEVELOPMENT_AGENT_ID and JTV_CONCIERGE_PRODUCTION_AGENT_ID must name two different agents',
    );
  }
  return settings;
}
