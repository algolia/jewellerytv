import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiServer } from '../../server/api';
import { createToolSheetCheck } from '../../server/concierge/toolSheetCheck';
import {
  APP_ANSWERED_TOOL_NAMES,
  appAnswersTool,
  toolNamesFromAgent,
  unansweredTools,
} from '../../shared/concierge/toolSheetGuard';
import { buildClientTools } from '../../src/concierge/clientTools';

describe('tool sheet comparison', () => {
  it('accepts the three-tool sheet this app answers', () => {
    expect(unansweredTools(['algolia_search_index', 'refresh_products', 'arrange_groups'])).toEqual([]);
  });

  it('accepts the runtime search tool name with an index suffix', () => {
    expect(appAnswersTool('algolia_search_index_prod_catalog')).toBe(true);
  });

  it('lists every declared tool the app cannot answer (the old production sheet)', () => {
    expect(
      unansweredTools(['update_shopping_state', 'retrieve_evidence', 'present_choices']),
    ).toEqual(['update_shopping_state', 'retrieve_evidence', 'present_choices']);
  });

  it('ignores tools the app answers but the agent does not declare', () => {
    expect(unansweredTools(['algolia_search_index'])).toEqual([]);
  });

  it('reads declared names from an agent record and rejects an unknown shape', () => {
    expect(toolNamesFromAgent({ tools: [{ name: 'a' }, { name: 'b' }] })).toEqual(['a', 'b']);
    expect(toolNamesFromAgent({ tools: 'nope' })).toBeNull();
    expect(toolNamesFromAgent(null)).toBeNull();
    expect(toolNamesFromAgent({})).toBeNull();
  });

  it('stays in step with the executors the app actually registers', () => {
    const registered = buildClientTools(async () => ({}));
    for (const name of APP_ANSWERED_TOOL_NAMES) expect(registered[name]?.onToolCall).toBeTypeOf('function');
    expect(Object.keys(registered).filter((n) => registered[n].onToolCall).sort()).toEqual(
      [...APP_ANSWERED_TOOL_NAMES].sort(),
    );
  });
});

const agentResponse = (names: string[]) =>
  new Response(JSON.stringify({ tools: names.map((name) => ({ name })) }), {
    headers: { 'content-type': 'application/json' },
  });

describe('tool sheet check', () => {
  it('reads the agent read-only with the search key and reports a match', async () => {
    const fetchSpy = vi.fn(async () => agentResponse(['algolia_search_index', 'refresh_products', 'arrange_groups']));
    const check = createToolSheetCheck({ appId: 'TEST123', apiKey: 'search-key', agentId: 'agent-1', fetch: fetchSpy });
    expect(await check.get()).toMatchObject({ status: 'match', unanswered: [] });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://TEST123.algolia.net/agent-studio/1/agents/agent-1');
    expect(init.method ?? 'GET').toBe('GET');
    expect((init.headers as Record<string, string>)['x-algolia-api-key']).toBe('search-key');
  });

  it('reports a mismatch naming the unanswered tools', async () => {
    const check = createToolSheetCheck({
      appId: 'TEST123', apiKey: 'k', agentId: 'agent-1', logger: () => {},
      fetch: async () => agentResponse(['update_shopping_state', 'arrange_groups']),
    });
    expect(await check.get()).toMatchObject({ status: 'mismatch', unanswered: ['update_shopping_state'] });
  });

  it('fails open when the agent cannot be read, and retries sooner than a known result', async () => {
    let now = 0;
    const fetchSpy = vi.fn(async () => new Response('nope', { status: 503 }));
    const check = createToolSheetCheck({
      appId: 'TEST123', apiKey: 'k', agentId: 'agent-1', fetch: fetchSpy, now: () => now, logger: () => {},
    });
    expect((await check.get()).status).toBe('unknown');
    await check.get();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    now += 11_000;
    await check.get();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('caches a known result and picks up a fixed sheet after the TTL', async () => {
    let now = 0;
    let names = ['retrieve_evidence'];
    const fetchSpy = vi.fn(async () => agentResponse(names));
    const check = createToolSheetCheck({
      appId: 'TEST123', apiKey: 'k', agentId: 'agent-1', fetch: fetchSpy, now: () => now, logger: () => {},
    });
    expect((await check.get()).status).toBe('mismatch');
    await check.get();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    names = ['algolia_search_index', 'refresh_products', 'arrange_groups'];
    now += 31_000;
    expect((await check.get()).status).toBe('match');
  });

  it('logs a mismatch once per distinct set of unanswered tools', async () => {
    let now = 0;
    const logger = vi.fn();
    const check = createToolSheetCheck({
      appId: 'TEST123', apiKey: 'k', agentId: 'agent-1', now: () => now, logger,
      fetch: async () => agentResponse(['retrieve_evidence']),
    });
    await check.get();
    now += 31_000;
    await check.get();
    expect(logger).toHaveBeenCalledTimes(1);
  });
});

const servers: ReturnType<typeof createApiServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

async function appWith(agentToolNames: string[] | 'unreadable', guard = true) {
  const upstream = vi.fn(async (input: string | URL | Request) => {
    const target = String(input);
    if (target.endsWith('/agent-studio/1/agents/development-agent')) {
      return agentToolNames === 'unreadable' ? new Response('down', { status: 503 }) : agentResponse(agentToolNames);
    }
    return new Response('data: {"type":"finish"}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  const server = createApiServer({
    appId: 'TEST123', apiKey: 'secret', developmentAgentId: 'development-agent',
    productionAgentId: 'production-agent', environment: 'development', fetch: upstream, toolSheetGuard: guard,
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const chat = () =>
    fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'conversation-1', messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }] }),
    });
  const health = () => fetch(`http://127.0.0.1:${port}/api/health`);
  return { upstream, chat, health };
}

describe('tool sheet guard on the API', () => {
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('refuses a chat turn with a labelled system error when the agent declares tools the app cannot answer', async () => {
    const spy = quiet();
    const { chat, upstream } = await appWith(['update_shopping_state', 'retrieve_evidence', 'present_choices']);
    const response = await chat();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'tool_sheet_mismatch',
      unanswered: ['update_shopping_state', 'retrieve_evidence', 'present_choices'],
    });
    expect(upstream.mock.calls.some(([u]) => String(u).includes('/completions'))).toBe(false);
    spy.mockRestore();
  });

  it('serves a chat turn when the sheet matches', async () => {
    const { chat } = await appWith(['algolia_search_index', 'refresh_products', 'arrange_groups']);
    expect((await chat()).status).toBe(200);
  });

  it('serves a chat turn when the agent cannot be read (fail open)', async () => {
    const spy = quiet();
    const { chat } = await appWith('unreadable');
    expect((await chat()).status).toBe(200);
    spy.mockRestore();
  });

  it('never calls the agent config when the guard is off', async () => {
    const { chat, upstream } = await appWith(['retrieve_evidence'], false);
    expect((await chat()).status).toBe(200);
    expect(upstream.mock.calls.some(([u]) => String(u).endsWith('/agents/development-agent'))).toBe(false);
  });

  it('reports the comparison on the health route', async () => {
    const spy = quiet();
    const { health } = await appWith(['retrieve_evidence']);
    expect(await (await health()).json()).toMatchObject({
      ok: true,
      toolSheet: { status: 'mismatch', unanswered: ['retrieve_evidence'] },
    });
    spy.mockRestore();
  });
});
