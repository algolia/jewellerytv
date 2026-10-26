import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 720 } });
await page.goto('http://localhost:5199/docs/appendix-prompts.html', { waitUntil: 'networkidle' });
const r = await page.evaluate(() => {
  const w = (sel) => { const el = document.querySelector(sel); const b = el?.getBoundingClientRect(); return b ? `${Math.round(b.width)}@x${Math.round(b.x)}` : 'none'; };
  return {
    docScrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    layout: w('.docs-layout'), sidebar: w('.docs-sidebar'), main: w('.docs-main'), content: w('.content'),
    wraps: document.querySelectorAll('.table-wrap').length,
    maxWrapRight: Math.max(...[...document.querySelectorAll('.table-wrap')].map((e) => Math.round(e.getBoundingClientRect().right))),
  };
});
console.log(JSON.stringify(r));
await browser.close();
