/* run-battery.mjs: the 35×3×3-turn battery (Arijit's spec, 2026-10-25).
 *
 * 35 starter-pool questions × 3 independent legs × 3 turns each:
 *   T1  broad ask (the pool label, lightly varied per leg to defeat the
 *       completion cache)
 *   T2  typed narrowing (material/stone/budget word for the question's theme)
 *   T3  chip tap + typed follow-up
 * Every turn captures: reply text, tiles, chips, screenshot, duration,
 * system notices, and the tool-call log (search inputs incl. filters,
 * present_products input/output with drop reasons + enforced requirement).
 * Output: raw captures + screenshots under the run dir, then the HTML report
 * (build-battery-report.mjs) grades the pre-registered pass lines.
 *   node scripts/run-battery.mjs --legs 3          full run
 *   node scripts/run-battery.mjs --legs 1 --smoke  smoke (2 questions, 1 leg)
 * Production only runs shopping turns; nothing is written to any agent.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(path.join(here, '..', 'node_modules', 'playwright', 'index.mjs'));

const BASE = process.env.JTV_BATTERY_BASE ?? 'https://jewellerytv.vercel.app';
const args = process.argv.slice(2);
const getArg = (name, dflt) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : dflt);
const LEGS = getArg('--legs', 3);
const SMOKE = args.includes('--smoke');
const SETTLE_MS = 10_000;
const TURN_TIMEOUT_MS = 120_000;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const RUN_DIR = path.join(here, '..', 'docs', 'workspace', 'battery-2026-10-25', SMOKE ? `smoke-${stamp()}` : `run-${stamp()}`);
fs.mkdirSync(path.join(RUN_DIR, 'screenshots'), { recursive: true });

/* The 35-question pool: label + theme + the narrowing phrase T2 types + the
 * requirement the grader checks tiles against (null = no material check). */
const QUESTIONS = [
  { label: "I'm buying a gift", narrow: 'something in gold', requirement: 'gold' },
  { label: 'Help me find an anniversary gift', narrow: 'rubies', requirement: 'ruby' },
  { label: 'Show me gold hoop earrings', narrow: 'sterling silver ones', requirement: 'silver' },
  { label: 'A watch for dad', narrow: 'a leather band', requirement: null },
  { label: 'Show me opal jewelry', narrow: 'rings only', requirement: null },
  { label: "What's new in the collection?", narrow: 'show me gold pieces', requirement: 'gold' },
  { label: 'Do you have gold hoop earrings?', narrow: 'smaller hoops', requirement: 'gold' },
  { label: 'Show me engagement rings under $1,000', narrow: 'make it sapphire', requirement: 'sapphire' },
  { label: "I'm looking for wedding ring sets", narrow: 'show me bands only', requirement: null },
  { label: 'Help me find a mothers ring for my mom', narrow: 'her birthstone is ruby', requirement: 'ruby' },
  { label: 'Show me sapphire earrings', narrow: 'under $200', requirement: 'sapphire' },
  { label: 'Show me emerald rings', narrow: 'under $500', requirement: 'emerald' },
  { label: 'Show me tanzanite pendants', narrow: 'silver ones', requirement: null },
  { label: 'Do you have moissanite rings?', narrow: 'under $300', requirement: 'moissanite' },
  { label: 'Show me pearl necklaces', narrow: 'long strands', requirement: 'pearl' },
  { label: 'Show me diamond studs', narrow: 'under $400', requirement: 'diamond' },
  { label: 'Something for a birthday gift', narrow: 'she wears gold', requirement: 'gold' },
  { label: 'Show me vintage style rings', narrow: 'in silver', requirement: 'silver' },
  { label: 'Show me men rings', narrow: 'gold ones', requirement: 'gold' },
  { label: 'Show me tennis bracelets', narrow: 'under $250', requirement: null },
  { label: 'Show me cross pendants', narrow: 'in sterling silver', requirement: 'silver' },
  { label: 'Show me charm bracelets', narrow: 'gold ones', requirement: 'gold' },
  { label: 'A gift for my sister', narrow: 'she loves amethyst', requirement: 'amethyst' },
  { label: 'Show me lab grown diamond rings', narrow: 'under $1,000', requirement: 'diamond' },
  { label: 'Show me turquoise jewelry', narrow: 'rings only', requirement: 'turquoise' },
  { label: 'Show me onyx rings', narrow: 'for a man', requirement: 'onyx' },
  { label: 'Show me garnet jewelry', narrow: 'under $150', requirement: 'garnet' },
  { label: 'Show me topaz necklaces', narrow: 'blue ones', requirement: 'topaz' },
  { label: 'Show me cubic zirconia earrings', narrow: 'studs only', requirement: null },
  { label: 'Show me rose gold rings', narrow: 'under $300', requirement: null },
  { label: 'Show me stud earrings', narrow: 'diamond ones', requirement: 'diamond' },
  { label: 'Show me bolo bracelets', narrow: 'in silver', requirement: 'silver' },
  { label: 'Show me birthstone rings for October', narrow: 'opal ones', requirement: 'opal' },
  { label: 'Show me anklets', narrow: 'in gold', requirement: 'gold' },
  { label: 'Show me toe rings', narrow: 'in silver', requirement: 'silver' },
].map((q, index) => ({ ...q, index }));
const POOL = SMOKE ? QUESTIONS.slice(0, 2) : QUESTIONS;

/* Leg phrasing variants defeat the completion cache: the label is wrapped
 * differently per leg without changing the ask. */
const LEG_WRAPS = [
  (label) => label,
  (label) => (label.endsWith('?') ? `${label} (leg two)` : `${label}, please`),
  (label) => (label.endsWith('?') ? `${label} (leg three)` : `Hi, ${label.toLowerCase()}`),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openConcierge(page) {
  const panel = page.getByRole('complementary', { name: 'Jewelry buying Concierge' });
  if (await panel.isVisible().catch(() => false)) return panel;
  await page.getByRole('button', { name: 'Ask JTV' }).click();
  await panel.waitFor({ state: 'visible', timeout: 10_000 });
  return panel;
}

async function newConversation(page) {
  /* Only clear storage when the page origin is already loaded; a fresh goto
   * below starts a clean session anyway. */
  const url = page.url();
  if (url.startsWith(BASE)) {
    await page.evaluate(() => { try { sessionStorage.clear(); } catch {} });
  }
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await openConcierge(page);
  await sleep(1_200);
}

async function send(page, text) {
  const composer = page.getByRole('textbox', { name: 'Message the Concierge' });
  /* One measured leg-1 failure (2026-10-26): the composer sat disabled for
   * 30s on a fresh page and the question was lost. Wait out a disabled
   * composer before typing instead of failing the question. */
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector('textarea, input[aria-label="Message the Concierge"]');
        return !!el && !el.disabled;
      },
      { timeout: 45_000 },
    );
  } catch {
    /* Fall through to the fill below; its own timeout reports the failure. */
  }
  await composer.fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await sleep(SETTLE_MS);
}

async function captureTurn(page, meta) {
  const data = await page.evaluate(() => {
    const messages = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages') ?? '[]');
    const panel = document.querySelector('aside.concierge-panel');
    const out = { searches: [], presents: [], tiles: [], chips: [], notices: [], reply: '' };
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { lastUser = i; break; }
    for (const m of messages.slice(lastUser + 1)) {
      if (m.role !== 'assistant') continue;
      const texts = (m.parts ?? []).filter((p) => typeof p.text === 'string').map((p) => p.text);
      if (texts.length) out.reply = texts[texts.length - 1];
      for (const p of m.parts ?? []) {
        if (p.type?.startsWith('tool-algolia_search_index'))
          out.searches.push({ queries: p.input?.queries?.map((q) => q.query), facetFilters: p.input?.queries?.[0]?.facetFilters ?? null });
        if (p.type === 'tool-present_products')
          out.presents.push({
            requirement: p.input?.requirement ?? null,
            enforced: p.output?.enforced ?? null,
            picked: (p.input?.objectIDs ?? []).length,
            returned: (p.output?.objectIDs ?? []).map((i) => i.objectID),
            dropped: (p.output?.dropped ?? []).map((d) => `${d.objectID}:${d.reason}`),
          });
        if (p.type === 'data-guardrail-violation') out.notices.push('guardrail');
      }
    }
    if (panel) {
      out.tiles = [...new Set([...panel.querySelectorAll('a[href^="/product/"]')].map((a) => (a.getAttribute('aria-label') ?? '').slice(0, 70)))];
      const chips = [...panel.querySelectorAll('button')].map((b) => b.textContent?.trim()).filter((t) => t && !/^(New|Send|Move|Maximize|Close|Resize|Pause|Preferences|‹|Conversation$|Products$|SHOP NOW)/.test(t) && t.length < 32);
      out.chips = [...new Set(chips)].slice(0, 12);
      out.notices.push(...[...panel.querySelectorAll('.connected-system-notice')].map((n) => n.textContent?.slice(0, 60) ?? ''));
    }
    return out;
  });
  return { ...meta, ...data };
}

async function tapChip(page, chipLabel) {
  await page.getByRole('button', { name: chipLabel, exact: true }).first().click();
  await sleep(SETTLE_MS);
}

const browser = await chromium.launch({ headless: false, args: ['--mute-audio', '--window-position=60,60', '--window-size=1440,960'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  /* A movie clip per conversation: every question's three turns record as one
   * webm next to the per-turn screenshots. */
  recordVideo: { dir: path.join(RUN_DIR, 'videos'), size: { width: 1280, height: 900 } },
});
const ledger = [];

for (let leg = 1; leg <= LEGS; leg++) {
  for (const q of POOL) {
    const file = (turn, tag) => path.join(RUN_DIR, 'screenshots', `leg${leg}-q${q.index + 1}-t${turn}-${tag}.png`);
    const base = { leg, question: q.label, index: q.index, requirement: q.requirement };
    const started = Date.now();
    const page = await context.newPage();
    let videoFile = null;
    try {
      /* T1: broad ask */
      await newConversation(page);
      await send(page, LEG_WRAPS[leg - 1](q.label));
      const t1 = await captureTurn(page, { ...base, turn: 1, ask: q.label });
      t1.ms = Date.now() - started;
      await page.screenshot({ path: file(1, 'broad') });
      ledger.push(t1);

      /* T2: typed narrowing */
      const started2 = Date.now();
      await send(page, q.narrow);
      const t2 = await captureTurn(page, { ...base, turn: 2, ask: q.narrow });
      t2.ms = Date.now() - started2;
      await page.screenshot({ path: file(2, 'narrow') });
      ledger.push(t2);

      /* T3: chip tap + typed follow-up */
      const chip = t2.chips[0] ?? null;
      const started3 = Date.now();
      if (chip) await tapChip(page, chip);
      await send(page, 'what else is close to these?');
      const t3 = await captureTurn(page, { ...base, turn: 3, ask: `chip:${chip} + follow-up` });
      t3.ms = Date.now() - started3;
      await page.screenshot({ path: file(3, 'funnel') });
      ledger.push(t3);
    } catch (error) {
      ledger.push({ ...base, turn: 0, error: String(error).slice(0, 200), ms: Date.now() - started });
    }
    /* Close the page so its video finalizes, then give it a readable name. */
    videoFile = await page.video()?.path().catch(() => null) ?? null;
    await page.close().catch(() => {});
    if (videoFile)
      fs.renameSync(videoFile, path.join(RUN_DIR, 'videos', `leg${leg}-q${q.index + 1}-${q.label.slice(0, 30).replace(/[^a-z0-9]+/gi, '-')}.webm`));
    fs.writeFileSync(path.join(RUN_DIR, 'ledger.json'), JSON.stringify(ledger, null, 1));
  }
  console.log(`leg ${leg}/${LEGS} done: ${ledger.length} turns captured`);
}

await browser.close();
fs.writeFileSync(path.join(RUN_DIR, 'ledger.json'), JSON.stringify(ledger, null, 1));
console.log('DONE. runs at', RUN_DIR, '| turns:', ledger.length);
