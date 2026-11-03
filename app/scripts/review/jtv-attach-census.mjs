/* jtv-attach-census.mjs — attach to the USER's CDP Chrome (they solved the Incapsula
 * challenge and loaded the results page). Enumerate tabs, attach a capture listener,
 * then ONE gentle reload of the jtv search tab with full request+JSON capture. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const OUT = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/prompt-review-2026-10-26/jtv-census-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 15000 });
const context = browser.contexts()[0];
const pages = context.pages();
console.log('open tabs:');
pages.forEach((p, i) => console.log(`  [${i}]`, p.url().slice(0, 120)));

const target = pages.find((p) => /jtv\.com/.test(p.url())) ?? pages[pages.length - 1];
console.log('capturing tab:', target.url().slice(0, 120));

const requests = [];
const apiBodies = [];
page_loop: {
  const page = target;
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), type: r.resourceType(), post: (r.postData() ?? '').slice(0, 400) }));
  page.on('response', async (r) => {
    const ct = (r.headers()['content-type'] ?? '');
    if (!/json/i.test(ct)) return;
    try { apiBodies.push({ url: r.url(), status: r.status(), head: (await r.text()).slice(0, 1200) }); } catch {}
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(14000);
}
const finalUrl = target.url();
const title = await target.title();
await target.screenshot({ path: join(OUT, 'results.png') });
await page.waitForTimeout(3000);
await target.screenshot({ path: join(OUT, 'results-full.png'), fullPage: true });

writeFileSync(join(OUT, 'requests.json'), JSON.stringify({ finalUrl, title, count: requests.length, requests }, null, 1));
writeFileSync(join(OUT, 'json-bodies.json'), JSON.stringify({ count: apiBodies.length, bodies: apiBodies }, null, 1));

const interesting = requests.filter((r) => !/\.(png|jpg|jpeg|gif|css|woff2?|svg|ico|js|map)(\?|$)/i.test(r.url) && !/doubleclick|criteo|facebook|bing|tiktok|pinterest|snap|hotjar|qualtrics|yotpo|analytics|gtag|omtr|demdex/i.test(r.url));
console.log('\nfinal URL:', finalUrl);
console.log('title:', title);
console.log('total requests:', requests.length, '| non-static:', interesting.length);
for (const r of interesting.slice(0, 60)) {
  console.log(`[${r.method}] (${r.type}) ${r.url.slice(0, 170)}`);
  if (r.post) console.log('   post:', r.post.slice(0, 300));
}
console.log('\nJSON responses:', apiBodies.length);
for (const b of apiBodies.slice(0, 30)) console.log('  JSON:', b.status, b.url.slice(0, 150), '::', b.head.slice(0, 150).replace(/\s+/g, ' '));
console.log('OUT:', OUT);
process.exit(0);
