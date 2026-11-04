/* run-fix4-battery.mjs — the fix-4 voice battery (Arijit's standing battery
 * rule, 2026-10-25; shape follows the 2026-10-27 review battery, rebuilt for
 * the current panel). Runs the DEV agent through six journeys of fresh
 * literals — none reused from an earlier battery, because Agent Studio caches
 * completions by agent+literal — and grades the rendered screen per turn:
 *   - reply shape: paragraphs, closing bold call to action present
 *   - narration openers (shopper-visible; the app's display filter drops
 *     process talk, so this grades the composite the shopper actually sees)
 *   - tiles and narrowing options rendered
 *   - group titles (breadth on the style-brief journey)
 * Output: screenshots + fix4-battery-receipts.json + fix4-battery-grading.json
 * in battery-<timestamp>/ under this folder.
 *   NODE_USE_SYSTEM_CA=1 node run-fix4-battery.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSettings } from '../../../scripts/baseline/settings.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'battery-promptB-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });
const APP = process.env.JTV_APP_URL ?? 'http://localhost:5173/';
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

const S = loadSettings();
console.log('battery against dev agent', S.devAgentId, 'at', APP);

/* Six journeys, fresh literals. */
const JOURNEYS = [
  { name: 'J1-broad-browse-funnel', steps: [
    { say: 'Show me opal pieces that work for daily wear' },
    { tap: null },
    { say: 'I stick to white metals only.' },
    { say: 'Which of these would you pick for everyday use?' },
    { say: 'How should I care for opals?' },
  ]},
  { name: 'J2-gift-correction', steps: [
    { say: "My mom is turning 70 next month and she loves sapphire jewelry." },
    { say: 'She wears only white gold.' },
    { say: 'On second thought, yellow gold is her favorite.' },
    { say: 'Keep the budget under 400 dollars.' },
    { say: 'Which would you personally choose and why?' },
  ]},
  { name: 'J3-style-brief', steps: [
    { say: 'Show me elegant, timeless jewelry' },
    { tap: null },
    { say: 'It is for my mother in law, who is very hard to shop for.' },
    { say: 'What would suit a woman with classic taste?' },
  ]},
  { name: 'J4-verbatim-thin', steps: [
    { say: 'Show me marcasite necklaces in sterling silver' },
    { say: 'Marcasite only, nothing else.' },
    { say: 'Alright, show me any silver necklaces you carry.' },
    { say: 'How do I stop sterling silver from tarnishing?' },
  ]},
  { name: 'J5-education', steps: [
    { say: "What's the difference between lab-grown and mined diamonds?" },
    { say: 'Nice. Show me lab-grown diamond studs.' },
    { say: 'So the sparkle is truly identical?' },
  ]},
  { name: 'J6-two-meanings', steps: [
    { say: 'I want wedding ring sets' },
    { tap: null },
    { say: 'My budget is 800 dollars.' },
    { say: 'She loves vintage-looking pieces.' },
  ]},
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

async function send(page, text) {
  const ta = page.locator('.ais-ChatPrompt-textarea');
  await ta.fill(text);
  await ta.press('Enter');
}

/* The composer never disables in this UI, so "done" is measured on the
 * transcript: a shelf or reply text has landed, the skeleton is gone, and the
 * last assistant message's text is unchanged across two polls (the reply
 * streams after the tiles, so tiles alone are not done). */
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
    const userCount = msgs.filter((m) => m.getAttribute('data-role') === 'user').length;
    const replyText = lastAssistant?.querySelector('.ais-ChatMessage-message')?.textContent?.trim()
      ?? lastAssistant?.textContent?.trim() ?? '';
    const bolds = lastAssistant ? [...lastAssistant.querySelectorAll('strong')].map((b) => b.textContent?.trim() ?? '') : [];
    const tiles = lastAssistant ? lastAssistant.querySelectorAll('a.jtv-chat-card').length : 0;
    const chips = lastAssistant
      ? [...lastAssistant.querySelectorAll('.jtv-chat-narrow-chip')]
          .map((c) => c.textContent?.trim() ?? '')
          .filter((t) => t && t !== 'Back to all')
      : [];
    const groups = lastAssistant
      ? [...lastAssistant.querySelectorAll('.ais-ChatToolGroupedResults-groupTitle')].map((g) => g.textContent?.trim() ?? '')
      : [];
    const suggestions = [...document.querySelectorAll('.ais-ChatPromptSuggestions button, [class*="uggestion"] button')]
      .map((b) => b.textContent?.trim() ?? '')
      .filter(Boolean);
    return { replyHead: replyText.slice(0, 200), replyText, bolds, tiles, chips, groups, suggestions, userCount };
  });
}

const NARRATION = /^(i'll|now i'll|now i will|i will|i'm going|i am going|let me|the search|the results|here are|here's what|good spread|displaying|searching)/i;

for (const j of JOURNEYS) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const rec = { name: j.name, turns: [] };
  try {
    await newPanel(page);
    for (let i = 0; i < j.steps.length; i++) {
      const step = j.steps[i];
      let tapNote = null;
      if ('tap' in step) {
        const chips = page.locator('.jtv-chat-narrow-chip').filter({ hasNotText: 'Back to all' });
        const first = chips.first();
        if (await first.count()) {
          tapNote = await first.textContent();
          await first.click();
          await page.waitForTimeout(2500);
        } else {
          tapNote = '(no chips to tap)';
        }
        rec.turns.push({ step: i + 1, kind: 'tap', tapped: tapNote, screenshot: `${j.name}-t${i + 1}-tap` });
        await shot(page, `${j.name}-t${i + 1}-tap`);
        continue;
      }
      const before = await page.evaluate(() => document.querySelectorAll('.ais-ChatMessage').length);
      await send(page, step.say);
      /* The turn must actually advance: one more message, then stability. If
       * the send dies (dead turn), record it rather than grading stale state. */
      await page
        .waitForFunction(
          (n) => document.querySelectorAll('.ais-ChatMessage').length > n,
          before,
          { timeout: 30000 },
        )
        .catch(() => {});
      const afterSend = await page.evaluate(() => document.querySelectorAll('.ais-ChatMessage').length);
      await waitTurnDone(page);
      const turn = await readTurn(page);
      turn.turnAdvanced = afterSend > before;
      const openers = turn.replyText
        .split(/\n+/)
        .filter((line) => NARRATION.test(line.trim()))
        .slice(0, 3);
      turn.narrationOpeners = openers;
      const leaks = [];
      if (/\b\d{1,3}(,\d{3})+\b|\b\d+\s+(pieces|options|styles|results|choices)\b/i.test(turn.replyText)) leaks.push('count');
      const sku = turn.replyText.match(/\b[A-Z]{2,4}\d{3,5}[A-Z]?\b/g);
      if (sku) leaks.push(`sku:${sku.join(',')}`);
      turn.leaks = leaks;
      turn.step = i + 1;
      turn.kind = 'say';
      turn.literal = step.say;
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
writeFileSync(join(OUT, 'fix4-battery-receipts.json'), JSON.stringify(receipts, null, 1));

/* Grading pass over the receipts. */
const grade = receipts.journeys.map((j) => ({
  journey: j.name,
  error: j.error ?? null,
  turns: j.turns
    .filter((t) => t.kind === 'say')
    .map((t) => ({
      step: t.step,
      literal: (t.literal ?? '').slice(0, 50),
      tiles: t.tiles,
      chipAxes: [...new Set((t.chips ?? []).length ? [] : [])].length || ((t.chips ?? []).length ? (t.groups ?? []).length + (t.chips.length >= 2 ? 1 : 0) : 0),
      groups: (t.groups ?? []).length,
      boldClose: (t.bolds ?? []).length > 0,
      narrationOpeners: t.narrationOpeners ?? [],
      leaks: t.leaks ?? [],
      suggestionCount: (t.suggestions ?? []).length,
      firstWords: (t.replyHead ?? '').slice(0, 110),
    })),
}));
writeFileSync(join(OUT, 'fix4-battery-grading.json'), JSON.stringify(grade, null, 1));
console.log('battery out:', OUT);
console.log(JSON.stringify(grade, null, 1));
