/* Reproduce the tester's first-turn failure (2026-10-26): starter chip
 * "Vintage or modern?" on production returned "Your results are ready" with
 * an empty product area. Runs the exact literal through the real prod app +
 * prod agent, captures network (searches, agent stream), console errors and
 * the final rendered state as receipts. Output: run-<ts>/ in this folder. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

const APP = process.env.JTV_APP_URL ?? 'https://jewellerytv.vercel.app/';
const LITERAL = 'Vintage or modern?';
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

const receipts = {
  app: APP,
  literal: LITERAL,
  requests: [],
  responses: [],
  console: [],
  dom: null,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', (msg) => {
  if (['error', 'warning'].includes(msg.type()))
    receipts.console.push({ type: msg.type(), text: msg.text().slice(0, 2000) });
});

page.on('request', (request) => {
  const url = request.url();
  if (request.method() !== 'POST') return;
  const post = request.postData();
  const interesting = post && (post.includes('facetFilters') || post.includes('query') || /agent|converse|completions/.test(url));
  if (!interesting) return;
  receipts.requests.push({ url: url.slice(0, 300), body: (post ?? '').slice(0, 4000) });
});

page.on('response', (response) => {
  const url = response.url();
  if (!/agent|converse|completions|chat/i.test(url)) return;
  const entry = { url: url.slice(0, 300), status: response.status(), text: null };
  receipts.responses.push(entry);
  response
    .text()
    .then((t) => {
      entry.text = t.length > 200000 ? t.slice(0, 200000) + '...TRUNCATED' : t;
    })
    .catch(() => {
      entry.text = null;
    });
});

async function waitTurnDone(minMs = 4000) {
  await page.waitForFunction(
    () => {
      const input = document.querySelector('#connected-concierge-input');
      return input && !input.disabled;
    },
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(minMs);
}

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByText('Ask JTV', { exact: true }).first().click();
await page.waitForSelector('#connected-concierge-input', { timeout: 30000 });
await page.waitForTimeout(1500);
await shot(page, 'welcome');

/* Tap the exact starter chip the tester used. */
const chip = page.locator('.connected-starter-chip', { hasText: LITERAL }).first();
if (await chip.count()) {
  await chip.click();
} else {
  /* Fallback: send the same literal through the composer. */
  await page.fill('#connected-concierge-input', LITERAL);
  await page.keyboard.press('Enter');
}
await waitTurnDone();
await page.waitForTimeout(3000);
await shot(page, 'after-turn');

receipts.dom = await page.evaluate(() => {
  const texts = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent?.trim()).filter(Boolean);
  return {
    assistantMessages: texts('.connected-message, [class*="assistant"]').slice(-6),
    productTiles: document.querySelectorAll('img[alt]').length,
    productNames: texts('[class*="product"] [class*="name"], .connected-inline-results-line').slice(0, 12),
    facetChips: texts('.connected-facet-chip'),
    wishlistButtons: texts('button').filter((t) => /wishlist/i.test(t)),
    bodyClasses: document.body.className,
  };
});

writeFileSync(join(OUT, 'receipts.json'), JSON.stringify(receipts, null, 1));
console.log('RUN DIR:', OUT);
console.log('console errors:', receipts.console.length);
console.log('agent responses:', receipts.responses.map((r) => `${r.status} ${r.url.slice(0, 120)}`));
console.log('DOM:', JSON.stringify(receipts.dom, null, 1));
await browser.close();
