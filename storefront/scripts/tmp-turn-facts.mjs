/* Browser-side turn-facts extractor, injected via page.evaluate as a string.
 * Kept as a file only for review; the browser helper below is pasted inline. */
export const TURN_FACTS_SNIPPET = String.raw`() => {
  const msgs = JSON.parse(sessionStorage.getItem('instantsearch-chat-initial-messages'));
  const facts = { searches: [], arrangeCalls: [], reply: null };
  for (const m of msgs) {
    if (m.role !== 'assistant') continue;
    for (const p of (m.parts ?? [])) {
      if (p.type?.startsWith('tool-algolia_search_index') && p.state === 'output-available') {
        facts.searches.push({
          intents: (p.input?.queries ?? []).map(q => ({ q: q.query, facets: Object.keys(q).filter(k => k.startsWith('facet_')).map(k => k + '=' + JSON.stringify(q[k])) })),
          userIntent: p.input?.userIntent ?? null,
          nbHits: p.output?.nbHits,
        });
      }
      if (p.type === 'tool-arrange_groups' && p.state === 'output-available') {
        facts.arrangeCalls.push({
          inputGroups: (p.input?.groups ?? []).map(g => ({ title: g.title, n: (g.objectIDs ?? []).length })),
          outGroups: (p.output?.groups ?? []).map(g => ({ title: g.title, ids: g.items.map(i => i.objectID) })),
          surplus: (p.output?.surplus ?? []).map(s => s.objectID + ' (' + s.group + ')'),
          dropped: (p.output?.dropped ?? []).map(d => d.objectID + ':' + d.reason),
          shortfall: p.output?.shortfall ?? [],
        });
      }
      if (p.type === 'text' && p.text) facts.reply = p.text.slice(0, 400);
    }
  }
  return facts;
}`;
