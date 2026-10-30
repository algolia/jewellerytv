/* jtv-step2-census.mjs — read the ALREADY-LOADED page's resource entries (no reload).
 * performance.getEntriesByType('resource') = every request the page made, with URLs.
 * Classify: API/search endpoints vs static. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/prompt-review-2026-10-26/jtv-census-latest';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 15000 });
const all = browser.contexts().flatMap((c) => c.pages());
const tab = all.find((p) => /jtv\.com/.test(p.url()));
const entries = await tab.evaluate(() => {
  const res = performance.getEntriesByType('resource').map((e) => ({
    url: e.name,
    type: e.initiatorType,
    size: e.transferSize,
    duration: Math.round(e.duration),
    start: Math.round(e.startTime),
  }));
  return { url: location.href, title: document.title, nav: performance.getEntriesByType('navigation').map((n) => ({ url: n.name, type: n.type, redirects: n.redirectCount })), count: res.length, resources: res };
});
writeFileSync(join(OUT, 'resource-entries.json'), JSON.stringify(entries, null, 1));
console.log('page:', entries.url);
console.log('title:', entries.title, '| nav type:', entries.nav[0]?.type, '| redirects:', entries.nav[0]?.redirects);
console.log('total resources:', entries.count);

const SKIP = /\.(png|jpe?g|gif|css|woff2?|svg|ico|js|map)(\?|$)/i;
const NOISE = /doubleclick|criteo|facebook|bing|tiktok|pinterest|snap|hotjar|qualtrics|yotpo|analytics|gtag|omtr|demdex|akstat|akamai|incapsula/i;
const api = entries.resources.filter((r) => !SKIP.test(r.url) && !NOISE.test(r.url));
console.log('\nnon-static, non-noise:', api.length);
for (const r of api) console.log(` [${r.type}] ${String(r.size).padStart(7)}B ${String(r.duration).padStart(5)}ms @${String(r.start).padStart(6)}ms ${r.url.slice(0, 150)}`);
console.log('OUT:', OUT);
process.exit(0);
