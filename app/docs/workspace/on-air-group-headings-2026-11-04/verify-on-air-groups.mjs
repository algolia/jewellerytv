/* Is an on-air shelf one broadcast, and does it say which?
 *
 * Both halves are written by the model, so both have to be checked against
 * the records rather than against the words: a heading that names a day its
 * tiles did not air on reads correct and is not, and twelve tiles cut from a
 * whole week look like a shelf until you ask where each piece came from. So
 * this reads both sides off the same stream — the search output, which
 * carries `date`, `showId` and `seriesName` per hit, and the display tool's
 * input, which carries the headings and the objectIDs under them — and joins
 * them on objectID.
 *
 * Caching is off; a cached turn would report its own replay rather than a
 * fresh decision. Three questions, three agent completions.
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

/* `oneDay` is the shelf-scope expectation: a turn that names no day, or one
 * day, should put every tile inside a single broadcast per group. A turn that
 * names a span is allowed to range wider, but each group still belongs to one
 * show. */
const QUESTIONS = [
  { ask: "What did Jennifer showcase on yesterday's show?", oneDay: true },
  { ask: 'What has Misty been showing?', oneDay: true },
  { ask: 'What did Misty feature this week?', oneDay: false },
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
              show: hit.showId,
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

for (const { ask, oneDay } of QUESTIONS) {
  const result = await turn(ask);
  console.log(`\n"${result.question}"  [${result.indices.join(', ') || '-'}]`);
  if (result.error) console.log(`  ERROR: ${result.error}`);
  if (!result.groups.length) {
    console.log('  no groups — the display tool was never called');
    problems += 1;
    continue;
  }

  const shelfDates = new Set();

  for (const group of result.groups) {
    const ids = (group.results ?? []).map((entry) => entry?.objectID).filter(Boolean);
    const known = ids.map((id) => result.records.get(id)).filter(Boolean);
    const dates = new Set(known.map((record) => record.date).filter(Boolean));
    const shows = new Set(known.map((record) => record.show).filter(Boolean));
    const series = new Set(known.map((record) => record.series).filter(Boolean));
    const relatives = new Set(known.map((record) => record.relative).filter(Boolean));
    for (const date of dates) shelfDates.add(date);

    console.log(`\n  "${group.title ?? '(no heading)'}"  ${ids.length} pieces`);
    console.log(`    aired : ${[...dates].sort().join(', ') || 'unknown'}`);
    console.log(`    shows : ${shows.size} (${[...series].join(' | ') || 'unknown'})`);

    if (!group.title) {
      console.log('    ✗ no heading, so the shelf says nothing about the broadcast');
      problems += 1;
      continue;
    }
    if (shows.size > 1) {
      console.log(`    ✗ one group, ${shows.size} broadcasts — a group is one show`);
      problems += 1;
    }
    const { relativeClaims, monthClaims, spansDays } = dayClaimedBy(group.title, dates, relatives);
    const claimsADay = relativeClaims.length > 0 || monthClaims.length > 0;
    if (spansDays && claimsADay) {
      console.log(`    ✗ names a day but the pieces span ${dates.size} air dates`);
      problems += 1;
    }
    if (![...series].some((name) => name && group.title.includes(name))) {
      console.log('    ✗ heading does not name the show behind these pieces');
      problems += 1;
    }
  }

  /* No day named, or one day named: the whole shelf is that day's broadcast.
   * A turn that names a span is allowed to range. */
  if (oneDay && shelfDates.size > 1) {
    console.log(
      `\n  ✗ shelf spans ${shelfDates.size} air dates: ${[...shelfDates].sort().join(', ')}`,
    );
    problems += 1;
  }
}

console.log(`\n--- ${problems} problem${problems === 1 ? '' : 's'}`);
