import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const out = resolve('/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/public/docs/assets');
const here = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/docs-rebuild-2026-10-26';
const SITE = 'https://jewellerytv.vercel.app';
const ASK = 'Show me opal earrings';
const receipts = { ask: ASK };
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/*.mp4**', r => r.abort());
await page.route('**/*.webm**', r => r.abort());
await page.goto(SITE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(3500);
await page.locator('#connected-concierge-input').fill(ASK);
await page.locator('#connected-concierge-input').press('Enter');
/* Turn complete = the working status has been gone for 8 consecutive seconds. */
await page.waitForFunction(() => {
  const w = window.__jtvIdle;
  window.__jtvIdle = !document.body.innerText.includes('Working with JTV information');
  return window.__jtvIdle && w === true;
}, { timeout: 150000, polling: 500 });
await page.waitForTimeout(8000);
receipts.turn = {
  tiles: await page.locator('.connected-inline-card').count(),
  chips: await page.locator('.connected-facet-chip').allInnerTexts(),
  panelText: (await page.locator('.concierge-workspace').innerText()).slice(0, 2000),
};
await page.screenshot({ path: resolve(out, 'shopping-turn.png') });
const chip = page.locator('.connected-facet-chip').first();
if (await chip.count()) {
  receipts.chipTap = (await chip.innerText()).trim();
  await chip.click();
  await page.waitForFunction(() => {
    const w = window.__jtvIdle2;
    window.__jtvIdle2 = !document.body.innerText.includes('Loading');
    return window.__jtvIdle2 && w === true;
  }, { timeout: 60000, polling: 500 });
  await page.waitForTimeout(5000);
  receipts.afterTap = {
    tiles: await page.locator('.connected-inline-card').count(),
    panelText: (await page.locator('.concierge-workspace').innerText()).slice(0, 900),
  };
  await page.screenshot({ path: resolve(out, 'chip-refine.png') });
}
writeFileSync(resolve(here, 'shoot6-receipts.json'), JSON.stringify(receipts, null, 2));
console.log(JSON.stringify({ tiles: receipts.turn?.tiles, chips: receipts.turn?.chips, tap: receipts.chipTap ?? 'none' }, null, 2));
await browser.close();
