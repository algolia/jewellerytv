/* Craig scenario matrix on the current production build (2026-10-27).
 * Each scenario = his reported issue, replayed as a shopper journey with
 * fresh literals. Captures replies, tile titles and counts for grading.
 * One browser; fresh conversation per scenario via reload. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

const APP = process.env.JTV_APP_URL ?? 'https://jewellerytv.vercel.app/';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

async function freshConversation() {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByText('Ask JTV', { exact: true }).first().click();
  await page.waitForSelector('#connected-concierge-input', { timeout: 30000 });
  await page.waitForTimeout(1500);
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
  await page.waitForTimeout(3000);
}

async function capture() {
  return await page.evaluate(() => {
    const panel = document.querySelector('aside.concierge-panel');
    const tiles = panel ? [...panel.querySelectorAll('a[href^="/product/"]')].map((a) => (a.getAttribute('aria-label') ?? '').replace('View details for ', '').slice(0, 70)) : [];
    const messages = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages') ?? '[]');
    const texts = [];
    for (const m of messages)
      if (m.role === 'assistant') {
        const t = (m.parts ?? []).filter((p) => typeof p.text === 'string').map((p) => p.text).join(' ');
        if (t.trim()) texts.push(t);
      }
    return { tiles, reply: texts[texts.length - 1] ?? '', allReplies: texts };
  });
}

const scenarios = [
  { id: 'S2-mens-watch', turns: ['I need a watch for my husband, nothing too flashy', 'something under 300 maybe'] },
  { id: 'S3-comparison-to-shopping', turns: ["What's the difference between moissanite and Bella Luce?", 'okay show me moissanite rings under 500'] },
  { id: 'S4-returns-policy', turns: ['What is your return policy?'] },
  { id: 'S6-mens-chain-article', turns: ["What's a good chain length for a man?"] },
  { id: 'S7-bella-luce-plain', turns: ['What exactly is Bella Luce?'] },
  { id: 'S8-preowned-out-of-scope', turns: ['Show me pre-owned Rolex watches'] },
  { id: 'S9-trending-honesty', turns: ["What's trending in jewelry right now?"] },
];

const results = [];
for (const scenario of scenarios) {
  await freshConversation();
  const turns = [];
  for (const say of scenario.turns) {
    await send(say);
    const cap = await capture();
    turns.push({ say, tiles: cap.tiles, tileCount: cap.tiles.length, reply: cap.reply });
  }
  await page.screenshot({ path: join(OUT, `${scenario.id}.png`), fullPage: true });
  results.push({ id: scenario.id, turns });
  console.log(`${scenario.id}: turn tiles = ${turns.map((t) => t.tileCount).join(', ')}`);
}

writeFileSync(join(OUT, 'scenario-results.json'), JSON.stringify(results, null, 1));
console.log('RUN DIR:', OUT);
await browser.close();
