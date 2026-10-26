import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://jewellerytv.vercel.app', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(3000);
const layers = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const covers = cs.position === 'fixed' || (cs.position === 'absolute' && r.width >= 1400 && r.height >= 800);
    if (covers && r.width > 100 && r.height > 100) {
      out.push({ tag: el.tagName + '.' + String(el.className).slice(0, 50), pos: cs.position, z: cs.zIndex, bg: cs.backgroundColor, op: cs.opacity, anim: cs.animationName + '/' + cs.animationPlayState, trans: cs.transitionProperty.slice(0, 40), rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` });
    }
  }
  return out;
});
console.log(JSON.stringify(layers, null, 1));
await browser.close();
