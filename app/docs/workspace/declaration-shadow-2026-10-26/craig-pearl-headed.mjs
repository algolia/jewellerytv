/* Craig's pearl journey, headed (Arijit watching): the exact two turns from
 * the Craig feedback packet, on the dev app + dev agent with the declaration
 * shadow live. Screenshots at each turn; the conversation receipt afterwards
 * shows what the model declared. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'run-craig-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

const APP = process.env.JTV_APP_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  headless: false,
  args: ['--mute-audio', '--window-position=100,60', '--window-size=1440,960'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByText('Ask JTV', { exact: true }).first().click();
await page.waitForSelector('#connected-concierge-input', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, 't0-welcome.png') });

const turns = [
  "I'm looking for a pearl necklace under $1,000. What are my options?",
  'I want a classic pearl strand, still under $1,000. Please show me classic strands.',
];
const receipts = [];
let index = 0;
for (const say of turns) {
  index += 1;
  await page.fill('#connected-concierge-input', say);
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
  await page.screenshot({ path: join(OUT, `t${index}-pearl.png`), fullPage: true });
  const state = await page.evaluate(() => {
    const panel = document.querySelector('aside.concierge-panel');
    const tiles = panel ? [...panel.querySelectorAll('a[href^="/product/"]')].map((a) => (a.getAttribute('aria-label') ?? '').slice(0, 70)) : [];
    const messages = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages') ?? '[]');
    const presents = [];
    for (const m of messages)
      for (const p of m.parts ?? [])
        if (p.type === 'tool-present_products')
          presents.push({
            understood: p.input?.understood ?? null,
            status: p.output?.status,
            returned: (p.output?.objectIDs ?? []).length,
            priceOverBudget: p.output?.priceOverBudget ?? null,
            declaredVerbatim: p.output?.declaredVerbatim ?? null,
          });
    return { tiles, presents };
  });
  receipts.push({ turn: index, say, ...state });
}

writeFileSync(join(OUT, 'craig-receipts.json'), JSON.stringify(receipts, null, 1));
console.log('RUN DIR:', OUT);
for (const r of receipts)
  console.log(
    `turn ${r.turn}: tiles=${r.tiles.length} | presents=${JSON.stringify(r.presents)}`,
  );
await page.waitForTimeout(4000);
await browser.close();
