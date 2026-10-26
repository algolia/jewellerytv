/* run-stories.mjs: the deep-journey test (Arijit's order, 2026-10-26).
 * Four multi-turn shopper stories, each 9-15 turns, where every turn REACTS
 * to what the model actually replied: steps carry expectations on the reply
 * and conditional next messages. This tests length, breadth and depth — the
 * pivots, the contradictions, the honesty boundaries — not one-shot Q&A.
 *
 * Per turn the harness captures: reply text, tiles, chips, a screenshot,
 * duration, tool-call log (search inputs + present drops), and grades the
 * step's expectation. One webm per story. Headed and muted so Arijit can
 * watch; production only, nothing written to any agent. */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(path.join(here, '..', 'node_modules', 'playwright', 'index.mjs'));

const BASE = process.env.JTV_STORY_BASE ?? 'https://jewellerytv.vercel.app';
const SETTLE_MS = 10_000;
const TURN_WAIT = SETTLE_MS + 26_000;
/* The first turn of a story rides a cold start (stream, vocabulary, first
 * search): the measured empty-first-turn in run-07-53 was this wait, not
 * the system. First turn gets double. */
const FIRST_TURN_WAIT = TURN_WAIT + 30_000;

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const ONLY = process.argv.find((a) => a.startsWith('--story='))?.split('=')[1] ?? null;
const RUN_DIR = path.join(here, '..', 'docs', 'workspace', 'stories-2026-10-26', `run-${stamp()}`);
fs.mkdirSync(path.join(RUN_DIR, 'screenshots'), { recursive: true });
fs.mkdirSync(path.join(RUN_DIR, 'videos'), { recursive: true });

const sleep = (ms) => new Promise((w) => setTimeout(w, ms));

/* A step: send this when the previous reply matches `when` (all substrings,
 * case-insensitive; omit `when` = always). `expect` grades THIS turn's reply
 * (any-of substrings, checked against reply + tool log). `floor` turns the
 * six-tile law on for the step (shopping turns). */
const STORIES = [
  {
    id: 'anniversary',
    title: 'Anniversary gift: style, switch, size trap, budget',
    steps: [
      { send: "Hey, I'm looking for an anniversary gift for my wife", expect: ['anniversary|years|her|she'] },
      { send: 'Her style is classic. She wears simple gold pieces, nothing loud', expect: ['gold|classic'] },
      { send: 'She reaches for necklaces usually', expect: ['necklace'], floor: true },
      { send: "Actually, I don't want a necklace. Show me rings instead", expect: ['ring'], floor: true },
      { send: "Oh, wait — I don't know her ring size", when: ['ring'], expect: ['size|bracelet|pendant|alternative|no problem|totally fine'] },
      { send: 'A bracelet then, something classic in gold like the rest of her pieces', expect: ['bracelet'], floor: true },
      { send: 'Something around $500, give or take', expect: ['$4|$5|500|budget|under'] },
      { send: "She's mentioned before she hates white metals, only yellow", expect: ['yellow'], floor: true },
      { send: 'What about matching earrings to go with the bracelet?', expect: ['earring|set|pair'], floor: true },
      { send: "Perfect. Last thing: does it come gift-boxed?", expect: ['box|gift|package|packag|let me|check'] },
    ],
  },
  {
    id: 'watch-dad',
    title: 'Watch for dad: sporty, formal, the swimming contradiction',
    steps: [
      { send: 'I need a watch for my dad', expect: ['watch|dad|father|he'] },
      { send: "He's pretty active — a sporty type", expect: ['sport|active|rubber|bracelet|silicone'] },
      { send: 'But he also dresses up for work. Something that can do both', expect: ['both|versatil|classic|dress|leather|metal'] },
      { send: 'Oh — important: he swims every morning', expect: ['leather|water|rubber|metal|swim'], floor: true },
      { send: 'Does the leather one handle water at all?', expect: ['leather|water|not|recommend|risk|damage'] },
      { send: "What's his best swim-safe option under $300?", expect: ['$2|under|300'], floor: true },
      { send: 'Would a bigger face suit him, do you think?', expect: ['face|size|mm|case|larger'] },
      { send: 'Okay, show me just the swim-safe ones again', expect: ['rubber|metal|silicone|swim'], floor: true },
      { send: "Last one: does it come with a warranty?", expect: ['warranty|warrant|cover|let me|check|help'] },
    ],
  },
  {
    id: 'graduation-sister',
    title: 'Graduation for sister: pearls, silver, the unpierced-ears trap',
    steps: [
      { send: 'My sister graduates college next month and I want to get her something', expect: ['congratulat|graduat|milestone|proud'] },
      { send: "She's 22, loves delicate pieces, and honestly pearls are her thing", expect: ['pearl'], floor: true },
      { send: 'And she only wears silver, never gold', expect: ['silver|sterling'], floor: true },
      { send: 'Show me pearl earrings in silver', expect: ['earring'], floor: true },
      { send: 'Oh no. Wait. She actually never got her ears pierced', expect: ['pierced|earring|stud|no worries|instead|necklace|bracelet|clip'] },
      { send: "Okay, no earrings then. What about a delicate pearl bracelet?", expect: ['bracelet'], floor: true },
      { send: 'How much is too much to spend on a graduation gift, generally?', expect: ['up to you|no rule|depends|whatever|budget'] },
      { send: 'Fair. Then $150, firm', expect: ['$1|150|under'], floor: true },
      { send: 'Does it ship gift-wrapped?', expect: ['gift|wrap|package|box|let me|check|not'] },
    ],
  },
  {
    id: 'proposal-corner',
    title: 'The proposal corner: identity, honesty boundaries, the consultative ask',
    steps: [
      { send: "I'm going to propose next weekend and I'm terrified", expect: ['propose|excited|congratulat|big|moment'] },
      { send: 'Budget is flexible, say $2,500 to start', expect: ['$2|ring|engagement'], floor: true },
      { send: "One hard rule: she hates yellow gold. White metals only", expect: ['white|platinum|pallad|silver'], floor: true },
      { send: 'Lab grown or natural — what is actually the difference?', expect: ['lab|natural|same|diamond|moissanite|cubic'] },
      { send: 'Which one would you get?', expect: ['I|would|my|pick|lean|depends'] },
      { send: 'Can you guarantee delivery by Saturday?', expect: ['cannot|can\'t|not able|no guarantee|check|order'] },
      { send: "Fine, forget timing. She's a ring size 6.5, roughly", expect: ['6.5|size|roughly|estimate|unsure|resize'] },
      { send: "Make it a surprise. Something unusual she wouldn't expect", expect: ['unusual|different|stand out|color|fancy|motif|something'] },
      { send: "And if she doesn't love the style — can she exchange it?", expect: ['exchang|return|policy|30|let me|check'] },
      { send: "Actually her birthstone is emerald. What if I went emerald instead?", expect: ['emerald'], floor: true },
      { send: 'Keep it under $1,800 for the emerald one', expect: ['$1|1800|under'], floor: true },
      { send: "Last question, and be straight with me: is moissanite 'fake'?", expect: ['not fake|different|real stone|simulant|moissanite is|honest'] },
    ],
  },
];

/* Grade: reply text + tile count + tool log. Returns { pass, missed, evidence }. */
function gradeStep(step, turn) {
  const missed = [];
  if (step.expect) {
    const haystack = [turn.reply ?? '', ...(turn.toolLog ?? []).map((l) => JSON.stringify(l).slice(0, 400))].join(' ').toLowerCase();
    const hit = step.expect.some((alt) =>
      alt.split('|').some((word) => haystack.includes(word.toLowerCase())),
    );
    if (!hit) missed.push(`expect none of [${step.expect.join('|')}] in reply`);
  }
  if (step.floor && turn.tiles >= 0 && (turn.tiles ?? 0) > 0 && (turn.tiles ?? 0) < 6)
    missed.push(`floor: ${turn.tiles} tiles (law: 6 or 9)`);
  return { pass: missed.length === 0, missed };
}

function pickStep(story, index, previousReply) {
  const step = story.steps[index];
  if (!step) return null;
  if (!step.when) return step;
  const reply = (previousReply ?? '').toLowerCase();
  const matched = step.when.every((word) => reply.includes(word.toLowerCase()));
  return matched ? step : null;
}

const STORIES_FILTERED = ONLY ? STORIES.filter((s) => s.id === ONLY) : STORIES;
if (ONLY && !STORIES_FILTERED.length) throw new Error(`No story named ${ONLY}`);

const browser = await chromium.launch({ headless: false, args: ['--mute-audio', '--window-position=60,60', '--window-size=1440,960'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: path.join(RUN_DIR, 'videos'), size: { width: 1280, height: 900 } },
});

async function captureTurn(page, meta) {
  const data = await page.evaluate(() => {
    const messages = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages') ?? '[]');
    const panel = document.querySelector('aside.concierge-panel');
    const tiles = [...new Set([...panel.querySelectorAll('a[href^="/product/"]')].map((a) => (a.getAttribute('aria-label') ?? '').slice(0, 70)))];
    const chips = [...panel.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '').filter((t) => t && !/^(New|Send|Move|Maximize|Close|Resize|Pause|Preferences|‹|Conversation$|Products$)/.test(t) && t.length < 32);
    const toolLog = [];
    let lastUser = -1;
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { lastUser = i; break; }
    for (const m of messages.slice(lastUser + 1)) {
      if (m.role !== 'assistant') continue;
      for (const p of m.parts ?? []) {
        if (p.type?.startsWith('tool-algolia_search_index'))
          toolLog.push({ search: (p.input?.queries ?? []).map((q) => ({ query: q.query, facetFilters: q.facetFilters ?? null })), hits: (p.output?.hits ?? []).length });
        if (p.type === 'tool-present_products')
          toolLog.push({ present: { picked: (p.input?.objectIDs ?? []).length, returned: (p.output?.objectIDs ?? []).length, enforced: p.output?.enforced ?? null, dropped: (p.output?.dropped ?? []).length, backfilled: p.output?.backfilled ?? 0 } });
      }
    }
    const reply = (messages.filter((m) => m.role === 'assistant').at(-1)?.parts ?? [])
      .filter((p) => p.type === 'text')
      .map((p) => (p.text ?? '').trim())
      .join(' \n--- \n');
    return { tiles: tiles.length, tilesList: tiles.slice(0, 12), chips: [...new Set(chips)].slice(0, 10), toolLog, reply };
  });
  return { ...meta, ...data };
}

const report = { startedAt: new Date().toISOString(), stories: [] };

for (const story of STORIES_FILTERED) {
  const page = await context.newPage();
  const storyResult = { id: story.id, title: story.title, turns: [] };
  await page.goto(BASE);
  await page.waitForTimeout(4000);
  await page.evaluate(() => { try { sessionStorage.clear(); } catch {} });
  await page.goto(BASE);
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Ask JTV' }).click();
  await page.waitForTimeout(1500);

  let previousReply = '';
  for (let index = 0; index < story.steps.length; index++) {
    const step = pickStep(story, index, previousReply);
    if (!step) {
      storyResult.turns.push({ index, skipped: 'expectation for branching not met', previousReply: previousReply.slice(0, 120) });
      break;
    }
    const started = Date.now();
    try {
      const composer = page.getByRole('textbox', { name: 'Message the Concierge' });
      try {
        await page.waitForFunction(
          () => {
            const el = document.querySelector('textarea, input[aria-label="Message the Concierge"]');
            return !!el && !el.disabled;
          },
          { timeout: 45_000 },
        );
      } catch {
        /* fall through: the fill's own timeout reports the failure */
      }
      await composer.fill(step.send);
      await page.getByRole('button', { name: 'Send' }).click();
      await sleep(index === 0 ? FIRST_TURN_WAIT : TURN_WAIT);
      const turn = await captureTurn(page, { index, send: step.send });
      turn.ms = Date.now() - started;
      turn.screenshot = path.join(RUN_DIR, 'screenshots', `${story.id}-t${index + 1}.png`);
      await page.screenshot({ path: turn.screenshot });
      turn.grade = gradeStep(step, turn);
      storyResult.turns.push(turn);
      previousReply = turn.reply ?? '';
      console.log(`${story.id} t${index + 1}: ${turn.tiles} tiles | grade ${turn.grade.pass ? 'PASS' : 'MISS ' + turn.grade.missed.join('; ')}`);
    } catch (error) {
      storyResult.turns.push({ index, send: step.send, error: String(error).slice(0, 200), ms: Date.now() - started });
      break;
    }
    fs.writeFileSync(path.join(RUN_DIR, 'report.json'), JSON.stringify(report.stories.concat([storyResult]), null, 1));
  }
  const videoFile = await page.video()?.path().catch(() => null) ?? null;
  await page.close().catch(() => {});
  if (videoFile)
    fs.renameSync(videoFile, path.join(RUN_DIR, 'videos', `${story.id}.webm`));
  report.stories.push(storyResult);
  const passed = storyResult.turns.filter((t) => t.grade?.pass).length;
  console.log(`story ${story.id} done: ${passed}/${storyResult.turns.filter((t) => t.grade).length} steps passed`);
}

await browser.close();
fs.writeFileSync(path.join(RUN_DIR, 'report.json'), JSON.stringify(report, null, 1));
console.log('DONE. run dir:', RUN_DIR);
