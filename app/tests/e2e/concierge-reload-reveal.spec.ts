import { expect, test } from '@playwright/test';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApiServer } from '../../server/api.js';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';

// Bounded fixture run: real headless browser against the real chat handler and
// Vite app, with a stubbed upstream agent stream. Verifies the Lane A P0 fix
// for restored completed answers: a completed turn survives a page reload and
// is revealed after the SDK hydrates the transcript. No paid upstream request.
const line = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const encoder = new TextEncoder();

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fixture port');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function fixture() {
  const apiPort = await freePort();
  const webPort = await freePort();
  const chats: Array<{ round: number; messageIds: string[] }> = [];
  let round = 0;
  const api = createApiServer({
    appId: 'FixtureApp',
    apiKey: 'fixture-only',
    environment: 'development',
    developmentAgentId: 'fixture-agent',
    fetch: async (input, init) => {
      if (!String(input).includes('/agent-studio/')) {
        const empty = {
          hits: [],
          nbHits: 0,
          page: 0,
          nbPages: 0,
          hitsPerPage: 20,
          processingTimeMS: 0,
          query: '',
          params: '',
          facets: {},
        };
        return new Response(JSON.stringify({ ...empty, results: [empty] }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      round++;
      const parsed = JSON.parse(String(init?.body ?? '')) as { messages?: Array<{ id: string }> };
      chats.push({ round, messageIds: (parsed.messages ?? []).map((m) => m.id) });
      const events =
        round === 1
          ? [
              { type: 'start', messageId: 'assistant-fixture' },
              {
                type: 'tool-input-available',
                toolName: 'update_shopping_state',
                toolCallId: 'call-fixture-state',
                input: {
                  operations: [
                    {
                      action: 'add',
                      factIds: [],
                      fact: {
                        field: 'recipient',
                        value: { kind: 'text', text: 'Dad' },
                        scope: { kind: 'mission', key: null },
                        strength: 'context',
                        certainty: 'explicit',
                      },
                      sourceQuote: 'Dad',
                    },
                  ],
                },
              },
              { type: 'finish' },
            ]
          : [
              { type: 'start', messageId: 'assistant-fixture' },
              { type: 'text-start', id: 'text-fixture' },
              { type: 'text-delta', id: 'text-fixture', delta: 'Tell me what Dad enjoys wearing.' },
              { type: 'text-end', id: 'text-fixture' },
              { type: 'finish' },
            ];
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const event of events) controller.enqueue(encoder.encode(line(event)));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
      });
    },
  });
  await new Promise<void>((resolve) => api.listen(apiPort, '127.0.0.1', resolve));
  const vite = await createViteServer({
    configFile: false,
    root: process.cwd(),
    plugins: [react()],
    server: {
      host: 'localhost',
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${apiPort}`,
          configure(proxy) {
            proxy.on('proxyReq', (request) => {
              // The real API accepts the fixed 5173 development Origin only.
              request.setHeader('origin', 'http://localhost:5173');
            });
          },
        },
      },
    },
  });
  await vite.listen();
  return {
    baseURL: `http://localhost:${webPort}`,
    chats,
    close: async () => {
      await vite.close();
      await new Promise<void>((resolve) => api.close(() => resolve()));
    },
  };
}

test('a completed turn is visible again after a page reload', async ({ browser }) => {
  test.setTimeout(120_000);
  const service = await fixture();
  const context = await browser.newContext();
  const page = await context.newPage();
  const output = path.resolve(`.checkpoint/runs/lane-a-reload-reveal-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}`);
  await mkdir(output, { recursive: true });
  try {
    await page.goto(service.baseURL);
    await page.getByRole('button', { name: 'Open jewelry Concierge' }).click();
    const panel = page.getByRole('complementary', { name: 'Jewelry buying Concierge' });
    const input = panel.getByRole('textbox', { name: 'Message the Concierge' });
    await input.fill('Dad needs a gift.');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => service.chats.length).toBe(2);
    await expect(input).toBeEnabled({ timeout: 25_000 });
    const replyText = panel.locator('.connected-assistant-message');
    await expect(replyText.last()).toContainText('Tell me what Dad enjoys wearing.');
    const beforeReload = {
      replies: await replyText.allTextContents(),
      notices: await panel.locator('.connected-system-notice').allTextContents(),
      sessionStorage: await page.evaluate(() => ({ ...sessionStorage })),
    };
    const completedKey = Object.keys(beforeReload.sessionStorage).find((key) =>
      key.startsWith('jtv-concierge-completed-'),
    );
    expect(completedKey).toBeTruthy();
    expect(JSON.parse(beforeReload.sessionStorage[completedKey!])).toMatchObject({
      version: 1,
      assistantMessageIds: expect.arrayContaining(['assistant-fixture']),
    });
    await page.screenshot({ path: path.join(output, 'before-reload.png'), fullPage: true });

    await page.reload();

    // The widget starts closed after a reload; reopen it before checking the
    // restored transcript. The SDK hydrates during widget init, which can land
    // after the first reconciliation run, so poll until the answer is revealed.
    await page.getByRole('button', { name: 'Open jewelry Concierge' }).click();
    const panelAfter = page.getByRole('complementary', { name: 'Jewelry buying Concierge' });
    await expect(
      panelAfter.locator('.connected-assistant-message').filter({
        hasText: 'Tell me what Dad enjoys wearing.',
      }),
    ).toBeVisible({ timeout: 20_000 });
    const afterReload = {
      replies: await panelAfter.locator('.connected-assistant-message').allTextContents(),
      notices: await panelAfter.locator('.connected-system-notice').allTextContents(),
      sessionStorage: await page.evaluate(() => ({ ...sessionStorage })),
    };
    const evidence = { beforeReload, afterReload, chats: service.chats };
    await page.screenshot({ path: path.join(output, 'after-reload.png'), fullPage: true });
    await writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
    console.log(`RELOAD_REVEAL_EVIDENCE=${output}`);

    expect(afterReload.replies.join(' ')).toContain('Tell me what Dad enjoys wearing.');
    expect(
      afterReload.notices.join(' '),
    ).not.toContain('did not produce a complete response');
    const keyAfter = Object.keys(afterReload.sessionStorage).find((key) =>
      key.startsWith('jtv-concierge-completed-'),
    );
    expect(keyAfter).toBeTruthy();
    expect(JSON.parse(afterReload.sessionStorage[keyAfter!])).toMatchObject({
      version: 1,
      assistantMessageIds: expect.arrayContaining(['assistant-fixture']),
    });
  } finally {
    await context.close();
    await service.close();
  }
});
