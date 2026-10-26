import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://jewellerytv.vercel.app', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(4000);
const top = await page.evaluate(() => {
  const el = document.elementFromPoint(1100, 400);
  const chain = [];
  for (let n = el; n && chain.length < 6; n = n.parentElement) chain.push(`${n.tagName}.${(n.className ?? '').toString().slice(0, 60)}`);
  return chain;
});
console.log('elementFromPoint(1100,400):', JSON.stringify(top, null, 1));
await page.locator('.concierge-workspace').screenshot({ path: 'docs/workspace/docs-rebuild-2026-10-26/diag-element.png' }).catch(e => console.log('element shot failed:', String(e).slice(0, 120)));
await browser.close();
