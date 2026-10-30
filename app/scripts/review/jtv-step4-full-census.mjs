/* jtv-step4-full-census.mjs — CORRECTED verification.
 * The earlier census hit Chrome's 250-entry resource buffer cap and was truncated.
 * This: injects a 20k buffer at document start, reloads the user's verified tab once,
 * then (1) full resource census, (2) locates the Level-1 chip strip and Trending section
 * by content, (3) correlates section data with the requests that carried it. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/prompt-review-2026-10-26/jtv-census-latest';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 15000 });
const all = browser.contexts().flatMap((c) => c.pages());
const tab = all.find((p) => /jtv\.com/.test(p.url()));
await tab.addInitScript(() => { try { performance.setResourceTimingBufferSize(20000); } catch {} });

const liveRequests = [];
const liveJson = [];
tab.on('request', (r) => liveRequests.push({ url: r.url(), method: r.method(), type: r.resourceType(), post: (r.postData() ?? '').slice(0, 500) }));
tab.on('response', async (r) => {
  const ct = (r.headers()['content-type'] ?? '');
  if (!/json/i.test(ct)) return;
  try { liveJson.push({ url: r.url(), status: r.status(), head: (await r.text()).slice(0, 1500) }); } catch {}
});

await tab.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
await tab.waitForTimeout(15000);
await tab.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => console.log('networkidle not reached in 20s — continuing with what fired'));

const title = await tab.title();
const perf = await tab.evaluate(() => {
  const res = performance.getEntriesByType('resource').map((e) => ({ url: e.name, type: e.initiatorType, size: e.transferSize, start: Math.round(e.startTime) }));
  // locate the three levels by CONTENT
  const findHeading = (re) => { const h = [...document.querySelectorAll('h1,h2,h3,h4,div,span,section')].find((e) => re.test((e.textContent ?? '').trim()) && (e.textContent ?? '').trim().length < 60); return h ? { tag: h.tagName, cls: String(h.className).slice(0, 80), text: h.textContent.trim().slice(0, 60) } : null; };
  const chips = [...document.querySelectorAll('a,button')].map((e) => (e.textContent ?? '').trim()).filter((t) => t && t.length < 40 && /cluster|halo|solitaire|vintage|three.stone|side.stone|anniversary/i.test(t)).slice(0, 12);
  const trendingHeading = findHeading(/trending/i);
  let trendingSection = null;
  if (trendingHeading) {
    let node = trendingHeading.closest('section,div');
    for (let i = 0; i < 4 && node && node.querySelectorAll('img,a[href*="/product/"],a[href*="product"]').length < 3; i++) node = node.parentElement;
    trendingSection = node ? { cls: String(node.className).slice(0, 80), products: node.querySelectorAll('a').length, imgs: node.querySelectorAll('img').length } : null;
  }
  return {
    title, totalResources: res.length,
    chipsFound: chips,
    trendingHeading, trendingSection,
    productCount: document.querySelectorAll('a[href*="product"]').length,
    resources: res,
  };
});
writeFileSync(join(OUT, 'full-census.json'), JSON.stringify({ title, perf: perf.resources, liveRequests, liveJson }, null, 1));

console.log('title:', title);
console.log('FULL resource count:', perf.totalResources, '(was 250 truncated before)');
console.log('Level-1 chip strip candidates:', JSON.stringify(perf.chipsFound));
console.log('Trending heading:', JSON.stringify(perf.trendingHeading));
console.log('Trending section:', JSON.stringify(perf.trendingSection));
console.log('product links:', perf.productCount);

const SKIP = /\.(png|jpe?g|gif|css|woff2?|svg|ico|js|map)(\?|$)/i;
const NOISE = /doubleclick|criteo|facebook|bing|tiktok|pinterest|snap|hotjar|qualtrics|yotpo|gtag|google-analytics|googletagmanager|omtr|demdex|cookielaw|onetrust/i;
const api = perf.resources.filter((r) => !SKIP.test(r.url) && !NOISE.test(r.url));
console.log('\nnon-static, non-noise (full):', api.length);
for (const r of api) console.log(` [${r.type}] ${String(r.size).padStart(7)}B @${String(r.start).padStart(6)}ms ${r.url.slice(0, 160)}`);
console.log('\nlive JSON responses:', liveJson.length);
for (const b of liveJson.slice(0, 30)) console.log('  JSON:', b.status, b.url.slice(0, 150), '::', b.head.slice(0, 130).replace(/\s+/g, ' '));
console.log('OUT:', OUT);
process.exit(0);
