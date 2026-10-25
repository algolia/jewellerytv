/* probe-sterling.mjs: one-scenario probe for the material-filter fix. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(path.join(here, '..', 'node_modules', 'playwright', 'index.mjs'));
const BASE = 'http://localhost:5291';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(BASE);
await page.waitForTimeout(2500);
await page.evaluate(() => sessionStorage.clear());
await page.goto(BASE);
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Ask JTV' }).click();
await page.waitForTimeout(1200);
await page.getByRole('textbox', { name: 'Message the Concierge' }).fill(process.env.JTV_PROBE_QUERY ?? 'show me sterling silver jewellery');
await page.getByRole('button', { name: 'Send' }).click();
await page.waitForTimeout(32000);
const data = await page.evaluate(() => {
  const messages = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages') ?? '[]');
  const panel = document.querySelector('aside.concierge-panel');
  const out = { searches: [], presents: [], tiles: [] };
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { lastUser = i; break; }
  for (const m of messages.slice(lastUser + 1)) {
    if (m.role !== 'assistant') continue;
    for (const p of m.parts ?? []) {
      if (p.type?.startsWith('tool-algolia_search_index'))
        out.searches.push({ queries: p.input?.queries?.map((q) => q.query), filters: p.input?.queries?.[0]?.filters ?? null, facetFilters: p.input?.queries?.[0]?.facetFilters ?? null });
      if (p.type === 'tool-present_products')
        out.presents.push({ picked: (p.input?.objectIDs ?? []).length, displayFacets: p.input?.displayFacets ?? [], dropped: (p.output?.dropped ?? []).map((d) => `${d.objectID}:${d.reason}`) });
    }
  }
  out.tiles = [...new Set([...panel.querySelectorAll('a[href^="/product/"]')].map((a) => (a.getAttribute('aria-label') ?? '').slice(0, 58)))].slice(0, 8);
  return out;
});
console.log(JSON.stringify(data, null, 1));
await browser.close();
