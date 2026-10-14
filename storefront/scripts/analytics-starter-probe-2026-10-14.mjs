#!/usr/bin/env node
/**
 * Read-only analytics probe for starter-question curation (2026-10-14).
 *
 * Loads the root .env.local (same manual pattern as watch-attribute-probe),
 * finds a key that can read the Analytics API by probing, then prints
 * aggregate top searches for the three source indices over 90-day and
 * 12-month windows. Strictly read-only: no writes, no instrumentation.
 * Prints key NAMES only, never values.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const local = {};
try {
  const path = fileURLToPath(new URL('../../.env.local', import.meta.url));
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) local[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {
  // environment-only use
}

const appId = process.env.ALGOLIA_APP_ID ?? local.ALGOLIA_APP_ID;
if (!appId) throw new Error('Missing ALGOLIA_APP_ID');

// Candidate key names, probed in order. Values stay in this process.
const candidateNames = [
  ...new Set([
    ...Object.keys(local),
    ...Object.keys(process.env).filter((n) =>
      /^ALGOLIA|^.*INDEX_API_KEY$|^.*SEARCH.*KEY$|^.*ANALYTICS/i.test(n),
    ),
  ]),
].filter((n) => /ALGOLIA|INDEX_API_KEY|SEARCH|ANALYTICS|ADMIN/i.test(n));

console.log('candidate key NAMES:', candidateNames.join(', '));

const INDEXES = ['prod_catalog', 'blog', 'help_content'];
const now = Date.now();
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const WINDOWS = [
  { name: '90d', start: fmt(now - 90 * 864e5), end: fmt(now) },
  { name: '12m', start: fmt(now - 365 * 864e5), end: fmt(now) },
];

async function probeKey(keyName) {
  const key = process.env[keyName] ?? local[keyName];
  if (!key) return null;
  const headers = { 'x-algolia-application-id': appId, 'x-algolia-api-key': key };
  const url = `https://analytics.algolia.com/2/searches/count?index=prod_catalog&startDate=${WINDOWS[0].start}&endDate=${WINDOWS[0].end}`;
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    return { keyName, status: res.status, text: text.slice(0, 300) };
  } catch (e) {
    return { keyName, status: 0, text: `network error: ${e.message}` };
  }
}

let workingKey = null;
for (const name of candidateNames) {
  const probe = await probeKey(name);
  if (!probe) continue;
  console.log(`probe ${name}: HTTP ${probe.status} ${probe.text.slice(0, 120)}`);
  if (probe.status === 200) {
    workingKey = name;
    break;
  }
}

if (!workingKey) {
  console.log('GATE-FAIL: no candidate key could read the Analytics API');
  process.exit(2);
}

const key = process.env[workingKey] ?? local[workingKey];
const headers = { 'x-algolia-application-id': appId, 'x-algolia-api-key': key };
console.log(`WORKING-KEY-NAME: ${workingKey}`);

for (const index of INDEXES) {
  // Volume first: total search count per window.
  for (const w of WINDOWS) {
    const url = `https://analytics.algolia.com/2/searches/count?index=${encodeURIComponent(index)}&startDate=${w.start}&endDate=${w.end}`;
    try {
      const res = await fetch(url, { headers });
      const body = await res.text();
      console.log(
        `VOLUME ${index} ${w.name} (${w.start}..${w.end}): HTTP ${res.status} ${body.slice(0, 200)}`,
      );
    } catch (e) {
      console.log(`VOLUME ${index} ${w.name}: ERROR ${e.message}`);
    }
  }
  // Top searches, most recent window primarily, 12m as comparison.
  for (const w of WINDOWS) {
    const url = `https://analytics.algolia.com/2/searches?index=${encodeURIComponent(index)}&startDate=${w.start}&endDate=${w.end}&limit=100`;
    try {
      const res = await fetch(url, { headers });
      const body = await res.text();
      if (res.status !== 200) {
        console.log(`TOP ${index} ${w.name}: HTTP ${res.status} ${body.slice(0, 200)}`);
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        console.log(`TOP ${index} ${w.name}: unparseable body ${body.slice(0, 200)}`);
        continue;
      }
      const rows = Array.isArray(parsed.searches) ? parsed.searches : [];
      console.log(`TOP ${index} ${w.name}: ${rows.length} search themes (showing top 60)`);
      for (const r of rows.slice(0, 60)) {
        console.log(
          `  ${String(r.count ?? r.searchCount ?? '?').padStart(7)}  ${r.query ?? JSON.stringify(r).slice(0, 80)}`,
        );
      }
    } catch (e) {
      console.log(`TOP ${index} ${w.name}: ERROR ${e.message}`);
    }
  }
}
console.log('DONE read-only');
