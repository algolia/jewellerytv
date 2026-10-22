import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const agentIdPattern = /^[A-Za-z0-9-]{1,100}$/;

type AgentEnvironment = 'development' | 'production';

export type AgentIdentityConfig = {
  developmentAgentId?: string;
  productionAgentId?: string;
  environment: AgentEnvironment;
};

export function assertAgentIdentityBoundary(config: AgentIdentityConfig) {
  const validate = (name: string, value: string | undefined) => {
    if (value && !agentIdPattern.test(value)) {
      throw new Error(`${name} must be a valid Agent Studio identity`);
    }
  };

  validate('JTV_CONCIERGE_DEVELOPMENT_AGENT_ID', config.developmentAgentId);
  validate('JTV_CONCIERGE_PRODUCTION_AGENT_ID', config.productionAgentId);
  // Local development and the hosted site must never share an agent: a shared
  // agent sends local test turns to production conversations. The hosted site
  // sets only the production identity, so this only compares when both are set.
  if (config.developmentAgentId && config.developmentAgentId === config.productionAgentId) {
    throw new Error(
      'JTV_CONCIERGE_DEVELOPMENT_AGENT_ID and JTV_CONCIERGE_PRODUCTION_AGENT_ID must name two different agents',
    );
  }
}

function readLocalEnvironment() {
  const local: Record<string, string> = {};
  try {
    const path = fileURLToPath(new URL('../../.env.local', import.meta.url));
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) local[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    // Environment-only use is supported.
  }
  return local;
}

export function loadConfig() {
  const local = readLocalEnvironment();
  const value = (name: string) => process.env[name] ?? local[name];
  const appId = value('ALGOLIA_APP_ID');
  const apiKey = value('ALGOLIA_SEARCH_API_KEY');
  if (!appId || !apiKey) {
    throw new Error(
      'Set ALGOLIA_APP_ID and ALGOLIA_SEARCH_API_KEY in the root .env.local or server environment',
    );
  }

  const developmentAgentId = value('JTV_CONCIERGE_DEVELOPMENT_AGENT_ID');
  const productionAgentId = value('JTV_CONCIERGE_PRODUCTION_AGENT_ID');
  const environment: AgentEnvironment =
    process.env.NODE_ENV === 'production' ? 'production' : 'development';
  assertAgentIdentityBoundary({ developmentAgentId, productionAgentId, environment });
  return {
    appId,
    apiKey,
    environment,
    developmentAgentId,
    productionAgentId,
  };
}
