/* Viewport-only reshoot: the panel is a fixed overlay, so fullPage shots miss it.
 * One fresh paid literal. */
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const app = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app';
const out = resolve(app, 'public/docs/assets');
const SITE = 'https://jewellerytv.vercel.app';
const ASK = 'I need a graduation gift for my niece under $300';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(SITE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(3500);
await page.screenshot({ path: resolve(out, 'welcome.png') });
console.log('shot welcome (viewport)');

await page.locator('#connected-concierge-input').fill(ASK);
await page.locator('#connected-concierge-input').press('Enter');
await page.waitForSelector('.connected-inline-card img, .connected-facet-chip', { timeout: 90000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: resolve(out, 'shopping-turn.png') });
console.log('shot shopping-turn (viewport)');

const chip = page.locator('.connected-facet-chip').first();
if (await chip.count()) {
  console.log('chip tapped:', (await chip.textContent() ?? '').trim());
  await chip.click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: resolve(out, 'chip-refine.png') });
  console.log('shot chip-refine (viewport)');
} else {
  console.log('NO CHIPS RENDERED');
}
await browser.close();
