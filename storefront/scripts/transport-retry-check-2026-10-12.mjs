// Transparent transport retry acceptance, 2026-10-12.
// Simulates a transient upstream failure: the first /api/chat POST returns
// 502, the retry passes through to the real published agent (1 paid turn).
// PASS requires: assistant reply rendered, NO system notice anywhere,
// exactly one user bubble (the failed attempt must not duplicate it).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_URL = 'http://localhost:5173/';
const QUESTION = 'What is your return policy?';
const OUT = '../.checkpoint/runs/transport-retry-check-2026-10-12';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
let chatPosts = 0;
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.route('**/api/chat', async (route) => {
  chatPosts += 1;
  if (chatPosts === 1) {
    await route.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"simulated transient upstream failure"}' });
  } else {
    await route.fallback();
  }
});

await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.getByRole('button', { name: /concierge/i }).first().click();
const composer = page.locator('#connected-concierge-input').first();
await composer.waitFor({ state: 'visible', timeout: 20000 });
await composer.fill(QUESTION);
await composer.press('Enter');

// Wait for the reply: last assistant text stable across two polls.
let reply = '';
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(2000);
  const cur = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.connected-assistant-message')];
    const last = nodes.at(-1);
    return last ? last.innerText : '';
  });
  if (cur && cur === reply) break;
  reply = cur;
}

await page.screenshot({ path: join(OUT, '01-after-retry.png'), fullPage: true });
const body = await page.evaluate(() => document.body.innerText);
const userBubbles = await page.evaluate(
  () => document.querySelectorAll('.connected-user-message').length,
);
const hasNotice = body.includes('[System notice]');
writeFileSync(join(OUT, 'visible-text.txt'), body);
writeFileSync(join(OUT, 'console-errors.json'), JSON.stringify(errors, null, 2));

// The injected 502 itself logs "Failed to load resource: ... 502" in the
// browser console; that is the fault injection, not a defect. Real errors are
// anything else.
const realErrors = errors.filter((e) => !e.includes('502'));
const pass = !!reply && !hasNotice && userBubbles === 1 && realErrors.length === 0;
console.log(JSON.stringify({
  pass,
  chatPosts,
  userBubbles,
  hasNotice,
  consoleErrors: errors.length,
  realErrors,
  replyHead: reply.slice(0, 200),
}, null, 1));
await browser.close();
process.exit(pass ? 0 : 1);
