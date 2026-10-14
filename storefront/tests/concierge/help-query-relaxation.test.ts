import { describe, expect, it, vi } from 'vitest';
import { briefStateV3Schema, type BriefStateV3 } from '../../shared/briefSchema.js';
import {
  createAlgoliaEvidenceSearch,
  createEvidenceRetriever,
  type EvidenceSearchRequest,
} from '../../server/concierge/retrieveEvidence.js';
import {
  CONTENT_PROJECTIONS,
  createContentEvidenceSearch,
} from '../../server/concierge/contentEvidenceSearch.js';
import { runEvidenceRoute } from '../../server/concierge/evidenceRoute.js';

const state = (): BriefStateV3 =>
  briefStateV3Schema.parse({
    version: 3,
    missionId: 'mission-1',
    revision: 2,
    facts: [],
    processedTurns: [],
    tombstones: [],
    events: [],
  });

// Real help_content shapes measured on the live index 2026-10-13
// (.checkpoint/runs/help-misses-2026-10-13/help-index-probe.json).
const auctionsRecord = {
  objectID: 'help_auctions__types-of-auctions',
  document_id: 'help_auctions',
  title: 'Types of Auctions on JTV Auctions',
  heading_path: ['Auctions', 'Types of Auctions'],
  content:
    'JTV Auctions has several different types of auctions on its website, including but not limited to, English/Open Auctions and Reserve Auctions.',
  scope_text: 'JTV Auctions auction types: English/Open Auctions and Reserve Auctions.',
  canonical_url: 'https://www.jtv.com/help/types-of-auctions-on-jtv-auctions',
  source_role: 'policy-page',
  topic: 'auctions',
  content_hash: 'auctions-hash-1',
};

const liveViewerRecord = {
  objectID: 'help_live__viewer',
  document_id: 'help_live',
  title: 'JTV Live Viewer Help',
  heading_path: ['JTV Live Viewer Help', 'How Do I Use the Live Viewer?'],
  content:
    'To view live programming, simply follow these steps: from the navigation bar located near the top of the page, select the Watch us Live link to open the live viewer window.',
  scope_text: 'How to watch JTV live programming in the web live viewer.',
  canonical_url: 'https://www.jtv.com/help/jtv-live-viewer-help',
  source_role: 'policy-page',
  topic: 'live viewer',
  content_hash: 'live-hash-1',
};

function algoliaStub(responses: Array<Record<string, unknown>[]>) {
  const requests: Array<{ url: string; params: URLSearchParams }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { requests: [{ params: string }] };
    requests.push({
      url: String(input),
      params: new URLSearchParams(body.requests[0].params),
    });
    const hits = responses[Math.min(requests.length - 1, responses.length - 1)] ?? [];
    return new Response(JSON.stringify({ results: [{ hits }] }), { status: 200 });
  });
  return { fetch, requests };
}

const searchRequest = (overrides: Partial<EvidenceSearchRequest> = {}): EvidenceSearchRequest => ({
  source: 'help',
  query: 'JTV Auctions types of auctions auction formats',
  count: 15,
  exactObjectIDs: null,
  filters: [],
  signal: new AbortController().signal,
  ...overrides,
});

describe('content evidence search query relaxation', () => {
  it('recovers the auctions record when the verbatim help query misses, via one relaxed retry', async () => {
    const { fetch, requests } = algoliaStub([[], [auctionsRecord]]);
    const inner = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner,
    });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve({
      source: 'help',
      query: 'JTV Auctions types of auctions auction formats',
      count: 5,
      missionId: 'mission-1',
      expectedRevision: 2,
      turnId: 'turn-1',
      target: null,
    });

    expect(result.status).toBe('ok');
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      source: 'help',
      objectID: 'help_auctions__types-of-auctions',
      record: {
        title: 'Types of Auctions on JTV Auctions',
        canonical_url: 'https://www.jtv.com/help/types-of-auctions-on-jtv-auctions',
      },
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].params.get('query')).toBe('JTV Auctions types of auctions auction formats');
    // The base evidence search itself now sends query-level allOptional on the
    // first education attempt (blog-relax-patch-2026-10-13); the ladder's
    // lastWords retry stays as the stronger-miss fallback.
    expect(requests[0].params.get('removeWordsIfNoResults')).toBe('allOptional');
    // The retry keeps the exact same query text; only the relaxation parameter
    // differs. The app never rewrites or drops the agent's words itself.
    expect(requests[1].params.get('query')).toBe(requests[0].params.get('query'));
    expect(requests[1].params.get('removeWordsIfNoResults')).toBe('lastWords');
    expect(requests[1].params.get('attributesToRetrieve')).toBe(
      requests[0].params.get('attributesToRetrieve'),
    );
  });

  it('recovers the live viewer record for the second battery miss', async () => {
    const { fetch } = algoliaStub([[], [liveViewerRecord]]);
    const inner = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner,
    });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve({
      source: 'help',
      query: 'watch JTV live streaming television channel',
      count: 5,
      missionId: 'mission-1',
      expectedRevision: 2,
      turnId: 'turn-2',
      target: null,
    });

    expect(result.status).toBe('ok');
    expect(result.records[0]?.record).toMatchObject({
      title: 'JTV Live Viewer Help',
      canonical_url: 'https://www.jtv.com/help/jtv-live-viewer-help',
    });
  });

  it('stays honest when even the relaxed retry misses, reporting zero_hits after exactly two searches', async () => {
    const { fetch, requests } = algoliaStub([[], []]);
    const inner = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner,
    });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve({
      source: 'help',
      query: 'flurble wompity zanzibar coconut',
      count: 3,
      missionId: 'mission-1',
      expectedRevision: 2,
      turnId: 'turn-3',
      target: null,
    });

    expect(result.status).toBe('zero_hits');
    expect(result.records).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it('keeps a matching verbatim query to a single request', async () => {
    const { fetch, requests } = algoliaStub([[liveViewerRecord]]);
    const inner = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner,
    });

    const hits = await search(searchRequest({ query: 'JTV Live Viewer Help' }));

    expect(hits).toHaveLength(1);
    expect(requests).toHaveLength(1);
    // Single request: a matching query never escalates the ladder. The first
    // attempt carries the base search's query-level allOptional
    // (blog-relax-patch-2026-10-13); matched queries keep identical hits.
    expect(requests[0].params.get('removeWordsIfNoResults')).toBe('allOptional');
  });

  it('never relaxes prod_catalog searches', async () => {
    const inner = vi.fn(async (_request: EvidenceSearchRequest) => []);
    const fetch = vi.fn();
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner,
    });

    const hits = await search(
      searchRequest({ source: 'prod_catalog', query: 'gold ring size 6' }),
    );

    expect(hits).toEqual([]);
    expect(inner).toHaveBeenCalledTimes(1);
    const firstCall = inner.mock.calls[0]?.[0];
    expect(firstCall?.source).toBe('prod_catalog');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('delegates exact object lookups untouched so content sources still fail closed', async () => {
    const inner = vi.fn(async () => {
      throw new Error('Exact object lookup is only supported for prod_catalog');
    });
    const fetch = vi.fn();
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner,
    });

    await expect(
      search(searchRequest({ exactObjectIDs: ['help_auctions'] })),
    ).rejects.toThrow('Exact object lookup is only supported for prod_catalog');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps a relaxed-retry upstream failure to upstream_failure instead of an honest zero', async () => {
    const requests: URLSearchParams[] = [];
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { requests: [{ params: string }] };
      requests.push(new URLSearchParams(body.requests[0].params));
      if (requests.length === 1)
        return new Response(JSON.stringify({ results: [{ hits: [] }] }), { status: 200 });
      return new Response('upstream down', { status: 503 });
    });
    const inner = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner,
    });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve({
      source: 'help',
      query: 'JTV Auctions auction formats',
      count: 3,
      missionId: 'mission-1',
      expectedRevision: 2,
      turnId: 'turn-4',
      target: null,
    });

    expect(result.status).toBe('upstream_failure');
    expect(result.error?.code).toBe('UPSTREAM_HTTP_503');
  });

  it('skips the relaxed retry when the request was aborted during the first search', async () => {
    const controller = new AbortController();
    const inner = vi.fn(async (_request: EvidenceSearchRequest) => {
      controller.abort();
      return [];
    });
    const fetch = vi.fn();
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner,
    });

    const hits = await search(searchRequest({ signal: controller.signal }));

    expect(hits).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('relaxes blog searches with the same ladder', async () => {
    const { fetch, requests } = algoliaStub([[], [liveViewerRecord]]);
    const inner = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner,
    });

    const hits = await search(
      searchRequest({ source: 'blog', query: 'gemstone education article wording' }),
    );

    expect(hits).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(requests[1].params.get('removeWordsIfNoResults')).toBe('lastWords');
  });

  it('pins the content projections to the ones the app search actually sends', async () => {
    const captured = new Map<string, string[]>();
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        requests: [{ indexName: string; params: string }];
      };
      const params = new URLSearchParams(body.requests[0].params);
      captured.set(
        body.requests[0].indexName,
        JSON.parse(params.get('attributesToRetrieve') ?? '[]'),
      );
      return new Response(JSON.stringify({ results: [{ hits: [] }] }), { status: 200 });
    });
    const probe = createAlgoliaEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
    });
    for (const source of ['blog', 'help'] as const) {
      await probe({
        source,
        query: 'projection parity probe',
        count: 1,
        exactObjectIDs: null,
        filters: [],
        signal: new AbortController().signal,
      });
    }
    expect(CONTENT_PROJECTIONS.blog).toEqual(captured.get('blog'));
    expect(CONTENT_PROJECTIONS.help).toEqual(captured.get('help_content'));
  });
});

describe('help query relaxation through the evidence route', () => {
  it('returns the missed auctions record as grounded evidence through /api/agent-evidence wiring', async () => {
    const { fetch, requests } = algoliaStub([[], [auctionsRecord]]);
    const result = await runEvidenceRoute(
      {
        input: {
          source: 'help',
          query: 'JTV Auctions types of auctions auction formats',
          count: 5,
          exactObjectIDs: null,
          missionId: 'mission-1',
          expectedRevision: 2,
          turnId: 'turn-1',
          target: null,
        },
        brief: state(),
      },
      { appId: 'APP', searchOnlyApiKey: 'KEY', fetch: fetch as typeof fetch, signal: new AbortController().signal },
    );

    expect(result.status).toBe('ok');
    expect(result.records[0]?.record).toMatchObject({
      title: 'Types of Auctions on JTV Auctions',
      canonical_url: 'https://www.jtv.com/help/types-of-auctions-on-jtv-auctions',
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].params.get('removeWordsIfNoResults')).toBe('lastWords');
  });
});
