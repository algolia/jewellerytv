/* Isolates the stall inside the display tool's input stream.
 *
 * The tool writes its `intro`, pauses for seconds, then emits every group in a
 * few hundred milliseconds. This reports those three numbers separately so a
 * prompt or schema change can be judged on the one that matters rather than on
 * total turn time, which moves for unrelated reasons.
 *
 * Run it before a change and after. Caching is off; a cached turn replays a
 * previous decision and reports nothing about this one.
 *
 * Usage: node measure-display-stall.mjs [runsPerQuestion]
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
);
const { VITE_ALGOLIA_APP_ID: appId, VITE_ALGOLIA_SEARCH_API_KEY: apiKey, VITE_JTV_AGENT_ID: agentId } = env;

const QUESTIONS = ['Show me opal jewelry', 'Show me engagement rings', 'Compare tanzanite and amethyst rings'];
const RUNS = Number(process.argv[2] ?? 2);

async function measure(question) {
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
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let openedAt;
  let lastDeltaAt;
  let stall = 0;
  let stallAfterChars;
  let chars = 0;
  let deltas = 0;
  let input;
  let doneAt;

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
      const now = Date.now() - t0;
      if (event.type === 'tool-input-start' && event.toolName === 'algolia_grouped_results') {
        openedAt = now;
        lastDeltaAt = now;
      }
      if (openedAt !== undefined && event.type === 'tool-input-delta') {
        const gap = now - lastDeltaAt;
        if (gap > stall) {
          stall = gap;
          stallAfterChars = chars;
        }
        lastDeltaAt = now;
        deltas += 1;
        chars += (event.inputTextDelta ?? event.delta ?? '').length;
      }
      if (openedAt !== undefined && event.type === 'tool-input-available' && event.toolName === 'algolia_grouped_results') {
        doneAt = now;
        input = event.input;
      }
    }
  }
  const groups = input?.groups ?? [];
  return {
    openedAt,
    doneAt,
    phase: doneAt - openedAt,
    stall,
    stallAfterChars,
    writing: doneAt - openedAt - stall,
    chars,
    deltas,
    groups: groups.length,
    items: groups.reduce((total, group) => total + (group.results?.length ?? 0), 0),
    intro: (input?.intro ?? '').length,
  };
}

const all = [];
for (const question of QUESTIONS) {
  for (let run = 0; run < RUNS; run += 1) {
    const result = await measure(question);
    all.push(result);
    console.log(
      `"${question}" run ${run + 1}: phase ${result.phase}ms = stall ${result.stall}ms ` +
        `(after ${result.stallAfterChars} chars) + writing ${result.writing}ms   ` +
        `${result.groups} groups / ${result.items} items / ${result.chars} chars / intro ${result.intro}`,
    );
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
console.log(`\n--- ${all.length} turns`);
console.log(`stall   median ${median(all.map((r) => r.stall))}ms   max ${Math.max(...all.map((r) => r.stall))}ms`);
console.log(`writing median ${median(all.map((r) => r.writing))}ms`);
console.log(`payload median ${median(all.map((r) => r.chars))} chars, ${median(all.map((r) => r.groups))} groups, ${median(all.map((r) => r.items))} items`);
console.log(`stall lands after a median of ${median(all.map((r) => r.stallAfterChars))} chars written`);
