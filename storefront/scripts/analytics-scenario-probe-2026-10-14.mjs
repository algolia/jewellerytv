#!/usr/bin/env node
/**
 * Read-only analytics probe, scenario intents (2026-10-14, second pass).
 * Pulls the full top-searches list (limit 1000) for prod_catalog over both
 * windows and prints rows matching scenario keywords, so gift/occasion/care/
 * styling/preference demand can be measured before rebuilding the starter
 * pool. Same .env.local pattern as the first probe; key names only.
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
const key = process.env.ALGOLIA_ANALYTICS_API_KEY ?? local.ALGOLIA_ANALYTICS_API_KEY;
if (!appId || !key) throw new Error('Missing ALGOLIA_APP_ID / ALGOLIA_ANALYTICS_API_KEY');
const headers = { 'x-algolia-application-id': appId, 'x-algolia-api-key': key };

const now = Date.now();
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const WINDOWS = [
  { name: '90d', start: fmt(now - 90 * 864e5), end: fmt(now) },
  { name: '12m', start: fmt(now - 365 * 864e5), end: fmt(now) },
];

const SCENARIO = /gift|anniversar|wedding|bridal|bride|care|clean|repair|resiz|polish|store|travel|match|pair|outfit|style|stack|layer|trend|new arrival|birthstone|zodiac|zodiaq|invest|apprais|sell|trade|gold|silver|platinum|budget|cheap|under \$|afford|everyday|work|office|date|prom|mothers|mother's|mom|dad|graduat|valentine|christmas|holiday|birthday/i;
const NON_THEME = /^(rst|hosts|qck)$/;
const EXCLUDE_EMPTY = true;

for (const index of ['prod_catalog']) {
  for (const w of WINDOWS) {
    const url = `https://analytics.algolia.com/2/searches?index=${encodeURIComponent(index)}&startDate=${w.start}&endDate=${w.end}&limit=1000`;
    const res = await fetch(url, { headers });
    if (res.status !== 200) {
      console.log(`SCENARIO ${index} ${w.name}: HTTP ${res.status}`);
      continue;
    }
    const parsed = await res.json();
    const rows = Array.isArray(parsed.searches) ? parsed.searches : [];
    console.log(`SCENARIO ${index} ${w.name}: ${rows.length} rows fetched`);
    let shown = 0;
    for (const r of rows) {
      const q = String(r.search ?? '');
      if (EXCLUDE_EMPTY && !q.trim()) continue;
      if (NON_THEME.test(q.trim())) continue;
      if (!SCENARIO.test(q)) continue;
      shown += 1;
      if (shown <= 90) console.log(`  ${String(r.count ?? '?').padStart(7)}  ${q}`);
    }
    console.log(`SCENARIO ${index} ${w.name}: ${shown} matching rows`);
  }
}
console.log('DONE read-only');
