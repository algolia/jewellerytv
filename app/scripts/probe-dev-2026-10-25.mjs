/* probe-dev-2026-10-25.mjs: post-apply probe of the Dev agent (fresh literals;
 * Agent Studio caches completions by exact question, so none of these
 * phrasings were used in earlier runs). Covers the Gems en Vogue brand case
 * and the three requirement cases for the structural fix (tool reads the
 * shopper's own message). Drives the local dev stack (5173 = dev agent),
 * prints per turn: search inputs (query + filters), present_products input,
 * tiles rendered. Read-only; never writes. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(path.join(here, '..', 'node_modules', 'playwright', 'index.mjs'));

const BASE = process.env.JTV_PROBE_BASE ?? 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function freshConversation() {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Ask JTV' }).click();
  await page.waitForTimeout(1200);
}

async function send(text, wait = 34000) {
  await page.getByRole('textbox', { name: 'Message the Concierge' }).fill(text);
  await page.getByRole('button', { name: 'Send' }).click().catch(async () => {
    await page.getByRole('textbox', { name: 'Message the Concierge' }).press('Enter');
  });
  await page.waitForTimeout(wait);
}

async function dump(label) {
  const data = await page.evaluate(() => {
    const messages = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages') ?? '[]');
    const panel = document.querySelector('aside.concierge-panel');
    const tiles = [...new Set([...panel.querySelectorAll('a[href^="/product/"]')].map((a) => (a.getAttribute('aria-label') ?? '').slice(0, 58)))];
    const searches = [];
    const presents = [];
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { lastUser = i; break; }
    for (const m of messages.slice(lastUser + 1)) {
      if (m.role !== 'assistant') continue;
      for (const p of m.parts ?? []) {
        if (p.type?.startsWith('tool-algolia_search_index'))
          searches.push({ queries: p.input?.queries?.map((q) => q.query), filters: p.input?.queries?.[0]?.filters ?? null, facetFilters: p.input?.queries?.[0]?.facetFilters ?? null });
        if (p.type === 'tool-present_products')
          presents.push({ picked: (p.input?.objectIDs ?? []).length, displayFacets: p.input?.displayFacets ?? [], returned: (p.output?.objectIDs ?? []).length, dropped: (p.output?.dropped ?? []).length });
      }
    }
    return { searches, presents, tiles: tiles.slice(0, 9) };
  });
  console.log('\n=== ' + label + ' ===');
  console.log(JSON.stringify(data, null, 1));
}

await page.goto(BASE);
await page.waitForTimeout(2500);

await freshConversation();
await send("I'd love to browse some Gems en Vogue designs");
await dump('brand: Gems en Vogue (expect facet filter Catalog_BrandNavigationName "Gems En Vogue")');

await freshConversation();
await send('can you show me genuine sterling silver pieces');
await dump('requirement: sterling silver (expect purity filter, tiles all sterling)');

await freshConversation();
await send('show me ruby earrings for everyday wear');
await dump('requirement: ruby earrings (expect gemstone filter, no perfume tiles)');

await freshConversation();
await send('what gold necklaces do you have right now');
await dump('requirement: gold necklaces (expect karat filters, no silver-looking gold-over tiles)');

await browser.close();
