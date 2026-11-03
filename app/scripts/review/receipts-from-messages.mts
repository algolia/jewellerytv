import { readFileSync, writeFileSync } from 'node:fs';
import { createAgentStudioClient, loadCredentials } from '../conversation-reader/agentStudio.ts';
import { loadSettings } from '../baseline/settings.mjs';

const S = loadSettings();
const c = createAgentStudioClient(await loadCredentials(), S.devAgentId);
const RUN = '/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/app/docs/workspace/prompt-review-2026-10-26/battery-2026-10-27T04-09-54';
const receipts = JSON.parse(readFileSync(RUN + '/battery-grading.json', 'utf8'));

const CONVS: Record<string, string> = {};
for (const j of receipts.journeys) if (j.conversationId) CONVS[j.name] = j.conversationId;

const out: any = {};
for (const [name, id] of Object.entries(CONVS)) {
  const conv: any = await c.fetchConversation(id as string);
  const turns: any[] = [];
  let userTurn = 0;
  for (const m of conv.messages ?? []) {
    if (m.role === 'user') { userTurn++; continue; }
    if (m.role !== 'assistant') continue;
    const searches: any[] = [];
    let replyText = '';
    for (const p of m.parts ?? []) {
      const pt: any = p;
      if (pt.type === 'text' && pt.text) replyText += (replyText ? '\n\n' : '') + pt.text;
      if (String(pt.toolName ?? '').includes('algolia_search_index')) {
        try {
          let inp: any = pt.args;
          if (inp == null && typeof pt.rawArgs === 'string') inp = JSON.parse(pt.rawArgs);
          searches.push((inp?.queries ?? []).map((q: any) => ({ query: q.query, facet: Object.fromEntries(Object.entries(q).filter(([k]: any) => k.startsWith('facet_'))) })));
        } catch { searches.push([{ parseError: true, raw: String(pt.rawArgs ?? '').slice(0, 120) }]); }
      }
    }
    turns.push({ turn: userTurn, searches: searches.flat(), blocks: replyText.split(/\n\s*\n/).filter((b: string) => b.trim()).length, replyHead: replyText.split(/\n\s*\n/)[0]?.slice(0, 90) });
  }
  out[name] = turns;
  console.log('==', name);
  for (const t of turns) {
    console.log(` t${t.turn} (${t.blocks} blocks) ${t.replyHead}`);
    for (const s of t.searches) console.log('   search:', JSON.stringify(s).slice(0, 300));
  }
}
writeFileSync(RUN + '/battery-search-receipts.json', JSON.stringify(out, null, 1));
console.log('\nwrote battery-search-receipts.json');
