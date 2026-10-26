/* Verify the negation fix (2026-10-26) on the live dev app + dev agent:
 * the tester's exact three-turn journey. Before the fix, turn 3 ("no
 * specific stone, but my budget is $200") enforced the gemstone value
 * "Multi-Stone" and every candidate dropped as requirement_mismatch — the
 * shelf came back empty twice and the agent reported a snag. Acceptance:
 * the third turn renders a shelf (floor is six tiles) with no snag reply.
 * Output: screenshots + verify-receipts.json in run-<ts>/ here. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

const APP = process.env.JTV_APP_URL ?? 'http://localhost:5173/';
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

const receipts = { app: APP, turns: [] };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function send(text) {
  await page.fill('#connected-concierge-input', text);
  await page.keyboard.press('Enter');
}

async function waitTurnDone(minMs = 4000) {
  await page.waitForFunction(
    () => {
      const input = document.querySelector('#connected-concierge-input');
      return input && !input.disabled;
    },
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(minMs);
}

await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByText('Ask JTV', { exact: true }).first().click();
await page.waitForSelector('#connected-concierge-input', { timeout: 30000 });
await page.waitForTimeout(1500);

const journey = [
  { say: 'Vintage or modern?', label: 't1-chip' },
  { say: 'How about a ring?', label: 't2-ring' },
  { say: 'no specific stone, but my budget is $200', label: 't3-budget' },
];

for (const step of journey) {
  await send(step.say);
  await waitTurnDone();
  await page.waitForTimeout(3000);
  await shot(page, step.label);
  const state = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.pw-tile, .pw-card, [class*="pw-"] img')].length;
    const images = [...document.querySelectorAll('[class*="workspace"] img, [class*="canvas"] img')].length;
    const text = document.body.innerText;
    return {
      tileCount: tiles,
      workspaceImages: images,
      snagMention: /snag/i.test(text),
      lastReply: text.split('\n').filter(Boolean).slice(-8).join(' | ').slice(0, 500),
    };
  });
  receipts.turns.push({ label: step.label, said: step.say, ...state });
}

writeFileSync(join(OUT, 'verify-receipts.json'), JSON.stringify(receipts, null, 1));
console.log('RUN DIR:', OUT);
for (const t of receipts.turns)
  console.log(`${t.label}: tiles=${t.tileCount} workspaceImages=${t.workspaceImages} snag=${t.snagMention}`);
await browser.close();
