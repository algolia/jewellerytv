/* Does an on-air shelf say which broadcast its pieces came from?
 *
 * The heading is the only place that can say it, and it is written by the
 * model, so the check has to be against the records rather than against the
 * words: a heading that names a day its tiles did not air on reads correct
 * and is not. So this reads both sides off the same stream — the search
 * output, which carries `date` and `seriesName` per hit, and the display
 * tool's input, which carries the headings and the objectIDs under them —
 * and joins them on objectID.
 *
 * Caching is off; a cached turn would report its own replay rather than a
 * fresh decision. Two questions, two agent completions.
 *
 * Shape borrowed from ../simplification-2026-10-28/compare-search-vs-grouped.mjs.
 *   node docs/workspace/on-air-group-headings-2026-11-04/verify-on-air-groups.mjs
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => [
      line.slice(0, line.indexOf('=')).trim(),
      line.slice(line.indexOf('=') + 1).trim(),
    ]),
);
const {
  VITE_ALGOLIA_APP_ID: appId,
  VITE_ALGOLIA_SEARCH_API_KEY: apiKey,
  VITE_JTV_AGENT_ID: agentId,
} = env;

const QUESTIONS = [
  "What did Jennifer showcase on yesterday's show?",
  'What did Misty feature this week?',
];

async function turn(question) {
  const res = await fetch(
    `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-5&cache=false`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-algolia-application-id': appId,
        'x-algolia-api-key': apiKey,
      },
      body: JSON.stringify({
        messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: question }] }],
      }),
    },
  );
  if (!res.ok) return { question, error: `HTTP ${res.status}` };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  /* objectID -> the show facts the search returned for it. */
  const records = new Map();
  const indices = [];
  let grouped;
  let error;

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
      if (
        event.type === 'tool-input-start' &&
        String(event.toolName).startsWith('algolia_search_index')
      ) {
        indices.push(String(event.toolName).replace('algolia_search_index_', ''));
      }
      if (event.type === 'tool-output-available' && Array.isArray(event.output?.hits)) {
        for (const hit of event.output.hits) {
          if (hit?.objectID) {
            records.set(hit.objectID, {
              date: hit.date,
              series: hit.seriesName,
              show: hit.showTitle,
              relative: hit.relativeDay,
            });
          }
        }
      }
      if (event.type === 'tool-input-available' && event.toolName === 'algolia_grouped_results') {
        grouped = event.input;
      }
      if (event.type === 'error') error = event.errorText;
    }
  }

  return { question, indices, records, groups: grouped?.groups ?? [], error };
}

/* A heading claims a day when it carries one of the record's own words for a
 * day. Anything the search did not supply is not a claim this can check. */
function dayClaimedBy(title, dates, relatives) {
  const haystack = title.toLowerCase();
  const claims = [...relatives].filter((word) => word && haystack.includes(word.toLowerCase()));
  /* "3 November" and the like: the day number beside the month name. */
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const named = months.filter((month) => haystack.includes(month));
  return { relativeClaims: claims, monthClaims: named, spansDays: dates.size > 1 };
}

let problems = 0;

for (const question of QUESTIONS) {
  const result = await turn(question);
  console.log(`\n"${result.question}"  [${result.indices.join(', ') || '-'}]`);
  if (result.error) console.log(`  ERROR: ${result.error}`);
  if (!result.groups.length) {
    console.log('  no groups — the display tool was never called');
    problems += 1;
    continue;
  }

  for (const group of result.groups) {
    const ids = (group.results ?? []).map((entry) => entry?.objectID).filter(Boolean);
    const known = ids.map((id) => result.records.get(id)).filter(Boolean);
    const dates = new Set(known.map((record) => record.date).filter(Boolean));
    const series = new Set(known.map((record) => record.series).filter(Boolean));
    const relatives = new Set(known.map((record) => record.relative).filter(Boolean));

    console.log(`\n  "${group.title ?? '(no heading)'}"  ${ids.length} pieces`);
    console.log(`    aired : ${[...dates].sort().join(', ') || 'unknown'}`);
    console.log(`    series: ${[...series].join(' | ') || 'unknown'}`);

    if (!group.title) {
      console.log('    ✗ no heading, so the shelf says nothing about the broadcast');
      problems += 1;
      continue;
    }
    const { relativeClaims, monthClaims, spansDays } = dayClaimedBy(group.title, dates, relatives);
    const claimsADay = relativeClaims.length > 0 || monthClaims.length > 0;
    if (spansDays && claimsADay) {
      console.log(`    ✗ names a day but the pieces span ${dates.size} air dates`);
      problems += 1;
    }
    if (![...series].some((name) => name && group.title.includes(name))) {
      console.log('    ✗ heading does not name the show or series behind these pieces');
      problems += 1;
    }
  }
}

console.log(`\n--- ${problems} problem${problems === 1 ? '' : 's'}`);
