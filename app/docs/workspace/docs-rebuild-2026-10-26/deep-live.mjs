import { chromium } from 'playwright';
const BASE = 'https://jewellerytv.vercel.app/docs/';
const pages = ['index.html', 'experience.html', 'architecture.html', 'agent.html', 'examples.html', 'adopting.html', 'appendix-prompts.html'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1419, height: 1307 } });
const bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(-80)); });
page.on('console', (m) => { if (m.type() === 'error') bad.push('console: ' + m.text().slice(0, 120)); });
for (const p of pages) {
  await page.goto(BASE + p, { waitUntil: 'networkidle' });
  const d = await page.evaluate(async () => {
    const fontSora = document.fonts.check('16px Sora');
    const fontMono = document.fonts.check('12px "JetBrains Mono"');
    const h1 = document.querySelector('h1');
    const h1s = h1 ? getComputedStyle(h1) : null;
    const sidebar = document.querySelector('.docs-sidebar');
    const sr = sidebar?.getBoundingClientRect();
    const main = document.querySelector('.docs-main')?.getBoundingClientRect();
    const svg = document.querySelector('.figure svg');
    const svgBox = svg?.getBoundingClientRect();
    return {
      sora: fontSora, mono: fontMono,
      h1Font: h1s?.fontFamily.slice(0, 30), h1Weight: h1s?.fontWeight, h1Color: h1s?.color, h1Size: h1s?.fontSize,
      sidebarX: Math.round(sr?.x ?? -1), sidebarW: Math.round(sr?.width ?? -1),
      mainX: Math.round(main?.x ?? -1), mainW: Math.round(main?.width ?? -1),
      svgW: Math.round(svgBox?.width ?? -1), svgH: Math.round(svgBox?.height ?? -1),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      docHeight: document.documentElement.scrollHeight,
    };
  });
  console.log(p, JSON.stringify(d));
}
console.log('bad responses/console:', bad.length ? bad : 'none');
await browser.close();
