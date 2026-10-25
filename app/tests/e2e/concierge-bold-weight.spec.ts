import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

// Regression proof for brief B-UI2: chat bold text must compute to a weight the
// loaded Lato family actually provides (700). The old rule asked for 500, which
// Lato does not ship, so bold fell back to regular 400 glyphs wherever the
// stylesheet's :only-child exception did not rescue it (bold next to a link, or
// outside a paragraph). The reply is supplied by a stubbed SSE stream, so no
// agent, index or network is involved. The first nine lines are the B-UI1
// TEST-PLAN fixture string verbatim; the last line adds a mixed paragraph
// (bold beside a product link) because that is where the 500 rule actually
// applies. Set UI2_PROOF=1 for record-only evidence capture (no weight
// assertions); UI2_PROOF_OUT / UI2_PROOF_SHOT / UI2_PROOF_WELCOME override the
// JSON, reply screenshot and welcome screenshot paths.

const REPLY = [
  'Hello **Earrings** are lovely.',
  '',
  '**Ready to explore?**',
  '',
  '- Gold hoops',
  '- Silver studs',
  '',
  '1. First pick',
  '2. Second pick',
  '',
  'See [this piece](/product/12345).',
  'Line A',
  'Line B',
  '',
  'Ask about **this ring** or [see the piece](/product/6789).',
].join('\n');

test('chat bold renders at weight 700 in the conversation pane', async ({ page }, testInfo) => {
  // Registered first so every API call dies in the browser; the specific chat
  // stub below is registered after and takes precedence (last route wins).
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
  );
  const events = [
    { type: 'start', messageId: 'assistant-bold' },
    { type: 'text-start', id: 'bold-text' },
    { type: 'text-delta', id: 'bold-text', delta: REPLY },
    { type: 'text-end', id: 'bold-text' },
    { type: 'finish' },
  ];
  await page.route('**/api/chat', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      headers: { 'x-vercel-ai-ui-message-stream': 'v1' },
      body:
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Open jewelry concierge' }).click();
  const panel = page.getByRole('complementary', { name: 'Jewelry buying concierge' });
  if (process.env.UI2_PROOF_WELCOME) {
    await page.screenshot({ path: process.env.UI2_PROOF_WELCOME, fullPage: true });
  }
  await panel.getByRole('textbox', { name: 'Message the Concierge' }).fill('Show me bold text');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(
    panel.locator('.connected-markdown strong').filter({ hasText: 'Earrings' }),
  ).toBeVisible();
  const weights = await page.evaluate(() => {
    const weightOf = (element: Element) => getComputedStyle(element).fontWeight;
    const containers = Array.from(document.querySelectorAll('.connected-markdown'));
    const md = containers.find((c) => c.textContent?.includes('Earrings')) ?? containers.at(-1);
    if (!md) return { error: 'no .connected-markdown container found' };
    const strongByText = (text: string) =>
      Array.from(md.querySelectorAll('strong')).find((s) => s.textContent?.trim() === text);
    const inline = strongByText('Earrings');
    const standalone = strongByText('Ready to explore?');
    const mixed = strongByText('this ring');
    const normalParagraph = Array.from(md.querySelectorAll('p')).find(
      (p) => !p.querySelector('strong'),
    );
    const linkParagraph = Array.from(md.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('see the piece'),
    );
    const linkElement = linkParagraph?.querySelector('a, span');
    const listItem = md.querySelector('li');
    return {
      strongCount: md.querySelectorAll('strong').length,
      inlineBold: inline ? weightOf(inline) : null,
      standaloneBold: standalone ? weightOf(standalone) : null,
      mixedParagraphBold: mixed ? weightOf(mixed) : null,
      normalParagraph: normalParagraph ? weightOf(normalParagraph) : null,
      listItem: listItem ? weightOf(listItem) : null,
      linkElementTag: linkElement ? linkElement.tagName.toLowerCase() : null,
      linkElementWeight: linkElement ? weightOf(linkElement) : null,
    };
  });
  if (process.env.UI2_PROOF_OUT) {
    writeFileSync(process.env.UI2_PROOF_OUT, `${JSON.stringify(weights, null, 2)}\n`);
  }
  if (process.env.UI2_PROOF_SHOT) {
    await page.screenshot({ path: process.env.UI2_PROOF_SHOT, fullPage: true });
  } else {
    await panel.screenshot({ path: testInfo.outputPath('bold-weight.png') });
  }
  if (process.env.UI2_PROOF_CHAT) {
    await page.locator('.conversation-column').screenshot({ path: process.env.UI2_PROOF_CHAT });
  }
  if (!process.env.UI2_PROOF) {
    expect(weights.inlineBold).toBe('700');
    expect(weights.standaloneBold).toBe('700');
    expect(weights.mixedParagraphBold).toBe('700');
    expect(weights.normalParagraph).toBe('400');
  }
});
