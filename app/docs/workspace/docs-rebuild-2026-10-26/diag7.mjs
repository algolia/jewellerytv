import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('https://jewellerytv.vercel.app', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const dlg = document.querySelector('dialog');
  const ws = document.querySelector('.concierge-workspace');
  return {
    hasDialog: !!dlg,
    dialogOpen: dlg?.open ?? null,
    wsInDialog: !!(dlg && ws && dlg.contains(ws)),
    wsParentChain: (() => { const c = []; let n = ws; for (let i = 0; i < 5 && n; i++, n = n.parentElement) c.push(n.tagName + '.' + String(n.className).slice(0, 40)); return c; })(),
    wsBg: ws ? getComputedStyle(ws).backgroundColor : null,
    wsFilter: ws ? getComputedStyle(ws).filter : null,
    wsBackdrop: ws ? getComputedStyle(ws, '::backdrop').backgroundColor : null,
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
