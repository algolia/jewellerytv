import { expect, test } from '@playwright/test';
import { createServer } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApiServer } from '../../server/api.js';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';

// Craig Task 08 density check, fixture run (no paid agent turn). Boots the real
// app (own API + Vite on free ports) with a stubbed upstream agent stream and a
// browser-level evidence interception, then renders a diamond-hoop shopping
// turn with three earring groups and verifies the editorial contract: the chat
// pane shows exactly the streamed prose (no app-authored additions), cards
// carry name, price and stock without a second specification list, and the
// layout stays readable at desktop 1440 and narrow 375 with no horizontal
// overflow. Product records are deterministic synthetic fixtures shaped like
// the live prod_catalog projection; they are not live data.
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

type FixtureRecord = {
  objectID: string;
  Catalog_TitleDescription: string;
  Catalog_LongDescription: string;
  Catalog_ProductType: string;
  Catalog_EarringType: string[];
  Catalog_Condition: string;
  Inventory_InStock: boolean;
  Pricing_ActivePrice: number;
  Pricing_PriceLabelName: string;
  Media_Images: string[];
};

const hoopRecords: FixtureRecord[] = [
  {
    objectID: 'FIXHOOP1',
    Catalog_TitleDescription: 'White Lab-Grown Diamond Rhodium Over Sterling Silver Hoop Earrings 0.50ctw',
    Catalog_LongDescription: 'Fixture record for the density check. Inside-out hoop style.',
    Catalog_ProductType: 'Earrings',
    Catalog_EarringType: ['Hoop'],
    Catalog_Condition: 'First Quality',
    Inventory_InStock: true,
    Pricing_ActivePrice: 348.99,
    Pricing_PriceLabelName: 'Online Exclusive Price',
    Media_Images: [],
  },
  {
    objectID: 'FIXHOOP2',
    Catalog_TitleDescription: 'White Lab-Grown Diamond 14k Yellow Gold Over Sterling Silver Hoop Earrings 0.33ctw',
    Catalog_LongDescription: 'Fixture record for the density check. Classic round hoop.',
    Catalog_ProductType: 'Earrings',
    Catalog_EarringType: ['Hoop'],
    Catalog_Condition: 'First Quality',
    Inventory_InStock: true,
    Pricing_ActivePrice: 209.99,
    Pricing_PriceLabelName: 'Online Exclusive Price',
    Media_Images: [],
  },
  {
    objectID: 'FIXHUG1',
    Catalog_TitleDescription: 'White Lab-Grown Diamond G-H VS 14K Yellow Gold Over Sterling Silver Huggie Earrings 0.40ctw',
    Catalog_LongDescription: 'Fixture record for the density check. Snug huggie profile.',
    Catalog_ProductType: 'Earrings',
    Catalog_EarringType: ['Huggie'],
    Catalog_Condition: 'First Quality',
    Inventory_InStock: true,
    Pricing_ActivePrice: 892.99,
    Pricing_PriceLabelName: 'Online Exclusive Price',
    Media_Images: [],
  },
  {
    objectID: 'FIXHUG2',
    Catalog_TitleDescription: 'White Lab-Grown Diamond 10K White Gold Huggie Earrings 0.25ctw',
    Catalog_LongDescription: 'Fixture record for the density check. Everyday huggie.',
    Catalog_ProductType: 'Earrings',
    Catalog_EarringType: ['Huggie'],
    Catalog_Condition: 'First Quality',
    Inventory_InStock: false,
    Pricing_ActivePrice: 524.99,
    Pricing_PriceLabelName: 'Online Exclusive Price',
    Media_Images: [],
  },
  {
    objectID: 'FIXIO1',
    Catalog_TitleDescription: 'White Lab-Grown Diamond H SI1 Rhodium Over Sterling Silver Inside-Out Earrings 0.45ctw',
    Catalog_LongDescription: 'Fixture record for the density check. Inside-out setting.',
    Catalog_ProductType: 'Earrings',
    Catalog_EarringType: ['Inside-Out'],
    Catalog_Condition: 'First Quality',
    Inventory_InStock: true,
    Pricing_ActivePrice: 337.99,
    Pricing_PriceLabelName: 'Online Exclusive Price',
    Media_Images: [],
  },
  {
    objectID: 'FIXIO2',
    Catalog_TitleDescription: 'White Lab-Grown Diamond G-H VS Inside-Out Earrings 0.60ctw',
    Catalog_LongDescription: 'Fixture record for the density check. Stones front and back.',
    Catalog_ProductType: 'Earrings',
    Catalog_EarringType: ['Inside-Out'],
    Catalog_Condition: 'First Quality',
    Inventory_InStock: true,
    Pricing_ActivePrice: 674.99,
    Pricing_PriceLabelName: 'Online Exclusive Price',
    Media_Images: [],
  },
];

const evidenceRef = (objectID: string) =>
  `prod_catalog/${objectID}/${objectID.toLowerCase()}-fixture-content-hash`;

const fixturePayload = {
  status: 'ok',
  source: 'prod_catalog',
  missionId: 'ECHO',
  revision: 0,
  turnId: 'ECHO',
  expectedRevision: 0,
  effectiveFilters: [],
  unresolved: [],
  records: hoopRecords.map((record) => ({
    source: 'prod_catalog',
    objectID: record.objectID,
    contentHash: `${record.objectID.toLowerCase()}-fixture-content-hash`,
    retrievedAt: '2026-10-13T00:00:00.000Z',
    evidenceRef: evidenceRef(record.objectID),
    record,
  })),
};

// Deliberately dense reply in the shape Craig flagged: the prose walks item
// specifications the adjacent cards already carry. The density fix is agent
// instruction guidance; this fixture measures how the app renders that shape.
const denseReply = [
  'Diamond hoop earrings are a lovely gift, and there are three styles worth knowing before you choose.',
  '',
  'Classic hoops are the everyday choice: round circles that swing freely, usually 20 to 30 millimeters across, with a hinged post closure, often rhodium over sterling silver or 14k yellow gold over sterling silver, and the pair above carries 0.50ctw of lab-grown diamonds for $348.99 while the second pair carries 0.33ctw for $209.99.',
  '',
  'Huggies sit snug against the lobe with a small diameter, usually 8 to 12 millimeters, and a snap closure, so they do not catch on clothing; the certified pair above lists 0.40ctw at $892.99 and the white gold pair lists 0.25ctw at $524.99.',
  '',
  'Inside-out hoops set stones on both the front and the back of the hoop, with the same hinged closure as classic hoops, so they sparkle from every angle; the pair above carries 0.45ctw at $337.99 and the second carries 0.60ctw at $674.99.',
  '',
  'All six pairs are lab-grown diamond earrings. Tell me which direction feels right and I can narrow the options further.',
].join('\n');

const groups = [
  {
    basis: { attribute: 'Catalog_EarringType', value: 'Hoop' },
    items: [
      {
        evidenceRef: evidenceRef('FIXHOOP1'),
        quantity: 1,
        componentSlot: 'pair',
        explanation: 'Everyday classic hoop in rhodium over sterling silver.',
      },
      {
        evidenceRef: evidenceRef('FIXHOOP2'),
        quantity: 1,
        componentSlot: 'pair',
        explanation: 'Warm gold-over-silver hoop at the friendly end of the budget.',
      },
    ],
  },
  {
    basis: { attribute: 'Catalog_EarringType', value: 'Huggie' },
    items: [
      {
        evidenceRef: evidenceRef('FIXHUG1'),
        quantity: 1,
        componentSlot: 'pair',
        explanation: 'Certified stones in a snug huggie profile.',
      },
      {
        evidenceRef: evidenceRef('FIXHUG2'),
        quantity: 1,
        componentSlot: 'pair',
        explanation: 'White gold huggie for everyday wear.',
      },
    ],
  },
  {
    basis: { attribute: 'Catalog_EarringType', value: 'Inside-Out' },
    items: [
      {
        evidenceRef: evidenceRef('FIXIO1'),
        quantity: 1,
        componentSlot: 'pair',
        explanation: 'Inside-out setting that sparkles from every angle.',
      },
      {
        evidenceRef: evidenceRef('FIXIO2'),
        quantity: 1,
        componentSlot: 'pair',
        explanation: 'The largest stone weight of the three directions.',
      },
    ],
  },
];

async function fixture() {
  const apiPort = await freePort();
  const webPort = await freePort();
  const chats: Array<{ turn: number; step: number; toolCalls: string[] }> = [];
  let turn = 0;
  let step = 0;
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
      let toolCalls: string[] = [];
      let hasToolParts = false;
      try {
        const parsed = JSON.parse(String(init?.body ?? '')) as {
          messages?: Array<{ parts?: Array<{ type?: string }> }>;
        };
        toolCalls = (parsed.messages ?? []).flatMap((m) =>
          (m.parts ?? [])
            .filter((p) => (p.type ?? '').startsWith('tool-'))
            .map((p) => (p.type ?? '').replace('tool-', '')),
        );
        hasToolParts = toolCalls.length > 0;
      } catch {
        toolCalls = [];
        hasToolParts = false;
      }
      // A post whose transcript carries no tool results starts a new turn.
      if (!hasToolParts) {
        turn++;
        step = 0;
      }
      step++;
      chats.push({ turn, step, toolCalls });
      let events: Array<Record<string, unknown>> = [];
      if (step === 1) {
        events = [
          { type: 'start', messageId: 'assistant-density' },
          {
            type: 'tool-input-available',
            toolName: 'retrieve_evidence',
            toolCallId: 'call-density-retrieve',
            input: {
              source: 'prod_catalog',
              query: 'diamond hoop earrings',
              count: 8,
              target: null,
            },
          },
          { type: 'finish' },
        ];
      } else if (step === 2) {
        events = [
          { type: 'start', messageId: 'assistant-density-2' },
          {
            type: 'tool-input-available',
            toolName: 'present_choices',
            toolCallId: 'call-density-present',
            input: {
              body: {
                kind: 'product_groups',
                groups,
                alternatives: null,
              },
            },
          },
          { type: 'finish' },
        ];
      } else {
        events = [
          { type: 'start', messageId: 'assistant-density-3' },
          { type: 'text-start', id: 'text-density' },
          { type: 'text-delta', id: 'text-density', delta: denseReply },
          { type: 'text-end', id: 'text-density' },
          { type: 'finish' },
        ];
      }
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

async function measureAndShoot(page: import('@playwright/test').Page, label: string, output: string) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true });
  const cards = await page.locator('.pw-product--discover').evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute('data-product-id'),
      hasSpecList: element.querySelector('dl') !== null,
      hasCompareTable: element.querySelector('.pw-compare-attributes') !== null,
      text: (element.textContent ?? '').slice(0, 300),
    })),
  );
  const replyText = (
    await page.locator('.connected-assistant-message').allTextContents()
  ).join('\n');
  const groupHeadings = await page.locator('.pw-discovery-group h3').allTextContents();
  return { overflow, cards, replyText, groupHeadings };
}

test('a dense hoop shopping turn renders without duplicate card specifications or overflow', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const service = await fixture();
  const output = path.resolve(
    '.checkpoint/runs/bella-density-2026-10-13/screenshots',
  );
  await mkdir(output, { recursive: true });
  const consoleErrors: string[] = [];
  try {
    // Desktop 1440 pass.
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await desktop.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    // The browser supplies evidence results; the route echoes the session's
    // mission, revision and turn so the ledger accepts the records.
    await page.route('**/api/agent-evidence', async (route) => {
      const request = route.request().postDataJSON() as {
        input: { missionId: string; expectedRevision: number; turnId: string };
      };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...fixturePayload,
          missionId: request.input.missionId,
          revision: request.input.expectedRevision,
          turnId: request.input.turnId,
        }),
      });
    });
    await page.goto(service.baseURL);
    await page.getByRole('button', { name: 'Open jewelry concierge' }).click();
    const panel = page.getByRole('complementary', { name: 'Jewelry buying concierge' });
    const input = panel.getByRole('textbox', { name: 'Message the Concierge' });
    await input.fill(
      'I am trying to find diamond hoop earrings for a gift. What are some of the most popular styles under $1000?',
    );
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => service.chats.length).toBe(3);
    await expect(input).toBeEnabled({ timeout: 25_000 });
    await expect(panel.locator('.connected-assistant-message').last()).toContainText(
      'three styles worth knowing',
    );
    await expect(panel.locator('.pw-discovery-group')).toHaveCount(3);
    await expect(panel.locator('.pw-product--discover')).toHaveCount(6);
    const desktopEvidence = await measureAndShoot(page, 'desktop-1440-hoop-reply', output);
    expect(desktopEvidence.overflow.scrollWidth).toBeLessThanOrEqual(
      desktopEvidence.overflow.innerWidth,
    );
    for (const card of desktopEvidence.cards) {
      expect(card.hasSpecList, `card ${card.id} must not render a spec list`).toBe(false);
      expect(card.hasCompareTable, `card ${card.id} must not render a comparison table`).toBe(
        false,
      );
    }
    // Group headings come from the catalogue basis, derived by the app.
    expect(desktopEvidence.groupHeadings).toHaveLength(3);
    // The app renders the streamed prose and adds no shopper-facing speech:
    // after whitespace normalization and the fixed Concierge message label,
    // the rendered text equals the fixture exactly.
    const squash = (value: string) => value.replace(/\s+/g, '');
    expect(squash(desktopEvidence.replyText).replace(/^Concierge/, '')).toBe(
      squash(denseReply),
    );
    // Card copy carries name, price and stock, not a second specification walk.
    const firstCard = desktopEvidence.cards.find((card) => card.id === 'FIXHOOP1');
    expect(firstCard?.text).toContain('$348.99');
    expect(firstCard?.text).toContain('In stock');
    expect(firstCard?.text).not.toContain('millimeters');
    await desktop.close();

    // Narrow 375 pass: same fixture, real stacked layout.
    const narrow = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const pageNarrow = await narrow.newPage();
    pageNarrow.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await pageNarrow.route('**/api/agent-evidence', async (route) => {
      const request = route.request().postDataJSON() as {
        input: { missionId: string; expectedRevision: number; turnId: string };
      };
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...fixturePayload,
          missionId: request.input.missionId,
          revision: request.input.expectedRevision,
          turnId: request.input.turnId,
        }),
      });
    });
    await pageNarrow.goto(service.baseURL);
    await pageNarrow.getByRole('button', { name: 'Open jewelry concierge' }).click();
    const panelNarrow = pageNarrow.getByRole('complementary', {
      name: 'Jewelry buying concierge',
    });
    const inputNarrow = panelNarrow.getByRole('textbox', { name: 'Message the Concierge' });
    await inputNarrow.fill(
      'I am trying to find diamond hoop earrings for a gift. What are some of the most popular styles under $1000?',
    );
    await panelNarrow.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => service.chats.length).toBe(6);
    await expect(inputNarrow).toBeEnabled({ timeout: 25_000 });
    await expect(panelNarrow.locator('.connected-assistant-message').last()).toContainText(
      'three styles worth knowing',
    );
    await expect(panelNarrow.locator('.pw-discovery-group')).toHaveCount(3);
    const narrowEvidence = await measureAndShoot(pageNarrow, 'narrow-375-hoop-reply', output);
    expect(narrowEvidence.overflow.scrollWidth).toBeLessThanOrEqual(
      narrowEvidence.overflow.innerWidth,
    );
    for (const card of narrowEvidence.cards) {
      expect(card.hasSpecList, `card ${card.id} must not render a spec list`).toBe(false);
    }
    expect(squash(narrowEvidence.replyText).replace(/^Concierge/, '')).toBe(
      squash(denseReply),
    );
    await narrow.close();

    await writeFile(
      path.resolve('.checkpoint/runs/bella-density-2026-10-13/ui-density-evidence.json'),
      JSON.stringify(
        {
          label: 'fixture',
          note: 'Synthetic records; stubbed agent stream; browser-level evidence interception. No paid turns.',
          denseReplyChars: denseReply.length,
          desktop: desktopEvidence,
          narrow: narrowEvidence,
          chats: service.chats,
          consoleErrors,
        },
        null,
        2,
      ),
    );
    expect(consoleErrors).toEqual([]);
  } finally {
    await service.close();
  }
});
