/* jtv-search-census-cdp.mjs — same census, through the user's REAL Chrome over CDP.
 * Imperva fingerprints Playwright's Chromium; a real Chrome binary passes (Coach.com lesson).
 * Launch: /Applications/Google Chrome.app/... --remote-debugging-port=9223 --user-data-dir=/tmp/jtv-audit-profile
 * Run: node app/scripts/review/jtv-search-census-cdp.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/prompt-review-2026-10-26/jtv-census-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 15000 });
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

const requests = [];
const apiBodies = [];
page.on('request', (r) => {
  requests.push({ url: r.url(), method: r.method(), type: r.resourceType(), post: (r.postData() ?? '').slice(0, 400) });
});
page.on('response', async (r) => {
  const ct = (r.headers()['content-type'] ?? '');
  if (!/json/i.test(ct)) return;
  try {
    const body = await r.text();
    apiBodies.push({ url: r.url(), status: r.status(), head: body.slice(0, 800) });
  } catch { /* streamed */ }
});

const t0 = Date.now();
await page.goto('https://www.jtv.com/search?q=diamond+ring', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(12000);
const finalUrl = page.url();
const title = await page.title();
await page.screenshot({ path: join(OUT, 'results.png') });
await page.waitForTimeout(4000);
await page.screenshot({ path: join(OUT, 'results-full.png'), fullPage: true });

writeFileSync(join(OUT, 'requests.json'), JSON.stringify({ finalUrl, title, elapsedMs: Date.now() - t0, count: requests.length, requests }, null, 1));
writeFileSync(join(OUT, 'json-bodies.json'), JSON.stringify({ count: apiBodies.length, bodies: apiBodies }, null, 1));

const interesting = requests.filter((r) => !/\.(png|jpg|jpeg|gif|css|woff2?|svg|ico|js)(\?|$)/i.test(r.url) && !/doubleclick|criteo|facebook|bing|tiktok|pinterest|snap|hotjar|qualtrics|yotpo|google-analytics|googletagmanager/i.test(r.url));
console.log('final URL:', finalUrl);
console.log('title:', title);
console.log('total requests:', requests.length, '| non-static:', interesting.length);
for (const r of interesting.slice(0, 60)) {
  console.log(`[${r.method}] (${r.type}) ${r.url.slice(0, 160)}`);
  if (r.post) console.log('   post:', r.post.slice(0, 250));
}
console.log('\nJSON responses:', apiBodies.length);
for (const b of apiBodies.slice(0, 25)) console.log('  JSON:', b.status, b.url.slice(0, 140), '::', b.head.slice(0, 140).replace(/\s+/g, ' '));
await page.close();
console.log('OUT:', OUT);
process.exit(0);
