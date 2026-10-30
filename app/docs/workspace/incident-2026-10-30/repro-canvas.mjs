/* repro-canvas.mjs: drive the real app on 5173 with fresh questions and dump
 * the app's own transcript (sessionStorage instantsearch-chat-initial-messages)
 * plus the panel DOM (tiles/chips) and console errors. Read-only; one fresh
 * conversation.   node docs/workspace/incident-2026-10-30/repro-canvas.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const run = resolve(here, `repro-${stamp}`);
mkdirSync(resolve(run, 'shots'), { recursive: true });

const Q1 = process.env.REPRO_Q1 ?? 'could you show me some garnet pieces for a friend';
const Q2 = process.env.REPRO_Q2 ?? 'make them under fifty dollars';
const SETTLE = Number(process.env.REPRO_SETTLE ?? 45_000);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
const apiCalls = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('response', async (r) => {
  if (!r.url().includes('/api/search')) return;
  try {
    const body = await r.json();
    const res = body?.results?.[0] ?? {};
    apiCalls.push({ status: r.status(), facetsAttrs: Object.keys(res.facets ?? {}), nbHits: res.nbHits });
  } catch { apiCalls.push({ status: r.status(), parse: 'failed' }); }
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2_500);
const panel = page.getByRole('complementary', { name: 'Jewelry buying Concierge' });
if (!(await panel.isVisible().catch(() => false))) {
  await page.getByRole('button', { name: 'Ask JTV' }).click();
  await panel.waitFor({ state: 'visible', timeout: 10_000 });
}

async function dump(tag) {
  const data = await page.evaluate(() => {
    const messages = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages') ?? '[]');
    const panel = document.querySelector('aside.concierge-panel');
    const partSummary = [];
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      for (const p of m.parts ?? []) {
        partSummary.push({
          type: p.type,
          inputKeys: p.input && typeof p.input === 'object' ? Object.keys(p.input) : null,
          input: p.input ? JSON.stringify(p.input).slice(0, 300) : null,
          outputKeys: p.output && typeof p.output === 'object' ? Object.keys(p.output) : null,
          output: p.output ? JSON.stringify(p.output).slice(0, 400) : null,
          textHead: typeof p.text === 'string' ? p.text.slice(0, 160) : null,
        });
      }
    }
    let tiles = [], chipButtons = [];
    if (panel) {
      tiles = [...new Set([...panel.querySelectorAll('a[href^="/product/"]')].map((a) => (a.getAttribute('aria-label') ?? '').slice(0, 70)))];
      chipButtons = [...panel.querySelectorAll('.connected-facet-chip')].map((b) => b.textContent?.trim());
    }
    return { messageCount: messages.length, partSummary, tiles, chipButtons };
  });
  await page.screenshot({ path: resolve(run, 'shots', `${tag}.png`), fullPage: true });
  writeFileSync(resolve(run, `${tag}.json`), JSON.stringify(data, null, 2));
  console.log(tag, JSON.stringify({ msgs: data.messageCount, tiles: data.tiles.length, chips: data.chipButtons.length, parts: data.partSummary.map((p) => p.type).join(',') }));
  return data;
}

async function ask(text, tag) {
  const composer = page.getByRole('textbox', { name: 'Message the Concierge' });
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('textarea, input[aria-label="Message the Concierge"]');
      return !!el && !el.disabled;
    }, { timeout: 30_000 });
  } catch { /* fall through */ }
  await composer.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForTimeout(SETTLE);
  return dump(tag);
}

await dump('turn0-initial');
await ask(Q1, 'turn1');
await ask(Q2, 'turn2');
writeFileSync(resolve(run, 'console-errors.json'), JSON.stringify(errors, null, 2));
writeFileSync(resolve(run, 'api-calls.json'), JSON.stringify(apiCalls, null, 2));
console.log('api/search calls:', JSON.stringify(apiCalls));
console.log('console errors:', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
