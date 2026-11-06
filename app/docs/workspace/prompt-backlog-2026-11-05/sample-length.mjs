import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const app = env.VITE_ALGOLIA_APP_ID,
  key = env.VITE_ALGOLIA_SEARCH_API_KEY,
  id = env.VITE_JTV_AGENT_ID;
const Q = process.argv[2] ?? 'What are December birthstone ring styles?';
const N = Number(process.argv[3] ?? 5);
const ask = (q) =>
  fetch(
    `https://${app}.algolia.net/agent-studio/1/agents/${id}/completions?compatibilityMode=ai-sdk-5&cache=false`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-algolia-application-id': app,
        'x-algolia-api-key': key,
      },
      body: JSON.stringify({
        messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: q }] }],
      }),
    },
  );
const rows = [];
for (let n = 0; n < N; n++) {
  const res = await ask(Q);
  const rd = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '',
    text = '',
    groups = 0,
    tools = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const c = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const l = c.split('\n').find((x) => x.startsWith('data: '));
      if (!l) continue;
      let e;
      try {
        e = JSON.parse(l.slice(6));
      } catch {
        continue;
      }
      if (e.type === 'text-delta') text += e.delta ?? '';
      if (e.type === 'tool-input-start') tools++;
      if (e.type === 'tool-input-available' && e.toolName === 'algolia_grouped_results')
        groups = (e.input?.groups ?? []).length;
    }
  }
  const sent = text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  const bold = (text.match(/\*\*[^*]+\*\*/g) || []).length;
  rows.push({ chars: text.length, sent, bold, groups, tools });
  console.log(
    `run ${n + 1}: ${String(text.length).padStart(4)} chars, ${String(sent).padStart(2)} sentences, ${bold} bold labels, ${groups} groups, ${tools} tool calls`,
  );
}
const c = rows.map((r) => r.chars).sort((a, b) => a - b);
console.log(`\n"${Q}"`);
console.log(
  `chars min ${c[0]} median ${c[Math.floor(N / 2)]} max ${c[N - 1]} | runs with bold labels: ${rows.filter((r) => r.bold).length}/${N} | runs with no shelf: ${rows.filter((r) => !r.groups).length}/${N}`,
);
