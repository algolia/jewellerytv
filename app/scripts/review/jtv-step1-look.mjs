/* jtv-step1-look.mjs — READ-ONLY attach to the user's Chrome (port 9223).
 * List tabs, screenshot the current page as-is. NO reload, NO navigation. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/prompt-review-2026-10-26/jtv-census-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 15000 });
for (const ctx of browser.contexts()) {
  for (const [i, p] of ctx.pages().entries()) {
    console.log(`[${i}]`, p.url().slice(0, 140));
  }
}
const all = browser.contexts().flatMap((c) => c.pages());
const tab = all.find((p) => /jtv\.com/.test(p.url())) ?? all[all.length - 1];
console.log('\nusing tab:', tab.url().slice(0, 140));
console.log('title:', await tab.title());
await tab.bringToFront().catch(() => {});
await tab.screenshot({ path: join(OUT, 'step1-current.png') });
console.log('OUT:', OUT);
process.exit(0);
