import { describe, expect, it, vi } from 'vitest';
import { createConciergeToolRuntime } from '../../src/concierge/toolRuntime';
import { createSdkClientTools } from '../../src/concierge/sdkTools';
import { canonicalBlogUrlsFromMessages } from '../../src/concierge/verifiedBlogLinks';
import type { RetrieveEvidenceResult } from '../../shared/concierge/retrieval/types';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const shopper = { id: 'message-1', text: 'How do I return a ring?' };

const helpEvidence: RetrieveEvidenceResult['records'][number] = {
  source: 'help',
  objectID: 'help_returns__how-to-return',
  contentHash: 'help-hash-1',
  retrievedAt: '2026-10-12T00:00:00.000Z',
  evidenceRef: 'help/help_returns__how-to-return/help-hash-1',
  record: {
    objectID: 'help_returns__how-to-return',
    document_id: 'help_returns',
    title: 'Returning an item',
    heading_path: ['Help', 'Returns'],
    content: 'Items may be returned within 30 days.',
    scope_text: 'JTV returns policy summary.',
    canonical_url: 'https://www.jtv.com/help/returns',
    source_role: 'policy-page',
    topic: 'returns',
    content_hash: 'help-hash-1',
  },
};

function runtimeWithRecords(records: RetrieveEvidenceResult['records']) {
  return createConciergeToolRuntime({
    storage: memoryStorage(),
    initialMissionId: 'mission-1',
    getCurrentShopperMessage: () => shopper,
    fetchEvidence: async (body) => ({
      status: 'ok',
      source: body.input.source,
      missionId: body.input.missionId,
      revision: body.input.expectedRevision,
      expectedRevision: body.input.expectedRevision,
      turnId: body.input.turnId,
      effectiveFilters: [],
      unresolved: [],
      records,
    }),
  });
}

describe('help source in the concierge tool runtime', () => {
  it('passes help requests through to evidence with trusted turn identity', async () => {
    const calls: unknown[] = [];
    const runtime = createConciergeToolRuntime({
      storage: memoryStorage(),
      initialMissionId: 'mission-1',
      getCurrentShopperMessage: () => shopper,
      fetchEvidence: async (body) => {
        calls.push(body);
        return {
          status: 'ok',
          source: body.input.source,
          missionId: body.input.missionId,
          revision: body.input.expectedRevision,
          expectedRevision: body.input.expectedRevision,
          turnId: body.input.turnId,
          effectiveFilters: [],
          unresolved: [],
          records: [],
        };
      },
    });
    runtime.beginTurn('turn-1', shopper.id);

    const result = await runtime.retrieveSemantic(
      { source: 'help', query: 'returns policy', count: 2, target: null },
      'call',
    );

    expect(result.status).toBe('ok');
    expect(
      (calls[0] as { input: { source: string; missionId: string; turnId: string } }).input,
    ).toMatchObject({ source: 'help', missionId: 'mission-1', turnId: 'turn-1' });
  });

  it('rejects a help request carrying a product target or exact object IDs', async () => {
    const runtime = runtimeWithRecords([]);
    runtime.beginTurn('turn-1', shopper.id);

    const withTarget = await runtime.retrieveSemantic(
      {
        source: 'help',
        query: 'returns policy',
        count: 2,
        target: { kind: 'item', itemKey: 'VG320P', productType: 'Ring' },
      },
      'call',
    );
    expect(withTarget.status).toBe('invalid_input');

    const withExact = await runtime.retrieveSemantic(
      {
        source: 'help',
        query: 'returns policy',
        count: 2,
        target: null,
        exactObjectIDs: ['help_returns'],
      },
      'call-2',
    );
    expect(withExact.status).toBe('invalid_input');
  });

  it('keeps help evidence out of the presentable product ledger', async () => {
    const runtime = runtimeWithRecords([helpEvidence]);
    runtime.beginTurn('turn-1', shopper.id);

    const retrieved = await runtime.retrieveSemantic(
      { source: 'help', query: 'returns policy', count: 1, target: null },
      'call',
    );
    expect(retrieved.status).toBe('ok');
    if (retrieved.status !== 'ok' || !('records' in retrieved)) throw new Error('no records');
    const alias = retrieved.records[0]?.evidenceRef;
    expect(typeof alias).toBe('string');
    if (!alias) return;

    const presented = await runtime.presentSemantic(
      {
        body: {
          kind: 'product_groups',
          groups: [
            {
              basis: { attribute: 'Catalog_ProductType', value: 'Ring' },
              items: [
                {
                  evidenceRef: alias,
                  quantity: 1,
                  componentSlot: 'hero',
                  explanation: 'Suggested ring',
                },
              ],
            },
          ],
          alternatives: null,
        },
      },
      'call-2',
    );
    expect(presented.status).toBe('invalid_evidence');
    expect(presented.reasons).toContain('unknown_or_stale_evidence');
  });

  it('authorizes help canonical URLs from transcript tool output for prose citations', () => {
    const messages = [
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-retrieve_evidence',
            state: 'output-available',
            output: {
              status: 'ok',
              source: 'help',
              records: [
                {
                  source: 'help',
                  objectID: 'help_returns__how-to-return',
                  contentHash: 'help-hash-1',
                  record: { canonical_url: 'https://www.jtv.com/help/returns' },
                },
              ],
            },
          },
        ],
      },
    ];
    const urls = canonicalBlogUrlsFromMessages(messages);
    expect(urls.has('https://www.jtv.com/help/returns')).toBe(true);
    // An unclaimed URL stays unauthorized even from a jtv.com host.
    expect(urls.has('https://www.jtv.com/help/shipping')).toBe(false);
  });

  it('accepts a help source through the SDK bridge normalization', async () => {
    const retrieveSemantic = vi.fn(
      async (_input: { source: string }) => ({ status: 'ok', records: [] }),
    );
    const tools = createSdkClientTools({
      updateSemantic: vi.fn(async () => ({ status: 'applied', revision: 1 })),
      retrieveSemantic,
      presentSemantic: vi.fn(async () => ({ status: 'staged' })),
      getActiveTurnToken: vi.fn(() => 1),
      notePresentationAttempt: vi.fn(() => true),
    } as unknown as Parameters<typeof createSdkClientTools>[0]);
    const tool = tools.retrieve_evidence.onToolCall!;
    let submitted: unknown = null;
    await tool({
      input: {
        source: 'help',
        query: 'shipping policy',
        count: 2,
        target: null,
        missionId: 'mission-1',
        expectedRevision: 0,
        turnId: 'turn-1',
      },
      toolCallId: 'call-help',
      signal: new AbortController().signal,
      addToolResult: (result: unknown) => {
        submitted = result;
      },
    } as unknown as Parameters<typeof tool>[0]);
    expect(retrieveSemantic).toHaveBeenCalled();
    expect((retrieveSemantic.mock.calls[0][0] as { source: string }).source).toBe('help');
    expect(submitted).toMatchObject({ output: { status: 'ok' } });
  });
});
