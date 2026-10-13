// Help battery batch 2: 15 additional questions covering the sections batch 1
// missed (auctions, text alerts, account, waitlist, quick buy, express
// ordering, moissanite warranty, live viewer, contact, privacy, brilliant
// cash, split shipment, promotion exclusions). Same capture contract as the
// recapture harness (fixed: evidence bodies from the response event).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_URL = 'https://jewellerytv.vercel.app';
const OUT = '../.checkpoint/runs/help-integration-battery-2026-10-12-batch3';

const QUESTIONS = [
  'How do I open a JTV Preferred Account?',
  'How do I prevent interest charges?',
  'What is my minimum payment on the JTV Preferred Account?',
  'How do I avoid a late fee charge?',
  'What is the difference between zero interest financing and StretchPay?',
  'Is the JTV Preferred Account available for all purchases?',
  'What is the $50 Brilliant Cash new card offer?',
  'How do I pay for JTV Auction items?',
  'Can I use my gift card with a zero interest offer?',
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (let i = 0; i < QUESTIONS.length; i++) {
  const question = QUESTIONS[i];
  const tag = `q${String(i + 31).padStart(2, '0')}`;
  const dir = join(OUT, tag);
  mkdirSync(dir, { recursive: true });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const network = [];
  const errors = [];
  const sseBodies = [];
  const evidenceBodies = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/')) network.push({ status: res.status(), url });
    if (url.includes('/api/chat')) {
      sseBodies.push(res.text().catch(() => '').then((t) => ({ status: res.status(), body: t })));
    }
    if (url.includes('/api/agent-evidence')) {
      evidenceBodies.push({
        request: res.request().postData() ?? '',
        response: res.text().catch(() => ''),
      });
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
    const before = sseBodies.length;
    const startDeadline = Date.now() + 20000;
    while (sseBodies.length === before && Date.now() < startDeadline) await page.waitForTimeout(500);
    await Promise.race([Promise.allSettled(sseBodies.slice(before)), new Promise((r) => setTimeout(r, 45000))]);
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
    .map((s, idx) => ({ idx, status: s.value.status, body: s.value.body }));
  const evidence = await Promise.all(evidenceBodies.map(async (e) => ({ request: e.request, response: await e.response })));
  writeFileSync(join(dir, 'network.json'), JSON.stringify(network, null, 2));
  writeFileSync(join(dir, 'console-errors.json'), JSON.stringify(errors, null, 2));
  streams.forEach((s) => writeFileSync(join(dir, `sse-${s.idx}.txt`), s.body));
  writeFileSync(join(dir, 'agent-evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(join(dir, 'visible-text.txt'), visible);

  const sources = new Set();
  for (const e of evidence) {
    let m;
    const src = /"source\\?":\s*\\?"([a-z_]+)\\?"/g;
    while ((m = src.exec(e.request + ' ' + e.response))) sources.add(m[1]);
  }
  results.push({
    q: i + 31,
    tag,
    question,
    outcome,
    evidenceSources: [...sources],
    evidenceCalls: evidence.length,
    streamCount: streams.length,
    consoleErrors: errors.length,
    replyTail: visible.split('\n').filter(Boolean).slice(-10).join(' | ').slice(0, 400),
  });
  console.log(JSON.stringify(results[results.length - 1]));
  await page.close();
}

writeFileSync(join(OUT, 'summary.json'), JSON.stringify(results, null, 2));
await browser.close();
console.log('DONE', results.length, 'batch2 questions');
