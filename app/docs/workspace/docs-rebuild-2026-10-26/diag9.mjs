import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://jewellerytv.vercel.app', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const dump = (el) => { const cs = getComputedStyle(el); return { filter: cs.filter, backdrop: cs.backdropFilter, bg: cs.backgroundColor, opacity: cs.opacity, mixBlend: cs.mixBlendMode, contain: cs.contain, contentVis: cs.contentVisibility }; };
  return { html: dump(document.documentElement), body: dump(document.body), wrapper: dump(document.body.firstElementChild) };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
