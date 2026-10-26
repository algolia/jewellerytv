/* Funnel-continuity verification (2026-10-26 bug): a purity chip tap on a
 * later turn's shelf must refine THAT turn's search — its query text, its
 * facet_<Attribute> constraints (price bands, material) — not the transcript's
 * first turn. Runs the real three-round journey headless against the local dev
 * app (5173, dev agent) and captures the refine request's params as receipts.
 * Output: screenshots + refine-receipts.json in this run folder. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

const APP = process.env.JTV_APP_URL ?? 'http://localhost:5173/';
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

const receipts = { refineRequests: [], turns: [] };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/* Capture every search request the funnel refine issues through the proxy. */
page.on('request', (request) => {
  const url = request.url();
  if (!url.includes('/api/') || request.method() !== 'POST') return;
  const post = request.postData();
  if (!post || !(post.includes('"facetFilters"') || post.includes('facetFilters'))) return;
  try {
    const body = JSON.parse(post);
    receipts.refineRequests.push({ url, body });
  } catch {
    /* stream bodies are not JSON; the search proxy calls are */
  }
});

async function send(text) {
  await page.getByLabel('Message the Concierge').fill(text);
  await page.keyboard.press('Enter');
}

async function waitTurnDone(minMs = 4000) {
  /* The composer disables while pending; wait for it to re-enable, then settle. */
  await page.waitForFunction(
    () => {
      const input = document.querySelector('#connected-concierge-input');
      return input && !input.disabled;
    },
    undefined,
    { timeout: 150000 },
  );
  await page.waitForTimeout(minMs);
}

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
/* The Concierge is an overlay opened by the Ask JTV control on the storefront. */
await page.getByText('Ask JTV', { exact: true }).first().click();
await page.waitForSelector('#connected-concierge-input', { timeout: 30000 });
await page.waitForTimeout(1500);

const journey = [
  { say: "I'd like to see platinum rings", label: 't1-platinum' },
  { say: 'I can spend up to 1000', label: 't2-budget' },
  { say: "let's go with gold then", label: 't3-gold' },
];

for (const step of journey) {
  await send(step.say);
  await waitTurnDone();
  await page.waitForTimeout(3000);
  await shot(page, step.label);
  /* Per-funnel chips: each assistant message carries its own funnel section. */
  const perFunnel = await page.$$eval('.connected-facet-chips', (els) =>
    els.map((e) => [...e.querySelectorAll('.connected-facet-chip')].map((c) => c.textContent)),
  );
  receipts.turns.push({ label: step.label, said: step.say, funnels: perFunnel });
}

/* Tap the first chip of the LAST message's funnel (the round-3 shelf). */
const funnels = await page.$$('.connected-facet-chips');
if (!funnels.length) throw new Error('No facet funnels rendered');
const lastFunnel = funnels[funnels.length - 1];
const lastChips = await lastFunnel.$$('.connected-facet-chip');
if (!lastChips.length) throw new Error('Last funnel has no chips');
await lastChips[0].click();
await page.waitForTimeout(5000);
await shot(page, 't4-after-chip-tap');

/* Read what the funnel rendered after the refine. */
receipts.afterTap = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.connected-facet-results [class*="tile"], .connected-facet-results img')].length;
  const lines = [...document.querySelectorAll('.connected-facet-results .connected-inline-results-line')].map((e) => e.textContent);
  const chips = [...document.querySelectorAll('.connected-facet-chip')].map((e) => e.textContent);
  return { tiles, lines, chips };
});

writeFileSync(join(OUT, 'refine-receipts.json'), JSON.stringify(receipts, null, 1));
console.log('RUN DIR:', OUT);
console.log('refine requests captured:', receipts.refineRequests.length);
console.log('afterTap:', JSON.stringify(receipts.afterTap));
await browser.close();
