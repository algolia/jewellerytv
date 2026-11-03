/* Does the display tool pick a subset, or regroup what the search already
 * returned?
 *
 * The panel waits for `algolia_grouped_results` before showing a single piece,
 * and that tool stalls for four seconds between its intro and its first group.
 * Every piece is already in hand when the search output lands, several seconds
 * earlier. Rendering those early is only safe if the grouped set does not drop
 * pieces the search returned — a tile that appears and then vanishes is worse
 * than a tile that is slow.
 *
 * So, per question: the objectIDs the search returned, the objectIDs the
 * display tool named, and the gap between the two timestamps. Caching is off;
 * a cached turn would report its own replay rather than a fresh decision.
 *
 * Usage: node compare-search-vs-grouped.mjs [--questions a.txt]
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
);
const { VITE_ALGOLIA_APP_ID: appId, VITE_ALGOLIA_SEARCH_API_KEY: apiKey, VITE_JTV_AGENT_ID: agentId } = env;

const QUESTIONS = [
  'Show me opal jewelry',
  'I need a gift for my mom under $200',
  'What was shown on Jewel School this week?',
  "What did Misty feature this week?",
  'Show me engagement rings',
  'Something bold in sterling silver',
  'Compare tanzanite and amethyst rings',
  'Show me clearance',
];

async function turn(question) {
  const t0 = Date.now();
  const res = await fetch(
    `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-5&cache=false`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-algolia-application-id': appId,
        'x-algolia-api-key': apiKey,
      },
      body: JSON.stringify({ messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: question }] }] }),
    },
  );
  if (!res.ok) return { question, error: `HTTP ${res.status}` };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const searched = [];
  let searchedAt;
  let grouped;
  let groupedAt;
  let error;
  let indexName;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const line = chunk.split('\n').find((candidate) => candidate.startsWith('data: '));
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (event.type === 'tool-input-start' && String(event.toolName).startsWith('algolia_search_index')) {
        indexName = String(event.toolName).replace('algolia_search_index_', '');
      }
      if (event.type === 'tool-output-available' && Array.isArray(event.output?.hits)) {
        for (const hit of event.output.hits) if (hit?.objectID) searched.push(hit.objectID);
        searchedAt ??= Date.now() - t0;
      }
      if (event.type === 'tool-input-available' && event.toolName === 'algolia_grouped_results') {
        grouped = event.input;
        groupedAt = Date.now() - t0;
      }
      if (event.type === 'error') error = event.errorText;
    }
  }

  const named = (grouped?.groups ?? []).flatMap((group) =>
    (group.results ?? []).map((result) => result?.objectID).filter(Boolean),
  );
  return { question, indexName, searched, searchedAt, named, groupedAt, groups: grouped?.groups?.length ?? 0, error };
}

const rows = [];
for (const question of QUESTIONS) {
  const result = await turn(question);
  rows.push(result);
  const searchedSet = new Set(result.searched ?? []);
  const namedSet = new Set(result.named ?? []);
  const extra = [...namedSet].filter((id) => !searchedSet.has(id));
  const unnamed = [...searchedSet].filter((id) => !namedSet.has(id));
  console.log(`\n"${result.question}"  [${result.indexName ?? '-'}]`);
  if (result.error) console.log(`  ERROR: ${result.error}`);
  console.log(
    `  searched ${searchedSet.size} @ ${result.searchedAt ?? '-'}ms` +
      `   named ${namedSet.size} in ${result.groups} groups @ ${result.groupedAt ?? '-'}ms` +
      (result.searchedAt && result.groupedAt ? `   wait ${result.groupedAt - result.searchedAt}ms` : ''),
  );
  console.log(`  named but never searched: ${extra.length ? extra.join(',') : 'none'}`);
  console.log(`  searched but not named:   ${unnamed.length ? unnamed.join(',') : 'none'}`);
}

const usable = rows.filter((row) => row.searchedAt && row.groupedAt);
const waits = usable.map((row) => row.groupedAt - row.searchedAt).sort((a, b) => a - b);
const dropping = usable.filter((row) => {
  const named = new Set(row.named);
  return row.searched.some((id) => !named.has(id));
});
console.log(`\n--- ${rows.length} questions, ${usable.length} reached the display tool`);
console.log(`wait between search output and display input: median ${waits[Math.floor(waits.length / 2)]}ms, max ${waits[waits.length - 1]}ms`);
console.log(`turns where the display tool named fewer pieces than the search returned: ${dropping.length}/${usable.length}`);
for (const row of dropping) {
  const named = new Set(row.named);
  console.log(`  "${row.question}": ${row.searched.filter((id) => !named.has(id)).length} of ${new Set(row.searched).size} left out`);
}
