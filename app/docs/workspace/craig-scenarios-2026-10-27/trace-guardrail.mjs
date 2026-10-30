/* Guardrail junction tracer (2026-10-27): run the identical chain-length
 * question flow against BOTH agents through the app's own /api/chat pipe,
 * capture the raw SSE event stream of each turn, and diff where the
 * production stream diverges from dev's at the guardrail junction.
 * Output: <agent>-sse.txt (raw events) + trace-summary.json here. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
mkdirSync(OUT, { recursive: true });

const AGENTS = [
  { name: 'dev', app: 'http://localhost:5173/', ask: "What chain length works best for men?" },
  { name: 'prod', app: 'https://jewellerytv.vercel.app/', ask: "What chain length works best for men?" },
];

const summary = [];
const browser = await chromium.launch({ headless: true });
for (const agent of AGENTS) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const sse = [];
  await page.route('**/api/chat**', async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    sse.push(body);
    await route.fulfill({ response, body });
  });
  await page.goto(agent.app, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByText('Ask JTV', { exact: true }).first().click();
  await page.waitForSelector('#connected-concierge-input', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.fill('#connected-concierge-input', agent.ask);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#connected-concierge-input');
      return el && !el.disabled;
    },
    undefined,
    { timeout: 180000 },
  );
  await page.waitForTimeout(3000);
  const dom = await page.evaluate(() => {
    const messages = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages') ?? '[]');
    const texts = [];
    const partTypes = [];
    for (const m of messages) {
      for (const p of m.parts ?? []) {
        partTypes.push(p.type ?? typeof p);
        if (p.type === 'data-guardrail-violation') partTypes.push('GUARDRAIL_DATA_PART_SEEN');
      }
      if (m.role === 'assistant') {
        const t = (m.parts ?? []).filter((p) => typeof p.text === 'string').map((p) => p.text).join(' ');
        if (t.trim()) texts.push(t);
      }
    }
    const notices = [...document.querySelectorAll('.connected-system-notice')].map((n) => n.textContent);
    return { lastReply: texts[texts.length - 1] ?? '', notices, partTypes };
  });
  writeFileSync(join(OUT, `${agent.name}-sse.txt`), sse.join('\n===REQUEST-BOUNDARY===\n'));
  summary.push({ agent: agent.name, sseBytes: sse.join('').length, ...dom });
  await context.close();
}
await browser.close();
writeFileSync(join(OUT, 'trace-summary.json'), JSON.stringify(summary, null, 1));
for (const s of summary)
  console.log(`${s.agent}: bytes=${s.sseBytes} notices=${JSON.stringify(s.notices)} reply="${s.lastReply.slice(0, 120)}"`);
console.log('RUN DIR:', OUT);
