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
const res = await fetch(
  `https://${app}.algolia.net/agent-studio/1/agents/${id}/completions?compatibilityMode=ai-sdk-5&cache=false`,
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-algolia-application-id': app,
      'x-algolia-api-key': key,
    },
    body: JSON.stringify({
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: process.argv[2] }] }],
    }),
  },
);
const rd = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
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
    if (e.type === 'tool-input-available' && String(e.toolName).includes('search_index')) {
      const q = e.input?.queries?.[0] ?? e.input;
      const asked = Object.fromEntries(
        Object.entries(q).filter(
          ([k]) => k.startsWith('facet_') || k === 'facetFilters' || k === 'query',
        ),
      );
      console.log('MODEL ASKED FOR :', JSON.stringify(asked));
    }
    if (e.type === 'data-tool-output-metadata') {
      const p = e.data?.metadata?.['com.algolia/resolved-search-params']?.[0];
      if (p)
        console.log(
          'ALGOLIA RAN     :',
          JSON.stringify({ query: p.query, facetFilters: p.facetFilters, filters: p.filters }),
        );
    }
    if (e.type === 'tool-output-available' && e.output?.nbHits !== undefined)
      console.log('                 nbHits:', e.output.nbHits);
    if (e.type === 'tool-output-available' && e.output?.error)
      console.log('TOOL ERROR      :', JSON.stringify(e.output.error).slice(0, 200));
    if (e.type === 'error') console.log('STREAM ERROR    :', String(e.errorText).slice(0, 200));
  }
}
