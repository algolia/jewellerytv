/* Verify the on-air use cases on the dev agent: three connected turns, one per
 * rule that can fail. Shopping a show must produce tiles, a host question must
 * stay prose, and a live question must refuse the claim. Reports the reply
 * text, the tile count, and the present_products receipt so the reader can see
 * which objectIDs the model chose and what the tool dropped.
 *
 * Read-only: shopper turns against the configured local stack. Consumes agent
 * completions. Same shape as ../declaration-shadow-2026-10-26/verify-declaration.mjs.
 *   JTV_APP_URL=http://localhost:5173/ node verify-on-air.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

const APP = process.env.JTV_APP_URL ?? 'http://localhost:5173/';
/* Uses the installed Chrome rather than a downloaded bundle, so the run needs
 * no `npx playwright install`. */
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

async function newConversation() {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByText('Ask JTV', { exact: true }).first().click();
  await page.waitForSelector('#connected-concierge-input', { timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function send(text) {
  await page.fill('#connected-concierge-input', text);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#connected-concierge-input');
      return el && !el.disabled;
    },
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(4000);
}

/* Prose only. The assistant bubble also wraps the narrowing chips and the tile
 * prices, so counting its innerText would overstate what the model wrote. */
const replyProse = () =>
  page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('.connected-assistant-message')];
    const last = bubbles[bubbles.length - 1];
    if (!last) return '';
    return [...last.querySelectorAll('.connected-assistant-text-part p')]
      .map((p) => p.innerText.trim())
      .filter(Boolean)
      .join(' ');
  });

/* The model-visible present_products output is stripped, so the forensics live
 * in sessionStorage. craig-pearl-headed.mjs reads the same receipt. */
const presentReceipt = () =>
  page.evaluate(() => {
    const raw = sessionStorage.getItem('instantsearch-chat-initial-messages');
    if (!raw) return null;
    try {
      const messages = JSON.parse(raw);
      const parts = (Array.isArray(messages) ? messages : (messages.messages ?? []))
        .flatMap((message) => message.parts ?? [])
        .filter((part) => part.type === 'tool-present_products');
      const last = parts[parts.length - 1];
      if (!last) return null;
      return {
        requested: last.input?.objectIDs?.length ?? 0,
        shown: last.output?.objectIDs?.length ?? 0,
        dropped: last.output?.dropped ?? [],
        status: last.output?.status ?? null,
      };
    } catch {
      return null;
    }
  });

const CHECKS = [
  {
    id: 'shop-a-show',
    ask: 'What was on Jewel School this week?',
    expect: 'Tiles render. Prose states no price and no invented calendar date.',
  },
  {
    id: 'host-following',
    ask: "Show me Misty's shows",
    expect: 'Prose schedule with the on-demand link. No tiles.',
  },
  {
    id: 'refuses-live',
    ask: "What's on right now?",
    expect: 'Refuses the live claim and points at the Program Guide.',
  },
];

const turns = [];
for (const [index, check] of CHECKS.entries()) {
  await newConversation();
  await send(check.ask);
  const prose = await replyProse();
  const tiles = await page.locator('.pw-product--discover').count();
  const receipt = await presentReceipt();
  const links = await page
    .locator('.connected-assistant-text-part a')
    .evaluateAll((els) => els.map((a) => a.getAttribute('href')));
  await page.screenshot({ path: join(OUT, `${index}-${check.id}.png`), fullPage: false });
  turns.push({ ...check, prose, tiles, links, receipt });
  console.log(
    `${check.id} | tiles=${tiles} | links=${links.length} | ` +
      `present=${receipt ? `${receipt.shown}/${receipt.requested}` : 'none'}\n  ${prose}\n`,
  );
}

writeFileSync(join(OUT, 'turns.json'), JSON.stringify({ turns, out: OUT }, null, 1));
console.log('RUN DIR:', OUT);
await browser.close();
