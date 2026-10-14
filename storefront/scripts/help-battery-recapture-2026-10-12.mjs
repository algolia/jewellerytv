// Re-capture receipts for the battery questions whose streams/agent-evidence
// bodies were missed, plus the Q05 502 retry. Same literals as battery run 1.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const APP_URL = 'https://jewellerytv.vercel.app';
const OUT = '../.checkpoint/runs/help-integration-battery-2026-10-12-recapture';

const QUESTIONS = [
  { q: "What is JTV's holiday extended returns policy?", tag: 'q05-retry' },
  { q: 'Do you offer gift cards?', tag: 'q09' },
  { q: 'How do I apply a coupon to my order?', tag: 'q10' },
  { q: 'How do I sell my unwanted gold jewelry to JTV?', tag: 'q12' },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const { q: question, tag } of QUESTIONS) {
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
    while (sseBodies.length === before && Date.now() < startDeadline) {
      await page.waitForTimeout(500);
    }
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
    .map((s, idx) => ({ idx, status: s.value.status, body: s.value.body }));
  const evidence = (
    await Promise.all(evidenceBodies.map(async (e) => ({
      request: e.request,
      response: await e.response,
    })))
  );
  writeFileSync(join(dir, 'network.json'), JSON.stringify(network, null, 2));
  writeFileSync(join(dir, 'console-errors.json'), JSON.stringify(errors, null, 2));
  streams.forEach((s) => writeFileSync(join(dir, `sse-${s.idx}.txt`), s.body));
  writeFileSync(join(dir, 'agent-evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(join(dir, 'visible-text.txt'), visible);

  const sources = [];
  const tools = [];
  for (const s of streams) {
    let m;
    const re = /"toolName":\s*"([^"]+)"/g;
    while ((m = re.exec(s.body))) tools.push(m[1]);
  }
  for (const e of evidence) {
    try {
      const req = JSON.parse(e.request || '{}');
      if (req.source) sources.push(req.source);
    } catch {}
    let m;
    const src = /"source\\?":\s*\\?"([a-z_]+)\\?"/g;
    while ((m = src.exec(e.request + ' ' + e.response))) sources.push(m[1]);
  }
  results.push({
    tag,
    question,
    outcome,
    toolsCalled: [...new Set(tools)],
    evidenceSources: [...new Set(sources)],
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
console.log('DONE', results.length, 'recaptures');
