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
const OUT = join(here, 'battery-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });
const APP = process.env.JTV_APP_URL ?? 'http://localhost:5173/';
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

const S = loadSettings();
console.log('battery against dev agent', S.devAgentId, 'at', APP);

/* Six journeys, fresh literals. */
const JOURNEYS = [
  { name: 'J1-broad-browse-funnel', steps: [
    { say: 'Show me opal jewelry for everyday wear' },
    { tap: null },
    { say: 'I only wear white metals, if that helps.' },
    { say: 'Which of these would you pick for daily wear?' },
    { say: 'What should I know about caring for opals?' },
  ]},
  { name: 'J2-gift-correction', steps: [
    { say: "It is my mom's 70th birthday next month and she loves sapphires." },
    { say: 'She only wears white gold.' },
    { say: 'Actually, she prefers yellow gold after all.' },
    { say: 'Let us keep it under 400 dollars.' },
    { say: 'Which one would you choose and why?' },
  ]},
  { name: 'J3-style-brief', steps: [
    { say: 'Show me elegant and timeless pieces' },
    { tap: null },
    { say: 'It is a gift for my mother in law, she is impossible to shop for.' },
    { say: 'What would you say suits a woman who wears mostly classic things?' },
  ]},
  { name: 'J4-verbatim-thin', steps: [
    { say: 'Show me sterling silver necklaces with marcasite stones' },
    { say: 'Only marcasite, nothing else will do.' },
    { say: 'Fine, show me whatever silver necklaces you do have.' },
    { say: 'How do I keep sterling silver from tarnishing?' },
  ]},
  { name: 'J5-education', steps: [
    { say: 'What is the difference between lab grown and natural diamonds?' },
    { say: 'Interesting. Show me lab grown diamond studs.' },
    { say: 'Are they really identical in sparkle?' },
  ]},
  { name: 'J6-two-meanings', steps: [
    { say: 'I am shopping for wedding ring sets' },
    { tap: null },
    { say: 'My budget is 800 dollars.' },
    { say: 'She wants something vintage looking.' },
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

/* The composer disables while the turn runs; settle time lets tiles land. */
async function waitTurnDone(page, settleMs = 3500) {
  await page.waitForFunction(
    () => {
      const ta = document.querySelector('.ais-ChatPrompt-textarea');
      const send = document.querySelector('.ais-ChatPrompt textarea ~ button, [class*="send"]');
      const busy = document.querySelector('.ais-ChatMessageLoader');
      return ta && !ta.disabled && !busy;
    },
    undefined,
    { timeout: 150000 },
  ).catch(() => {});
  await page.waitForTimeout(settleMs);
}

async function readTurn(page) {
  return page.evaluate(() => {
    const msgs = [...document.querySelectorAll('.ais-ChatMessage')].filter(
      (m) => m.getBoundingClientRect().width > 0,
    );
    const lastAssistant = [...msgs].reverse().find((m) => m.getAttribute('data-role') !== 'user');
    const userCount = msgs.filter((m) => m.getAttribute('data-role') === 'user').length;
    const textParts = lastAssistant
      ? [...lastAssistant.querySelectorAll('.ais-ChatMessage-text, [class*="text"]')]
          .map((n) => n.textContent?.trim() ?? '')
          .filter((t) => t.length > 0)
      : [];
    const replyText = lastAssistant?.textContent?.trim() ?? '';
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
    return { replyHead: textParts[0] ?? replyText.slice(0, 160), replyText, bolds, tiles, chips, groups, suggestions, userCount };
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
      await send(page, step.say);
      await waitTurnDone(page);
      const turn = await readTurn(page);
      const openers = turn.replyText
        .split(/\n+/)
        .filter((line) => NARRATION.test(line.trim()))
        .slice(0, 3);
      turn.narrationOpeners = openers;
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
      suggestionCount: (t.suggestions ?? []).length,
      firstWords: (t.replyHead ?? '').slice(0, 110),
    })),
}));
writeFileSync(join(OUT, 'fix4-battery-grading.json'), JSON.stringify(grade, null, 1));
console.log('battery out:', OUT);
console.log(JSON.stringify(grade, null, 1));
