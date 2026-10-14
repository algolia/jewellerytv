import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiServer } from '../server/api';

/**
 * Turn-deadline contract for the chat transport (timeout lane, 2026-10-13).
 *
 * A shopper turn must never be held open by a silent upstream. The battery
 * harness waits 68s per turn; the server previously bounded an upstream leg
 * only with the 180s request abort, so a hung Agent Studio completion (no
 * headers, or headers followed by silence) kept the turn open far past any
 * acceptable wait. These tests pin the two honest deadlines:
 *   - time to upstream response headers, then the existing pre-headers retry
 *     and the honest 502 path;
 *   - inter-chunk stall while the SSE stream is being piped, then the existing
 *     honest mid-stream error chunk plus [DONE].
 * Both deadlines are injected short here; production defaults live in api.ts.
 */

const servers: ReturnType<typeof createApiServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  vi.useRealTimers();
});

function chatBody() {
  return {
    id: 'conversation-deadline',
    messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }],
  };
}

async function setup(options: {
  upstreamHeadersTimeoutMs?: number;
  upstreamStallTimeoutMs?: number;
  upstream: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}) {
  const server = createApiServer({
    appId: 'TEST123',
    apiKey: 'secret',
    developmentAgentId: 'development-agent',
    productionAgentId: 'production-agent',
    environment: 'development',
    fetch: options.upstream as typeof fetch,
    ...(options.upstreamHeadersTimeoutMs !== undefined
      ? { upstreamHeadersTimeoutMs: options.upstreamHeadersTimeoutMs }
      : {}),
    ...(options.upstreamStallTimeoutMs !== undefined
      ? { upstreamStallTimeoutMs: options.upstreamStallTimeoutMs }
      : {}),
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

const post = (url: string) =>
  fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(chatBody()),
  });

describe('chat upstream turn deadlines', () => {
  it('answers 502 promptly when upstream headers never arrive, after one retry', async () => {
    const upstream = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted while pending')),
          );
        }),
    );
    const url = await setup({ upstreamHeadersTimeoutMs: 250, upstream });
    const started = Date.now();
    const response = await post(url);
    const elapsed = Date.now() - started;
    // Two attempts (one retry) at 250ms each must finish far inside the old
    // 180s abort and inside the harness's 68s turn budget.
    expect(elapsed).toBeLessThan(10_000);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'Upstream connection failed' });
    expect(upstream).toHaveBeenCalledTimes(2);
  }, 20_000);

  it('keeps the pre-headers retry when the first attempt only breaches the headers deadline', async () => {
    const upstream = vi
      .fn<
        (input: string | URL | Request, init?: RequestInit) => Promise<Response>
      >()
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('slow headers')));
          }),
      )
      .mockResolvedValueOnce(
        new Response('data: {"type":"start"}\n\ndata: [DONE]\n\n', {
          headers: { 'content-type': 'text/event-stream' },
        }),
      );
    const url = await setup({ upstreamHeadersTimeoutMs: 250, upstream });
    const response = await post(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('[DONE]');
    expect(upstream).toHaveBeenCalledTimes(2);
  }, 20_000);

  it('ends a stalled chat stream with the honest error chunk instead of hanging open', async () => {
    const upstream = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"type":"start"}\n\n'));
              // Never enqueues again and never closes: a silent upstream.
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const url = await setup({ upstreamStallTimeoutMs: 250, upstream });
    const started = Date.now();
    const response = await post(url);
    expect(response.status).toBe(200);
    const text = await response.text();
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(10_000);
    expect(text).toContain('"type":"error"');
    expect(text).toContain('[DONE]');
  }, 20_000);

  it('streams a healthy upstream unchanged with both deadlines configured', async () => {
    const upstream = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"type":"start"}\n\n'));
              setTimeout(() => {
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                controller.close();
              }, 120);
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const url = await setup({
      upstreamHeadersTimeoutMs: 15_000,
      upstreamStallTimeoutMs: 30_000,
      upstream,
    });
    const response = await post(url);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"type":"start"');
    expect(text).toContain('[DONE]');
    expect(text).not.toContain('"type":"error"');
  }, 20_000);
});
