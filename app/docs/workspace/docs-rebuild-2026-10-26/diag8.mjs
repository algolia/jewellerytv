import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://jewellerytv.vercel.app', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(3000);
await page.evaluate(() => {
  document.body.style.background = 'red';
  const ws = document.querySelector('.concierge-workspace');
  ws.style.outline = '10px solid lime';
  ws.style.background = 'yellow';
});
await page.waitForTimeout(1000);
await page.screenshot({ path: 'docs/workspace/docs-rebuild-2026-10-26/diag-paint.png' });
console.log('done');
await browser.close();
