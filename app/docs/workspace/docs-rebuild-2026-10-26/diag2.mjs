import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://jewellerytv.vercel.app', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(4000);
const styles = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { opacity: cs.opacity, visibility: cs.visibility, display: cs.display, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, zIndex: cs.zIndex, position: cs.position };
  };
  return { prompt: pick('.connected-prompt'), chips: pick('.connected-facet-chips'), workspace: pick('.concierge-workspace'), panel: pick('[class*="workspace"]') };
});
console.log(JSON.stringify(styles, null, 2));
await page.screenshot({ path: 'docs/workspace/docs-rebuild-2026-10-26/diag-anim-off.png', animations: 'disabled' });
await browser.close();
