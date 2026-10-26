import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
/* Block video media: test the compositor-wedge-by-video hypothesis. */
await page.route('**/*.mp4**', r => r.abort());
await page.route('**/*.webm**', r => r.abort());
await page.goto('https://jewellerytv.vercel.app', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'docs/workspace/docs-rebuild-2026-10-26/diag-pre-click.png' });
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: 'docs/workspace/docs-rebuild-2026-10-26/diag-novideo.png' });
console.log('done');
await browser.close();
