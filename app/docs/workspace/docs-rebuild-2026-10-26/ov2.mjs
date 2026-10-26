import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 720 } });
await page.goto('http://localhost:5199/docs/appendix-prompts.html', { waitUntil: 'networkidle' });
const info = await page.evaluate(() => {
  const out = [];
  for (const w of document.querySelectorAll('.table-wrap')) {
    const cs = getComputedStyle(w);
    out.push({ overflowX: cs.overflowX, clientW: w.clientWidth, scrollW: w.scrollWidth, parentW: w.parentElement.clientWidth });
  }
  const code = [...document.querySelectorAll('code')].filter((c) => c.getBoundingClientRect().right > 376).map((c) => ({ text: c.textContent.slice(0, 40), right: Math.round(c.getBoundingClientRect().right), parent: c.parentElement.tagName + '.' + String(c.parentElement.className).slice(0, 20), ws: getComputedStyle(c).whiteSpace }));
  return { wraps: out.slice(0, 6), code: code.slice(0, 5) };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
