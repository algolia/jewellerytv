/* jtv-search-census.mjs — network census of the jtv.com search results page (Arijit's diligence request).
 * ONE query ("diamond ring"), every request captured: url, method, status, type, body head.
 * Goal: how many queries the page sends and what feeds the three levels (facets / trending / products).
 * Gentle pace: single navigation, no retries hammering. Imperva WAF: headless+stealth first, headed fallback.
 * Run: node app/scripts/review/jtv-search-census.mjs [--headed]
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/prompt-review-2026-10-26/jtv-census-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
mkdirSync(OUT, { recursive: true });

// Stealth plugin lives in the audit skill's node_modules.
const require2 = createRequire('/Users/arijitchowdhury/.claude/skills/algolia-search-audit/package.json');
let chromium;
try {
  const { chromium: c } = require2('playwright-extra');
  const stealth = require2('puppeteer-extra-plugin-stealth');
  c.use(stealth());
  chromium = c;
  console.log('stealth: on');
} catch (e) {
  ({ chromium } = await import('playwright'));
  console.log('stealth: unavailable, plain playwright (' + String(e).slice(0, 80) + ')');
}

const headed = process.argv.includes('--headed');
const browser = await chromium.launch({ headless: !headed, channel: undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const requests = [];
const apiBodies = [];
page.on('request', (r) => {
  requests.push({
    url: r.url(),
    method: r.method(),
    type: r.resourceType(),
    post: (r.postData() ?? '').slice(0, 300),
  });
});
page.on('response', async (r) => {
  const url = r.url();
  const ct = (r.headers()['content-type'] ?? '');
  if (!/json/i.test(ct)) return;
  try {
    const body = await r.text();
    apiBodies.push({ url, status: r.status(), head: body.slice(0, 500) });
  } catch { /* stream bodies */ }
});

const t0 = Date.now();
await page.goto('https://www.jtv.com/search?q=diamond+ring', { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.waitForTimeout(9000); // let the sections load
const finalUrl = page.url();
const title = await page.title();
await page.screenshot({ path: join(OUT, 'results.png'), fullPage: false });
await page.waitForTimeout(3000);
await page.screenshot({ path: join(OUT, 'results-full.png'), fullPage: true });

writeFileSync(join(OUT, 'requests.json'), JSON.stringify({ finalUrl, title, elapsedMs: Date.now() - t0, count: requests.length, requests }, null, 1));
writeFileSync(join(OUT, 'json-bodies.json'), JSON.stringify({ count: apiBodies.length, bodies: apiBodies }, null, 1));

/* Console summary: non-static requests only */
const interesting = requests.filter((r) => !/\.(png|jpg|jpeg|gif|css|woff2?|svg|ico|js)(\?|$)/i.test(r.url) && !/google|facebook|doubleclick|criteo|bing|tiktok|pinterest|snap|hotjar|qualtrics|yotpo|akstat|akamaihd/i.test(r.url));
console.log('final URL:', finalUrl);
console.log('title:', title);
console.log('total requests:', requests.length, '| non-static:', interesting.length);
for (const r of interesting.slice(0, 40)) {
  console.log(`[${r.method}] ${r.status ?? ''} (${r.type}) ${r.url.slice(0, 150)}`);
  if (r.post) console.log('   post:', r.post.slice(0, 200));
}
console.log('JSON responses captured:', apiBodies.length);
for (const b of apiBodies.slice(0, 15)) console.log('  JSON:', b.status, b.url.slice(0, 130), '::', b.head.slice(0, 120).replace(/\n/g, ' '));
await browser.close();
console.log('OUT:', OUT);
