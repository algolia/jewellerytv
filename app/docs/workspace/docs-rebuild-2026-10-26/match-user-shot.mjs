import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const BASE = 'https://jewellerytv.vercel.app/docs/';
const pages = ['index.html', 'experience.html', 'architecture.html', 'agent.html', 'examples.html', 'adopting.html', 'appendix-prompts.html'];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1419, height: 1307 } });
for (const p of pages) {
  await page.goto(BASE + p, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `/tmp/match-${p.replace('.html', '')}.png` });
}
await browser.close();
console.log('shots done');
