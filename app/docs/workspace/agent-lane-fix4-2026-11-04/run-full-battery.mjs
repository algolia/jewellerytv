/* run-full-battery.mjs — the class-coverage battery (rebuilds the archived
 * 35x3x3 discipline). One journey per rule-class the prompt carries, graded
 * on the rendered screen + reply text with class-specific checks. This is the
 * certification surface the six-journey smoke could not cover.
 *
 * Classes (from the compact prompt's own sections):
 *  C1  broad browse            C7  two-meaning direction
 *  C2  style brief (breadth)   C8  facet edge: gold-over-sterling trap
 *  C3  gift + recipient        C9  brand facet
 *  C4  mid-course correction   C10 education (care/composition)
 *  C5  budget strict/inclusive C11 policy (returns/shipping)
 *  C6  thin results honesty    C12 on-air (host query, no-live-claim trap)
 *  C13 trending trap           C14 specific product by name
 *
 * Usage: NODE_USE_SYSTEM_CA=1 node run-full-battery.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from '../../../scripts/baseline/settings.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'battery-full-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });
const APP = process.env.JTV_APP_URL ?? 'http://localhost:5173/';
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

const S = loadSettings();
console.log('full battery against dev agent', S.devAgentId, 'at', APP);

/* Fresh literals. Turns are trimmed to what the class tests. */
const JOURNEYS = [
  { name: 'C1-broad-browse', steps: [ { say: 'Show me garnet jewelry' } ] },
  { name: 'C2-style-brief', steps: [ { say: 'Something delicate and romantic for an anniversary dinner' } ] },
  { name: 'C3-gift-recipient', steps: [ { say: 'I need a christmas present for my little niece, she is seven' } ] },
  { name: 'C4-correction', steps: [ { say: 'Show me gold hoops' }, { say: 'Actually, silver hoops instead.' } ] },
  { name: 'C5-budget', steps: [ { say: 'Show me tennis bracelets under 250 dollars' } ] },
  { name: 'C6-thin-honesty', steps: [ { say: 'Show me alexandrite earrings' } ] },
  { name: 'C7-two-meanings', steps: [ { say: 'Looking for cluster rings' } ] },
  { name: 'C8-facet-trap', steps: [ { say: 'Show me sterling silver pendants' } ] },
  { name: 'C9-brand', steps: [ { say: 'Show me Gems en Vogue rings' } ] },
  { name: 'C10-education', steps: [ { say: 'How do I clean a pearl necklace?' } ] },
  { name: 'C11-policy', steps: [ { say: 'What is your return policy?' } ] },
  { name: 'C12-on-air', steps: [ { say: 'What did the hosts feature onair this week?' } ] },
  { name: 'C13-trending-trap', steps: [ { say: 'What are your best selling rings right now?' } ] },
  { name: 'C14-product-by-name', steps: [ { say: 'Show me opal pendants' }, { tap: null }, { say: 'Tell me about the first one up there, is it good for daily wear?' } ] },
];

const browser = await chromium.launch({ headless: true });
const receipts = { startedAt: new Date().toISOString(), app: APP, devAgent: S.devAgentId, journeys: [] };

async function newPanel(page) {
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  await page.waitForSelector('.ais-ChatPrompt-textarea', { timeout: 30000 });
  await page.waitForTimeout(1200);
}

async function waitTurnDone(page, settleMs = 3000) {
  const read = () => page.evaluate(() => {
    const msgs = [...document.querySelectorAll('.ais-ChatMessage')];
    const lastAssistant = [...msgs].reverse().find((m) => m.getAttribute('data-role') !== 'user');
    return {
      skeleton: !!document.querySelector('.jtv-chat-skeleton'),
      cards: lastAssistant ? lastAssistant.querySelectorAll('a.jtv-chat-card').length : 0,
      textLen: lastAssistant ? (lastAssistant.textContent ?? '').trim().length : 0,
    };
  });
  const stable = async () => {
    const a = await read();
    await page.waitForTimeout(1800);
    const b = await read();
    return !b.skeleton && (b.cards > 0 || b.textLen > 60) && a.textLen === b.textLen && a.cards === b.cards;
  };
  const started = Date.now();
  while (Date.now() - started < 150000) {
    if (await stable()) break;
  }
  await page.waitForTimeout(settleMs);
}

async function readTurn(page) {
  return page.evaluate(() => {
    const msgs = [...document.querySelectorAll('.ais-ChatMessage')].filter(
      (m) => m.getBoundingClientRect().width > 0,
    );
    const lastAssistant = [...msgs].reverse().find((m) => m.getAttribute('data-role') !== 'user');
    const replyText = lastAssistant
      ? (lastAssistant.querySelector('.ais-ChatMessage-message')?.textContent ?? '').trim()
      : '';
    const tiles = lastAssistant ? [...lastAssistant.querySelectorAll('a.jtv-chat-card')].map((a) => ({
      title: a.querySelector('h3')?.textContent ?? '',
      href: a.getAttribute('href') ?? '',
    })) : [];
    const chips = lastAssistant
      ? [...lastAssistant.querySelectorAll('.jtv-chat-narrow-chip')].map((c) => c.textContent?.trim() ?? '').filter((t) => t && t !== 'Back to all')
      : [];
    const groups = lastAssistant
      ? [...lastAssistant.querySelectorAll('.ais-ChatToolGroupedResults-groupTitle')].map((g) => g.textContent?.trim() ?? '')
      : [];
    const links = lastAssistant ? [...lastAssistant.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '') : [];
    const bolds = lastAssistant ? [...lastAssistant.querySelectorAll('strong')].map((b) => b.textContent?.trim() ?? '') : [];
    return { replyText, tiles, chips, groups, links, bolds };
  });
}

for (const j of JOURNEYS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const rec = { name: j.name, turns: [] };
  try {
    await newPanel(page);
    for (let i = 0; i < j.steps.length; i++) {
      const step = j.steps[i];
      if ('tap' in step) {
        const chips = page.locator('.jtv-chat-narrow-chip').filter({ hasNotText: 'Back to all' });
        if (await chips.first().count()) {
          await chips.first().click();
          await page.waitForTimeout(2500);
        }
        rec.turns.push({ step: i + 1, kind: 'tap' });
        await shot(page, `${j.name}-t${i + 1}-tap`);
        continue;
      }
      const before = await page.evaluate(() => document.querySelectorAll('.ais-ChatMessage').length);
      const ta = page.locator('.ais-ChatPrompt-textarea');
      await ta.fill(step.say);
      await ta.press('Enter');
      await page.waitForFunction((n) => document.querySelectorAll('.ais-ChatMessage').length > n, before, { timeout: 30000 }).catch(() => {});
      const afterSend = await page.evaluate(() => document.querySelectorAll('.ais-ChatMessage').length);
      await waitTurnDone(page);
      const turn = await readTurn(page);
      turn.step = i + 1;
      turn.kind = 'say';
      turn.literal = step.say;
      turn.turnAdvanced = afterSend > before;
      rec.turns.push(turn);
      await shot(page, `${j.name}-t${i + 1}`);
    }
  } catch (error) {
    rec.error = String(error).slice(0, 300);
    await shot(page, `${j.name}-ERROR`).catch(() => {});
  }
  receipts.journeys.push(rec);
  await page.close();
}
await browser.close();
writeFileSync(join(OUT, 'full-battery-receipts.json'), JSON.stringify(receipts, null, 1));
console.log('full battery out:', OUT);
