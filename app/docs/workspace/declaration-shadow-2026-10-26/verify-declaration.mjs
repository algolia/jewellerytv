/* Verify the declaration shadow (Option B stage 1) on the dev agent: two
 * connected turns — a positive material ask and a negated ask — then report
 * the conversation IDs so the reader can show the `understood` field the
 * model actually sent. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

const APP = process.env.JTV_APP_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function newConversation() {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByText('Ask JTV', { exact: true }).first().click();
  await page.waitForSelector('#connected-concierge-input', { timeout: 30000 });
  await page.waitForTimeout(1200);
}
async function send(text) {
  await page.fill('#connected-concierge-input', text);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#connected-concierge-input');
      return el && !el.disabled;
    },
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(4000);
}

const asks = [
  'Show me gold hoop earrings for work',
  'Show me rings under $200, no specific stone',
];
const turns = [];
for (const ask of asks) {
  await newConversation();
  await send(ask);
  await page.screenshot({ path: join(OUT, `${asks.indexOf(ask)}.png`) });
  turns.push({ ask });
}
writeFileSync(join(OUT, 'turns.json'), JSON.stringify({ turns, out: OUT }, null, 1));
console.log('RUN DIR:', OUT);
await browser.close();
