import { chromium } from 'playwright';
const BASE = 'http://localhost:5199/docs/';
const pages = ['index.html', 'experience.html', 'architecture.html', 'agent.html', 'examples.html', 'adopting.html', 'appendix-prompts.html'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 375, height: 720 } });
for (const p of pages) {
  await page.goto(BASE + p, { waitUntil: 'networkidle' });
  const m = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    headerH: document.querySelector('.docs-header')?.getBoundingClientRect().height ?? 0,
  }));
  const ok = m.scrollW <= m.clientW + 1;
  console.log(ok ? 'PASS' : 'FAIL', p, `scrollW ${m.scrollW} vs clientW ${m.clientW}, header ${Math.round(m.headerH)}px`);
}
await browser.close();
