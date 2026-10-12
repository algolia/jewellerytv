import { describe, expect, it, vi } from 'vitest';
import { briefStateV3Schema, type BriefStateV3 } from '../../shared/briefSchema.js';
import {
  createAlgoliaEvidenceSearch,
  createEvidenceRetriever,
} from '../../server/concierge/retrieveEvidence.js';

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
