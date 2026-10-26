import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://jewellerytv.vercel.app', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: 'docs/workspace/docs-rebuild-2026-10-26/diag-full-chromium.png' });
console.log('done');
await browser.close();
