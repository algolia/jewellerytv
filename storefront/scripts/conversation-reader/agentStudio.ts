import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { ConversationListSchema, ConversationSchema } from './schema.ts';

/**
 * Read-only Agent Studio client (brief A2). GET requests only, zero completions.
 * Credentials come from the repo root .env.local at run time and are never
 * printed, logged or written anywhere by this module.
 */

const DEFAULT_ENV_PATH = fileURLToPath(new URL('../../../.env.local', import.meta.url));
const LIVE_AGENT_ID = '0bdf59fe-e598-4db7-b139-2b93d5255bb4';

export interface AgentStudioCredentials {
  appId: string;
  apiKey: string;
}

export interface AgentStudioClient {
  listConversations(limit: number): Promise<z.infer<typeof ConversationListSchema>>;
  fetchConversation(conversationId: string): Promise<z.infer<typeof ConversationSchema>>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function loadCredentials(envPath: string = DEFAULT_ENV_PATH): AgentStudioCredentials {
  let text: string;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch (error: unknown) {
    throw new Error(`Could not read environment file ${envPath}: ${errorMessage(error)}`, {
      cause: error,
    });
  }
  const values = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    values.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim());
  }
  const missing: string[] = [];
  const appId = values.get('ALGOLIA_APP_ID');
  const apiKey = values.get('BLOG_INDEX_API_KEY');
  if (!appId) missing.push('ALGOLIA_APP_ID');
  if (!apiKey) missing.push('BLOG_INDEX_API_KEY');
  if (missing.length > 0) {
    throw new Error(`Missing required keys in ${envPath}: ${missing.join(', ')}`);
  }
  return { appId: appId ?? '', apiKey: apiKey ?? '' };
}

export const liveAgentId = LIVE_AGENT_ID;

export function createAgentStudioClient(
  credentials: AgentStudioCredentials,
  agentId: string,
): AgentStudioClient {
  if (!agentId) throw new Error('Agent id must not be empty');
  const base = `https://${credentials.appId}.algolia.net/agent-studio/1/agents/${agentId}`;

  async function getJson<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
  ): Promise<z.infer<Schema>> {
    const url = `${base}/${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'x-algolia-application-id': credentials.appId,
          'x-algolia-api-key': credentials.apiKey,
        },
      });
    } catch (error: unknown) {
      throw new Error(`Agent Studio GET ${path} failed before a response arrived`, {
        cause: error,
      });
    }
    if (!response.ok) {
      throw new Error(
        `Agent Studio GET ${path} failed: HTTP ${response.status} ${response.statusText}`,
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(await response.text());
    } catch (error: unknown) {
      throw new Error(`Agent Studio GET ${path} returned non-JSON body`, { cause: error });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new Error(`Agent Studio GET ${path} response did not match the boundary schema`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  return {
    listConversations: (limit: number) =>
      getJson(`conversations?limit=${limit}`, ConversationListSchema),
    fetchConversation: (conversationId: string) =>
      getJson(`conversations/${encodeURIComponent(conversationId)}`, ConversationSchema),
  };
}
