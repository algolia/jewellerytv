import { chromium } from 'playwright';
const BASE = 'https://jewellerytv.vercel.app/docs';
const pages = ['', '/index.html', '/experience.html', '/architecture.html', '/agent.html', '/examples.html', '/appendix-prompts.html'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1419, height: 900 } });
const bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(-70)); });
for (const p of pages) {
  await page.goto(BASE + p, { waitUntil: 'networkidle' });
  const d = await page.evaluate(() => ({
    h1: document.querySelector('h1')?.textContent ?? 'NONE',
    styled: getComputedStyle(document.querySelector('.docs-header') ?? document.body).position === 'sticky',
    imgs: [...document.querySelectorAll('img')].filter((i) => i.naturalWidth > 0).length + '/' + document.querySelectorAll('img').length,
  }));
  console.log('OK', JSON.stringify(d));
}
console.log('4xx/5xx:', bad.length ? bad : 'none');
await browser.close();
