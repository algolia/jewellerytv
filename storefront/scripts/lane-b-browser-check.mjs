// Headless browser check for Lane B: load the app with the modified runtime,
// ask a Help-only question, capture screenshots + network receipts, and record
// whether the live agent requests source 'help' (expected: not yet — the
// Agent Studio tool declaration is updated in a later lane).
import { chromium } from 'playwright';

const OUT = '.checkpoint/runs/lane-b-help-retrieval-2026-10-12';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const network = [];
page.on('request', (req) => {
  const url = req.url();
  if (url.includes('/api/')) network.push({ kind: 'request', method: req.method(), url });
});
page.on('response', (res) => {
  const url = res.url();
  if (url.includes('/api/')) network.push({ kind: 'response', status: res.status(), url });
});
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.screenshot({ path: `${OUT}/01-initial.png`, fullPage: false });

await page.getByRole('button', { name: 'Open jewelry Concierge' }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/01b-concierge-open.png` });
const composer = page.locator('#connected-concierge-input').first();
await composer.waitFor({ state: 'visible', timeout: 15000 });
await composer.fill('What is your return policy?');
await page.screenshot({ path: `${OUT}/02-question-typed.png` });
await composer.press('Enter');

// Wait for an assistant response to appear after the shopper message.
await page.waitForTimeout(25000);
await page.screenshot({ path: `${OUT}/03-after-answer.png`, fullPage: true });
const visibleText = await page.evaluate(() => document.body.innerText);
const { writeFileSync } = await import('node:fs');
writeFileSync(`${OUT}/04-visible-text.txt`, visibleText);
writeFileSync(`${OUT}/05-network.json`, JSON.stringify(network, null, 2));
writeFileSync(`${OUT}/06-console-errors.json`, JSON.stringify(errors, null, 2));
const anyEvidenceResponse = network.some((e) => e.kind === 'response' && e.status === 200);
console.log(
  JSON.stringify(
    {
      screenshots: ['01-initial.png', '02-question-typed.png', '03-after-answer.png'],
      apiCalls: network.length,
      anyEvidenceResponse,
      helpSourceInTranscript: visibleText.includes('help_content'),
      consoleErrors: errors.length,
      replyExcerpt: visibleText.slice(-600),
    },
    null,
    2,
  ),
);
await browser.close();
