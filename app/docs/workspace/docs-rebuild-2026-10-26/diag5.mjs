import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://jewellerytv.vercel.app', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const dump = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { opacity: cs.opacity, vis: cs.visibility, rect: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, anim: cs.animationName, transform: cs.transform.slice(0, 40), color: cs.color, bg: cs.backgroundColor };
  };
  return { welcome: dump('.connected-welcome'), starters: dump('.connected-starters'), chip: dump('.connected-starter-chip'), messages: dump('.concierge-messages') };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
