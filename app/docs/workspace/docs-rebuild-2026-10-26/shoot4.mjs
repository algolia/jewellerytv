import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const out = resolve('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/public/docs/assets');
const here = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/docs-rebuild-2026-10-26';
const SITE = 'https://jewellerytv.vercel.app';
const ASK = 'Show me sapphire rings in white gold';
const receipts = { ask: ASK };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/*.mp4**', r => r.abort());
await page.route('**/*.webm**', r => r.abort());
await page.goto(SITE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(3500);
receipts.welcome = await page.locator('.concierge-workspace').innerText();
await page.screenshot({ path: resolve(out, 'welcome.png') });
await page.locator('#connected-concierge-input').fill(ASK);
await page.locator('#connected-concierge-input').press('Enter');
await page.waitForSelector('.connected-inline-card img, .connected-facet-chip', { timeout: 90000 });
await page.waitForTimeout(4000);
receipts.turn = {
  panelText: await page.locator('.concierge-workspace').innerText(),
  tiles: await page.locator('.connected-inline-card').count(),
  chipLabels: await page.locator('.connected-facet-chip').allInnerTexts(),
};
await page.screenshot({ path: resolve(out, 'shopping-turn.png') });
const chip = page.locator('.connected-facet-chip').first();
if (await chip.count()) {
  receipts.chipTap = (await chip.innerText()).trim();
  await chip.click();
  await page.waitForTimeout(6000);
  receipts.afterTap = {
    panelText: await page.locator('.concierge-workspace').innerText(),
    tiles: await page.locator('.connected-inline-card').count(),
  };
  await page.screenshot({ path: resolve(out, 'chip-refine.png') });
}
writeFileSync(resolve(here, 'shoot-receipts.json'), JSON.stringify(receipts, null, 2));
console.log(JSON.stringify({ tiles: receipts.turn?.tiles, chips: receipts.turn?.chipLabels, tap: receipts.chipTap }, null, 2));
await browser.close();
