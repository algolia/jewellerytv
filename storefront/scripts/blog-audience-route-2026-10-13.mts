// Craig Task 07 local-connected route probe, 2026-10-13 (read-only, no agent,
// no paid turn): exercises the application's own /api/agent-evidence route
// handler (runEvidenceRoute: schema validation, brief state, projection and
// completeness checks) against the live blog index with audience-shaped chain
// queries. Labels receipts local-connected. No index settings are touched.
import { loadConfig } from '../server/config.js';
import { runEvidenceRoute } from '../server/concierge/evidenceRoute.js';
import { briefStateV3Schema } from '../shared/briefSchema.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const config = loadConfig();
const OUT = '../.checkpoint/runs/article-audience-2026-10-13/route-probe';
mkdirSync(OUT, { recursive: true });

// Minimal accepted brief: blog queries compile no filters, so an empty fact
// list is valid and matches a mission before any product facts are accepted.
const brief = briefStateV3Schema.parse({
  version: 3,
  missionId: 'article-audience-probe',
  revision: 1,
  facts: [],
  processedTurns: [],
  tombstones: [],
  events: [],
});

const input = (query: string) => ({
  source: 'blog' as const,
  query,
  count: 5,
  missionId: 'article-audience-probe',
  expectedRevision: 1,
  turnId: 'turn-probe-1',
  target: null,
  exactObjectIDs: null,
});

const cases = [
  { label: 'mens-chain', query: 'chain necklaces for men' },
  { label: 'womens-chain', query: 'chain necklace lengths for women' },
  { label: 'neutral-chain', query: 'chain necklace guide' },
  {
    label: 'craig-exact-long',
    query: "men's chain necklace styles choosing chain necklace guide",
  },
];

type PassageSummary = {
  objectID: string;
  title: unknown;
  heading_path: unknown;
  canonical_url: unknown;
  published_at: unknown;
  modified_at: unknown;
  contentPreview: string;
};

type RouteSummary = {
  label: string;
  query: string;
  status: string;
  recordCount: number;
  records: PassageSummary[];
  error: unknown;
  unresolved: unknown;
};

const results: RouteSummary[] = [];
for (const { label, query } of cases) {
  const result = await runEvidenceRoute(
    { input: input(query), brief },
    {
      appId: config.appId,
      searchOnlyApiKey: config.apiKey,
      fetch,
      signal: new AbortController().signal,
    },
  );
  const summary = {
    label,
    query,
    status: result.status,
    recordCount: result.records.length,
    records: result.records.map((r) => {
      const rec = r.record as Record<string, unknown>;
      return {
        objectID: r.objectID,
        title: rec.title,
        heading_path: rec.heading_path,
        canonical_url: rec.canonical_url,
        published_at: rec.published_at,
        modified_at: rec.modified_at,
        contentPreview: String(rec.content ?? '').slice(0, 400),
      };
    }),
    error: result.error ?? null,
    unresolved: result.unresolved ?? [],
  };
  results.push(summary);
  writeFileSync(join(OUT, `${label}.json`), JSON.stringify(summary, null, 2));
  console.log(`\n=== ${label}: "${query}" ===`);
  console.log(`status=${result.status} records=${result.records.length}`);
  for (const r of result.records) {
    const rec = r.record as Record<string, unknown>;
    console.log(`  - ${rec.title} | ${JSON.stringify(rec.heading_path)} | ${rec.canonical_url}`);
  }
  if (result.error) console.log(`  error: ${JSON.stringify(result.error)}`);
}

writeFileSync(join(OUT, 'route-probe-summary.json'), JSON.stringify({
  probe: 'article-audience local-connected route probe (runEvidenceRoute, live blog index, no agent)',
  label: 'local-connected',
  at: new Date().toISOString(),
  results: results.map((r) => ({
    label: r.label,
    query: r.query,
    status: r.status,
    recordCount: r.recordCount,
    first: r.records[0]?.heading_path ?? null,
  } as Record<string, unknown>)),
}, null, 2));
console.log(`\nReceipts: ${OUT}`);
