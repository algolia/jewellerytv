// Read-only live check: run the real evidence retriever against the real
// help_content index. No writes, no index settings access. Verifies shipping,
// returns, and account-style Help questions retrieve citation-ready records,
// and that a nonsense query fails closed with zero_hits.
import { loadConfig } from '../server/config.js';
import {
  createAlgoliaEvidenceSearch,
  createEvidenceRetriever,
} from '../server/concierge/retrieveEvidence.js';

const config = loadConfig();
const search = createAlgoliaEvidenceSearch({
  appId: config.appId,
  searchOnlyApiKey: config.apiKey,
});
const state = () => ({
  version: 3,
  missionId: 'live-check',
  revision: 0,
  facts: [],
  processedTurns: [],
  tombstones: [],
  events: [],
});
const retrieve = createEvidenceRetriever({ search, currentState: state });
const makeInput = (query) => ({
  source: 'help',
  query,
  count: 3,
  missionId: 'live-check',
  expectedRevision: 0,
  turnId: 'live-turn',
  target: null,
});

for (const query of ['how do I return an item', 'shipping', 'payment methods']) {
  const result = await retrieve(makeInput(query));
  const first = result.records[0];
  console.log(
    JSON.stringify(
      {
        query,
        status: result.status,
        hits: result.records.length,
        firstObjectID: first?.objectID ?? null,
        firstTitle: first?.record?.title ?? null,
        firstUrl: first?.record?.canonical_url ?? null,
        evidenceRef: first?.evidenceRef ?? null,
      },
      null,
      0,
    ),
  );
}

const failed = await retrieve(makeInput('zzqqxyw nonsensical policy term'));
console.log(JSON.stringify({ query: 'zzqqxyw nonsensical policy term', status: failed.status, hits: failed.records.length }));
