import { readFileSync } from 'node:fs';
const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const app = env.VITE_ALGOLIA_APP_ID, key = env.VITE_ALGOLIA_SEARCH_API_KEY, id = env.VITE_JTV_AGENT_ID;
const Q = process.argv[2];
for (let n = 0; n < Number(process.argv[3] ?? 3); n++) {
  const res = await fetch(`https://${app}.algolia.net/agent-studio/1/agents/${id}/completions?compatibilityMode=ai-sdk-5&cache=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-algolia-application-id': app, 'x-algolia-api-key': key },
    body: JSON.stringify({ messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: Q }] }] }),
  });
  const rd = res.body.getReader(); const dec = new TextDecoder();
  let buf = '', text = '';
  const calls = [];
  for (;;) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const c = buf.slice(0, i); buf = buf.slice(i + 2);
      const l = c.split('\n').find((x) => x.startsWith('data: ')); if (!l) continue;
      let e; try { e = JSON.parse(l.slice(6)); } catch { continue; }
      if (e.type === 'text-delta') text += e.delta ?? '';
      if (e.type === 'tool-input-available') {
        const q = e.input?.query ?? e.input?.queries?.[0]?.query ?? '';
        calls.push(`${String(e.toolName).replace('algolia_search_index_', '')}${q ? `("${q}")` : ''}`);
      }
    }
  }
  console.log(`run ${n + 1}: ${calls.join('  →  ') || 'NO TOOL CALLS'}`);
  console.log(`         first words: ${JSON.stringify(text.slice(0, 90))}`);
}
