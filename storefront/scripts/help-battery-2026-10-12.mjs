// Connected help-integration battery, 2026-10-12.
// Runs 15 help questions one at a time against the published Concierge via the
// production app. Captures per-question SSE stream, screenshot, transcript.
// Read-only shopper surface; finite budget: 15 questions + at most 3 retries.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_URL = 'https://jewellerytv.vercel.app';
const OUT = '../.checkpoint/runs/help-integration-battery-2026-10-12';

const QUESTIONS = [
  'What is my retrieval policy?',
  'What is my return policy?',
  'What are the different shipping options available?',
  'How do I return an item?',
  "What is JTV's holiday extended returns policy?",
  'Can I pay for my order in installments?',
  'What is the JTV Preferred Account?',
  'How can I pay my JTV Preferred Account bill?',
  'Do you offer gift cards?',
  'How do I apply a coupon to my order?',
  'What is the Jewel Safe protection plan?',
  'How do I sell my unwanted gold jewelry to JTV?',
  'How do I stop receiving JTV promotional emails?',
  'Are gemstones treated?',
  'Is the JTV website accessible for shoppers using screen readers?',
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (let i = 0; i < QUESTIONS.length; i++) {
  const question = QUESTIONS[i];
  const dir = join(OUT, `q${String(i + 1).padStart(2, '0')}`);
  mkdirSync(dir, { recursive: true });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const network = [];
  const errors = [];
  const sseBodies = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/')) {
      network.push({ kind: 'response', status: res.status(), url });
      if (url.includes('/api/chat')) {
        sseBodies.push(
          res.text().catch(() => '').then((t) => ({ url, status: res.status(), body: t })),
        );
      }
    }
  });
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  let outcome = 'ok';
  try {
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await page.getByRole('button', { name: /concierge/i }).first().click();
    const composer = page.locator('#connected-concierge-input').first();
    await composer.waitFor({ state: 'visible', timeout: 20000 });
    await composer.fill(question);
    await page.screenshot({ path: join(dir, '01-typed.png') });
    await composer.press('Enter');

    // Wait for a chat response to start after the send (max 20s).
    const before = sseBodies.length;
    const startDeadline = Date.now() + 20000;
    while (sseBodies.length === before && Date.now() < startDeadline) {
      await page.waitForTimeout(500);
    }
    // Wait for streams to settle (max 45s), then for reply text to stabilize.
    await Promise.race([
      Promise.allSettled(sseBodies.slice(before)),
      new Promise((r) => setTimeout(r, 45000)),
    ]);
    let last = '';
    for (let w = 0; w < 15; w++) {
      await page.waitForTimeout(3000);
      const cur = await page.evaluate(() => document.body.innerText).catch(() => '');
      if (cur === last && cur.length > 0) break;
      last = cur;
    }
  } catch (err) {
    outcome = `error: ${err.message.slice(0, 200)}`;
  }

  await page.screenshot({ path: join(dir, '02-after.png'), fullPage: true });
  const visible = await page.evaluate(() => document.body.innerText).catch(() => '');
  const streams = (await Promise.allSettled(sseBodies))
    .filter((r) => r.status === 'fulfilled' && r.value.body)
    .map((r, idx) => ({ idx, status: r.value.status, body: r.value.body }));
  writeFileSync(join(dir, 'network.json'), JSON.stringify(network, null, 2));
  writeFileSync(join(dir, 'console-errors.json'), JSON.stringify(errors, null, 2));
  streams.forEach((s) =>
    writeFileSync(join(dir, `sse-${s.idx}.txt`), s.body),
  );
  writeFileSync(join(dir, 'visible-text.txt'), visible);
  writeFileSync(join(dir, 'question.txt'), question);

  // Classify from streams: which sources did retrieve_evidence use?
  const sources = [];
  const tools = [];
  for (const s of streams) {
    const re = /"toolName":\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(s.body))) tools.push(m[1]);
    const src = /"source\\?":\s*\\?"([a-z_]+)\\?"/g;
    while ((m = src.exec(s.body))) sources.push(m[1]);
  }
  const assistantTail = visible.split('\n').filter(Boolean).slice(-12).join(' | ');
  results.push({
    q: i + 1,
    question,
    outcome,
    toolsCalled: [...new Set(tools)],
    evidenceSources: [...new Set(sources)],
    streamCount: streams.length,
    consoleErrors: errors.length,
    replyTail: assistantTail.slice(0, 500),
  });
  console.log(JSON.stringify(results[results.length - 1]));
  await page.close();
}

writeFileSync(join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
await browser.close();
console.log('DONE', results.length, 'questions');
