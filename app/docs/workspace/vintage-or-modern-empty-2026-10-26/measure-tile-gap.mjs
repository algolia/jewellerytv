/* Measure the tile gap (2026-10-26): present_products returned 8 verified
 * pieces but the shelf rendered 5. One turn, then compare the tool output
 * objectIDs against every product link in the DOM (panel-scoped and
 * document-wide) to find where the three tiles go missing. */
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

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByText('Ask JTV', { exact: true }).first().click();
await page.waitForSelector('#connected-concierge-input', { timeout: 30000 });
await page.waitForTimeout(1500);

await page.fill('#connected-concierge-input', 'Help me find an anniversary gift');
await page.keyboard.press('Enter');
await page.waitForFunction(
  () => {
    const el = document.querySelector('#connected-concierge-input');
    return el && !el.disabled;
  },
  undefined,
  { timeout: 180000 },
);
await page.waitForTimeout(8000);

const data = await page.evaluate(() => {
  const messages = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages') ?? '[]');
  const presentOutputs = [];
  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type === 'tool-present_products' && p.output)
        presentOutputs.push({ returned: (p.output.objectIDs ?? []).map((i) => ({ id: i.objectID, name: i.name })), status: p.output.status });
    }
  }
  const panel = document.querySelector('aside.concierge-panel');
  const collect = (root) =>
    [...root.querySelectorAll('a[href^="/product/"]')].map((a) => ({
      label: (a.getAttribute('aria-label') ?? '').slice(0, 60),
      img: !!a.querySelector('img'),
      imgLoaded: a.querySelector('img')?.complete ?? null,
    }));
  return {
    presentOutputs,
    panelTiles: panel ? collect(panel) : null,
    docTiles: collect(document),
    panelExists: !!panel,
    asides: [...document.querySelectorAll('aside')].map((a) => a.className),
  };
});

await page.screenshot({ path: join(OUT, 'final.png'), fullPage: true });
writeFileSync(join(OUT, 'gap.json'), JSON.stringify(data, null, 1));
console.log(JSON.stringify(data, null, 1).slice(0, 3500));
await browser.close();
