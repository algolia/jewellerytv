import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 720 } });
await page.goto('http://localhost:5199/docs/appendix-prompts.html', { waitUntil: 'networkidle' });
const culprits = await page.evaluate(() => {
  const out = [];
  const inWrap = (el) => !!el.closest('.table-wrap');
  for (const el of document.querySelectorAll('body *')) {
    if (inWrap(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > 377 && r.width > 10) out.push(`${el.tagName}.${String(el.className).slice(0, 25)} right=${Math.round(r.right)} text=${(el.textContent ?? '').slice(0, 40).replace(/\n/g, ' ')}`);
  }
  return out.slice(0, 6);
});
console.log(culprits.join('\n') || 'NONE OUTSIDE TABLE-WRAP');
await browser.close();
