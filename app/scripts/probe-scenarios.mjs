/* probe-scenarios.mjs: the Phase A evidence run (plan A11). Drives the three
 * failing scenarios against the Dev agent on the worktree stack and prints,
 * per turn: the agent's search inputs (query + filters), the present_products
 * input (model's curation + facet pick), the tiles that rendered, and the
 * chips shown. One script, not a family; kept for future probe reruns. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(path.join(here, '..', 'node_modules', 'playwright', 'index.mjs'));

const BASE = process.env.JTV_PROBE_BASE ?? 'http://localhost:5291';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

async function freshConversation() {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Ask JTV' }).click();
  await page.waitForTimeout(1200);
}

async function send(text, wait = 32000) {
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
    const chips = [...panel.querySelectorAll('button')]
      .map((b) => b.textContent?.trim())
      .filter((t) => t && !/Conversation|Products|Link$|^(New|Send|Move|Maximize|Close|Resize|Pause|Preferences|‹)/.test(t) && t.length < 34);
    const tiles = [...new Set([...panel.querySelectorAll('a[href^="/product/"]')].map((a) => (a.getAttribute('aria-label') ?? '').slice(0, 58)))];
    const searches = [];
    const presents = [];
    /* Latest turn only: everything after the last shopper message. */
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { lastUser = i; break; }
    for (const m of messages.slice(lastUser + 1)) {
      if (m.role !== 'assistant') continue;
      for (const p of m.parts ?? []) {
        if (p.type?.startsWith('tool-algolia_search_index'))
          searches.push({ queries: p.input?.queries?.map((q) => q.query), filters: p.input?.queries?.[0]?.filters ?? null, facetFilters: p.input?.queries?.[0]?.facetFilters ?? null });
        if (p.type === 'tool-present_products')
          presents.push({ picked: (p.input?.objectIDs ?? []).length, displayFacets: p.input?.displayFacets ?? [], returned: (p.output?.objectIDs ?? []).length, dropped: p.output?.dropped ?? [] });
      }
    }
    return { searches, presents, tiles: tiles.slice(0, 8), chips: [...new Set(chips)].slice(0, 10) };
  });
  console.log('\n=== ' + label + ' ===');
  console.log(JSON.stringify(data, null, 1));
}

await page.goto(BASE);
await page.waitForTimeout(2500);

await freshConversation();
await send('show me sterling silver jewellery');
await dump('scenario 1: sterling silver jewellery');

await freshConversation();
await send('I am looking for anniversary gifts');
await dump('scenario 2 turn 1: anniversary gifts (chips expected)');
// Tap the first real chip if one rendered
const chipLabel = await page.evaluate(() => {
  const panel = document.querySelector('aside.concierge-panel');
  const buttons = [...panel.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
  return buttons.find((t) => t && !/Conversation|Products|^(New|Send|Move|Maximize|Close|Resize|Pause|Preferences|‹)/.test(t) && t.length < 30) ?? null;
});
if (chipLabel) {
  await page.getByRole('button', { name: chipLabel, exact: true }).first().click();
  await page.waitForTimeout(5000);
  await dump('scenario 2 turn 2: after tapping chip "' + chipLabel + '"');
  await send('make it ruby', 30000);
  await dump('scenario 2 turn 3: typed narrowing "make it ruby"');
}

await freshConversation();
await send('engagement rings under 1000');
await dump('scenario 3: engagement rings under 1000 (no hardware chips)');

await browser.close();
