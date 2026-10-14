import { describe, expect, it, vi } from 'vitest';
import { briefStateV3Schema, type BriefStateV3 } from '../../shared/briefSchema.js';
import {
  createAlgoliaEvidenceSearch,
  createEvidenceRetriever,
} from '../../server/concierge/retrieveEvidence.js';
import { createContentEvidenceSearch } from '../../server/concierge/contentEvidenceSearch.js';

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

const helpInput = {
  source: 'help',
  query: 'how do I return an item',
  count: 3,
  missionId: 'mission-1',
  expectedRevision: 2,
  turnId: 'turn-5',
  target: null,
} as const;

const helpHit = {
  objectID: 'help_returns__how-to-return',
  document_id: 'help_returns',
  title: 'Returning an item',
  heading_path: ['Help', 'Returns', 'How to return'],
  content: 'Items may be returned within 30 days of delivery with the original packing slip.',
  scope_text: 'JTV returns policy: 30-day return window with original packing slip.',
  canonical_url: 'https://www.jtv.com/help/returns',
  source_role: 'policy-page',
  topic: 'returns',
  content_hash: 'help-hash-1',
};

describe('help evidence source boundaries', () => {
  it('queries the help_content index with the help projection and returns citation-ready records', async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ results: [{ hits: [helpHit] }] }), { status: 200 }),
    );
    const search = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve(helpInput);

    expect(result.status).toBe('ok');
    expect(result.source).toBe('help');
    expect(result.effectiveFilters).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      source: 'help',
      objectID: 'help_returns__how-to-return',
      record: {
        document_id: 'help_returns',
        title: 'Returning an item',
        canonical_url: 'https://www.jtv.com/help/returns',
      },
    });
    expect(result.records[0].evidenceRef).toMatch(/^help\/help_returns__how-to-return\//);
    const request = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(request.requests[0].indexName).toBe('help_content');
    const attributes = JSON.parse(
      new URLSearchParams(request.requests[0].params).get('attributesToRetrieve') ?? '[]',
    );
    expect(attributes).toContain('document_id');
    expect(attributes).toContain('heading_path');
    expect(attributes).not.toContain('Catalog_ProductType');
  });

  it('rejects a target on help evidence at the schema boundary', async () => {
    const fetch = vi.fn();
    const search = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve({
      ...helpInput,
      target: { kind: 'item', itemKey: 'VG320P', productType: 'Ring' },
    });

    expect(result.status).toBe('invalid_input');
    expect(result.source).toBe('help');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects exact object lookup on help evidence', async () => {
    const fetch = vi.fn();
    const search = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve({ ...helpInput, exactObjectIDs: ['help_returns'] });

    expect(result.status).toBe('invalid_input');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns incomplete_evidence when a help record is missing required fields', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            results: [{ hits: [{ ...helpHit, canonical_url: '', content_hash: undefined }] }],
          }),
          { status: 200 },
        ),
    );
    const search = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve(helpInput);

    expect(result.status).toBe('incomplete_evidence');
    expect(result.unresolved).toEqual([
      { field: 'help', reason: 'Required evidence fields missing: canonical_url, content_hash' },
    ]);
    expect(result.records).toEqual([]);
  });

  it('returns zero_hits when the help index has no matches without inventing records', async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ results: [{ hits: [] }] }), { status: 200 }),
    );
    const search = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve({ ...helpInput, query: 'nonexistent policy xyzzy' });

    expect(result.status).toBe('zero_hits');
    expect(result.records).toEqual([]);
  });

  it('surfaces upstream failure when the help index is unreachable', async () => {
    const fetch = vi.fn(async () => new Response('unavailable', { status: 503 }));
    const search = createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch });
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve(helpInput);

    expect(result.status).toBe('upstream_failure');
    expect(result.error?.code).toBe('UPSTREAM_HTTP_503');
    expect(result.records).toEqual([]);
  });

  it('labels the source correctly on invalid input for a help request', async () => {
    const search = vi.fn();
    const retrieve = createEvidenceRetriever({ search, currentState: async () => state() });

    const result = await retrieve({ ...helpInput, count: 99 });

    expect(result.status).toBe('invalid_input');
    expect(result.source).toBe('help');
    expect(search).not.toHaveBeenCalled();
  });
});

// Craig Task 05 regressions: the two connected-battery misses
// (.checkpoint/runs/help-integration-battery-2026-10-12-batch2/q16 and q25).
// Both questions took the correct help source path but the verbatim multi-word
// query matched nothing under default AND semantics while the record existed.
describe('help query relaxation (Craig Task 05 regressions)', () => {
  const relaxedRetriever = (hits: unknown[]) => {
    const requests: URLSearchParams[] = [];
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { requests: [{ params: string }] };
      requests.push(new URLSearchParams(body.requests[0].params));
      return new Response(
        JSON.stringify({ results: [{ hits: requests.length === 1 ? [] : hits }] }),
        { status: 200 },
      );
    });
    const search = createContentEvidenceSearch({
      appId: 'APP',
      searchOnlyApiKey: 'KEY',
      fetch,
      inner: createAlgoliaEvidenceSearch({ appId: 'APP', searchOnlyApiKey: 'KEY', fetch }),
    });
    return { retrieve: createEvidenceRetriever({ search, currentState: async () => state() }), requests };
  };

  it('finds the existing auctions record for the q16 battery miss', async () => {
    const { retrieve, requests } = relaxedRetriever([
      {
        ...helpHit,
        objectID: 'help_auctions__types-of-auctions',
        document_id: 'help_auctions',
        title: 'Types of Auctions on JTV Auctions',
        heading_path: ['Auctions', 'Types of Auctions'],
        content:
          'JTV Auctions has several different types of auctions, including English/Open Auctions and Reserve Auctions.',
        canonical_url: 'https://www.jtv.com/help/types-of-auctions-on-jtv-auctions',
        topic: 'auctions',
        content_hash: 'auctions-hash-1',
      },
    ]);

    const result = await retrieve({
      ...helpInput,
      query: 'JTV Auctions types of auctions auction formats',
    });

    expect(result.status).toBe('ok');
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      source: 'help',
      objectID: 'help_auctions__types-of-auctions',
      record: { title: 'Types of Auctions on JTV Auctions' },
    });
    expect(result.records[0].evidenceRef).toMatch(/^help\/help_auctions__types-of-auctions\//);
    expect(requests[1].get('removeWordsIfNoResults')).toBe('lastWords');
  });

  it('finds the existing live viewer record for the q25 battery miss', async () => {
    const { retrieve } = relaxedRetriever([
      {
        ...helpHit,
        objectID: 'help_live__viewer',
        document_id: 'help_live',
        title: 'JTV Live Viewer Help',
        heading_path: ['JTV Live Viewer Help', 'How Do I Use the Live Viewer?'],
        content:
          'To view live programming, select the Watch us Live link to open the live viewer window.',
        canonical_url: 'https://www.jtv.com/help/jtv-live-viewer-help',
        topic: 'live viewer',
        content_hash: 'live-hash-1',
      },
    ]);

    const result = await retrieve({
      ...helpInput,
      query: 'watch JTV live streaming television channel',
    });

    expect(result.status).toBe('ok');
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      source: 'help',
      objectID: 'help_live__viewer',
      record: { title: 'JTV Live Viewer Help' },
    });
  });

  it('keeps a genuine no-result honest instead of inventing relaxed matches', async () => {
    const { retrieve, requests } = relaxedRetriever([]);

    const result = await retrieve({ ...helpInput, query: 'flurble wompity zanzibar coconut' });

    expect(result.status).toBe('zero_hits');
    expect(result.records).toEqual([]);
    expect(requests).toHaveLength(2);
  });
});
