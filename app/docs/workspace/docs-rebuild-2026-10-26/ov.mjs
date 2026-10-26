import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 720 } });
await page.goto('http://localhost:5199/docs/appendix-prompts.html', { waitUntil: 'networkidle' });
const wide = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.right > 376 && r.width > 50) out.push(`${el.tagName}.${String(el.className).slice(0, 30)} right=${Math.round(r.right)} w=${Math.round(r.width)}`);
  }
  return out.slice(0, 8);
});
console.log(wide.join('\n'));
await browser.close();
