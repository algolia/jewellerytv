import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const here = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/docs-rebuild-2026-10-26';
const BASE = 'https://jewellerytv.vercel.app/docs/';
const pages = ['index.html', 'experience.html', 'architecture.html', 'agent.html', 'examples.html', 'appendix-prompts.html'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${page.url()}: ${m.text().slice(0, 120)}`); });
page.on('pageerror', (e) => errors.push(`${page.url()}: ${String(e).slice(0, 160)}`));
const report = [];
for (const p of pages) {
  const resp = await page.goto(BASE + p, { waitUntil: 'networkidle' });
  const check = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')].map((i) => ({ src: i.getAttribute('src'), ok: i.naturalWidth > 0 }));
    const css = getComputedStyle(document.querySelector('.docs-header') ?? document.body).position;
    const h1 = document.querySelector('h1')?.textContent ?? 'NO H1';
    const current = document.querySelector('.docs-nav a[aria-current="page"]')?.textContent?.trim() ?? 'NONE';
    const navLinks = document.querySelectorAll('.docs-nav a').length;
    return { imgs, cssApplied: css === 'sticky', h1, current, navLinks };
  });
  await page.screenshot({ path: resolve(here, `walk-${p.replace('.html', '')}.png`), fullPage: true });
  report.push({ page: p, status: resp.status(), ...check });
}
writeFileSync(resolve(here, 'walk-report.json'), JSON.stringify({ report, errors }, null, 2));
for (const r of report) console.log(r.status, r.page, '| h1:', r.h1, '| nav-current:', r.current, '| imgs ok:', r.imgs.filter((i) => i.ok).length + '/' + r.imgs.length, '| css:', r.cssApplied, '| nav links:', r.navLinks);
console.log('console/page errors:', errors.length ? errors : 'none');
await browser.close();
