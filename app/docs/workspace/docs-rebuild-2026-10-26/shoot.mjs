/* Docs screenshots from the production app. Headless, bounded: one paid
 * shopping turn plus one free chip refinement. Saves PNGs into
 * app/public/docs/assets/. Run: node docs/workspace/docs-rebuild-2026-10-26/shoot.mjs */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, '../../..');
const out = resolve(app, 'public/docs/assets');
mkdirSync(out, { recursive: true });

const SITE = 'https://jewellerytv.vercel.app';
const ASK = 'Show me opal rings in sterling silver';
const shots = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function shot(name, fullPage = false) {
  const path = resolve(out, `${name}.png`);
  await page.screenshot({ path, fullPage });
  shots.push(`${name}.png`);
  console.log('shot', name);
}

await page.goto(SITE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await shot('home', true);

await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForSelector('.connected-facet-chips, .connected-prompt', { timeout: 15000 });
await page.waitForTimeout(2000);
await shot('welcome');

await page.locator('#connected-concierge-input').fill(ASK);
await page.locator('#connected-concierge-input').press('Enter');
/* The turn completes when tiles render; the cap is generous for a cold paid turn. */
await page.waitForSelector('.connected-inline-card img, .connected-facet-chip', { timeout: 90000 });
await page.waitForTimeout(4000);
await shot('shopping-turn', true);

const chip = page.locator('.connected-facet-chip').first();
if (await chip.count()) {
  const label = (await chip.textContent() ?? '').trim();
  await chip.click();
  await page.waitForTimeout(6000);
  await shot('chip-refine');
  console.log('chip tapped:', label);
} else {
  console.log('NO CHIPS RENDERED');
}

console.log(JSON.stringify({ shots }, null, 2));
await browser.close();
