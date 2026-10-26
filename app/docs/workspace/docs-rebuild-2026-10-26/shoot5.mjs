import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const out = resolve('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/public/docs/assets');
const here = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/docs-rebuild-2026-10-26';
const SITE = 'https://jewellerytv.vercel.app';
const ASK = "I'm shopping for a birthday gift for my mom who loves pearls";
const receipts = { ask: ASK };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/*.mp4**', r => r.abort());
await page.route('**/*.webm**', r => r.abort());
await page.goto(SITE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(3500);
receipts.welcomeChips = await page.locator('.connected-starter-chip').allInnerTexts();
await page.screenshot({ path: resolve(out, 'welcome.png') });
await page.locator('#connected-concierge-input').fill(ASK);
await page.locator('#connected-concierge-input').press('Enter');
/* Wait for the working status to clear = turn complete, then settle. */
await page.waitForSelector('.connected-inline-card img, .connected-facet-chip', { timeout: 90000 });
await page.waitForFunction(() => !document.body.innerText.includes('Working with JTV information'), { timeout: 90000 });
await page.waitForTimeout(6000);
receipts.turn = {
  tiles: await page.locator('.connected-inline-card').count(),
  chips: await page.locator('.connected-facet-chip').allInnerTexts(),
  panelText: (await page.locator('.concierge-workspace').innerText()).slice(0, 1500),
};
await page.screenshot({ path: resolve(out, 'shopping-turn.png') });
const chip = page.locator('.connected-facet-chip').first();
if (await chip.count()) {
  receipts.chipTap = (await chip.innerText()).trim();
  await chip.click();
  await page.waitForTimeout(7000);
  receipts.afterTap = {
    tiles: await page.locator('.connected-inline-card').count(),
    panelText: (await page.locator('.concierge-workspace').innerText()).slice(0, 800),
  };
  await page.screenshot({ path: resolve(out, 'chip-refine.png') });
}
writeFileSync(resolve(here, 'shoot5-receipts.json'), JSON.stringify(receipts, null, 2));
console.log(JSON.stringify({ tiles: receipts.turn?.tiles, chips: receipts.turn?.chips, tap: receipts.chipTap ?? 'none' }, null, 2));
await browser.close();
