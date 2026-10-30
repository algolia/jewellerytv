/* repro-tap.mjs: one fresh turn, then tap the first chip and dump the funnel
 * state (refined results, next-level chips). Verifies the tap refine end to end. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const run = resolve(here, `repro-tap-${Date.now()}`);
mkdirSync(run, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2_500);
const panel = page.getByRole('complementary', { name: 'Jewelry buying Concierge' });
if (!(await panel.isVisible().catch(() => false))) {
  await page.getByRole('button', { name: 'Ask JTV' }).click();
  await panel.waitFor({ state: 'visible', timeout: 10_000 });
}
const composer = page.getByRole('textbox', { name: 'Message the Concierge' });
await composer.fill(process.env.REPRO_Q1 ?? 'show me some amethyst pieces to browse');
await page.getByRole('button', { name: 'Send' }).click();
await page.waitForTimeout(45_000);
const chips = page.locator('.connected-facet-chip');
const chipCount = await chips.count();
console.log('chips:', chipCount);
if (chipCount) {
  const label = (await chips.first().textContent())?.trim();
  await chips.first().click();
  await page.waitForTimeout(12_000);
  const after = await page.evaluate(() => {
    const p = document.querySelector('aside.concierge-panel');
    return {
      selectedLine: p?.querySelector('.connected-inline-results-line')?.textContent ?? null,
      refineTiles: [...new Set([...(p?.querySelectorAll('.connected-facet-results a[href^="/product/"]') ?? [])].map((a) => (a.getAttribute('aria-label') ?? '').slice(0, 60)))],
      nextChips: [...(p?.querySelectorAll('.connected-facet-chip') ?? [])].map((b) => b.textContent?.trim()),
      back: !!p?.querySelector('.connected-facet-back'),
    };
  });
  await page.screenshot({ path: resolve(run, 'after-tap.png'), fullPage: true });
  console.log('tapped:', label, JSON.stringify(after));
  writeFileSync(resolve(run, 'after-tap.json'), JSON.stringify({ label, ...after }, null, 2));
}
await browser.close();
