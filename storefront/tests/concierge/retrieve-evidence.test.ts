import { describe, expect, it, vi } from 'vitest';
import { briefStateV3Schema, type BriefStateV3 } from '../../shared/briefSchema.js';
import { CATALOGUE_GROUP_BASIS_ATTRIBUTES } from '../../shared/concierge/presentation-contract.js';
import {
  createAlgoliaEvidenceSearch,
  createEvidenceRetriever,
  evidenceRef,
  hashEvidenceRecord,
} from '../../server/concierge/retrieveEvidence.js';

const ev = { messageId: 'm', quote: 'explicit', explicit: true, verified: true };
const state = (facts: unknown[] = [], revision = 2): BriefStateV3 =>
  briefStateV3Schema.parse({
    version: 3,
    missionId: 'mission-1',
    revision,
    facts: facts.map((fact, i) => ({
      id: `f${i}`,
      status: 'active',
      revision,
      createdAt: 'now',
      origin: 'spoken',
      certainty: 'explicit',
      strength: 'requirement',
      evidence: ev,
      ...(fact as Record<string, unknown>),
    })),
    processedTurns: [],
    tombstones: [],
    events: [],
  });
const productInput = (patch: Record<string, unknown> = {}) => ({
  source: 'prod_catalog',
  query: '',
  count: 3,
  missionId: 'mission-1',
  expectedRevision: 2,
  turnId: 'turn-1',
  target: { kind: 'item', itemKey: 'Ring', productType: 'Ring' },
  ...patch,
});
const ring = {
  field: 'product_type',
  scope: { kind: 'mission', key: null },
  value: { kind: 'facet', attribute: 'Catalog_ProductType', values: ['Ring'], operator: 'any' },
};

describe('retrieve_evidence', () => {
  /* Legacy item-scope scenarios: an exact target may have an older differently cased
   * live or tentative sibling; refuse search before compiling partial hard constraints.
   * Identical keys and retired siblings do not block read-only retrieval. */
  it.each(['active', 'tentative'] as const)(
    'fails closed before search for a legacy %s case-colliding item budget',
    async (budgetStatus) => {
      const search = vi.fn().mockResolvedValue([]);
      const retrieve = createEvidenceRetriever({
        search,
        currentState: async () =>
          state([
            {
              field: 'product_type',
              scope: { kind: 'item', key: 'necklace-vg320p' },
              value: {
                kind: 'facet',
                attribute: 'Catalog_ProductType',
                values: ['Necklace'],
                operator: 'any',
              },
            },
            {
              status: budgetStatus,
              field: 'budget',
              scope: { kind: 'item', key: 'necklace-vg320P' },
              value: {
                kind: 'money',
                cents: 50000,
                currency: 'USD',
                operator: 'lte',
                basis: 'per-item',
              },
            },
          ]),
      });
      const result = await retrieve(
        productInput({
          target: { kind: 'item', itemKey: 'necklace-vg320p', productType: 'Necklace' },
        }),
      );
      expect(result).toMatchObject({
        status: 'unsupported_constraint',
        error: { code: 'ITEM_SCOPE_KEY_COLLISION' },
        records: [],
      });
      expect(search).not.toHaveBeenCalled();
    },
  );
  it('does not reserve a retired differently cased item scope', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'product_type',
            scope: { kind: 'item', key: 'necklace-vg320p' },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Necklace'],
              operator: 'any',
            },
          },
          {
            status: 'retracted',
            field: 'budget',
            scope: { kind: 'item', key: 'necklace-vg320P' },
            value: {
              kind: 'money',
              cents: 50000,
              currency: 'USD',
              operator: 'lte',
              basis: 'per-item',
            },
          },
        ]),
    });
    const result = await retrieve(
      productInput({
        target: { kind: 'item', itemKey: 'necklace-vg320p', productType: 'Necklace' },
      }),
    );
    expect(result.status).toBe('zero_hits');
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('rejects model supplied constraints and arbitrary sources', async () => {
    const retrieve = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([]),
      currentState: async () => state([ring]),
    });
    expect((await retrieve({ ...productInput(), source: 'other' })).status).toBe('invalid_input');
    expect(
      (await retrieve({ ...productInput(), filters: 'Pricing_ActivePrice < 10' })).status,
    ).toBe('invalid_input');
  });
  it('requires explicit nullable target by source', async () => {
    const retrieve = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([]),
      currentState: async () => state([ring]),
    });
    const blog = {
      source: 'blog',
      target: null,
      query: '',
      count: 1,
      missionId: 'mission-1',
      expectedRevision: 2,
      turnId: 'turn-1',
    };
    expect((await retrieve(blog)).status).toBe('zero_hits');
    expect(
      (await retrieve({ ...blog, target: { kind: 'item', itemKey: 'Ring', productType: 'Ring' } }))
        .status,
    ).toBe('invalid_input');
    expect((await retrieve({ ...productInput(), target: null })).status).toBe('zero_hits');
    expect((await retrieve({ ...blog, extra: true })).status).toBe('invalid_input');
    expect(
      (
        await retrieve({
          source: 'blog',
          target: null,
          query: '',
          count: 0,
          missionId: 'm',
          expectedRevision: 0,
          turnId: 't',
        })
      ).status,
    ).toBe('invalid_input');
  });
  it('applies the confirmed gemstone blue facet exactly', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          ring,
          {
            field: 'gemstone',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_GemstoneInformation.GemstoneColorGroup',
              values: ['Blue'],
              operator: 'any',
            },
          },
        ]),
    });
    await retrieve(productInput({ target: null }));
    expect(search.mock.calls[0][0].filters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' },
      { field: 'Catalog_GemstoneInformation.GemstoneColorGroup', operator: 'eq', value: 'Blue' },
    ]);
  });
  it('filters a requested primary gemstone by its live catalogue name', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          ring,
          {
            field: 'gemstone',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_GemstoneInformationPrimary.GemstoneName',
              values: ['Diamond'],
              operator: 'any',
            },
          },
        ]),
    });
    await retrieve(productInput({ target: null }));
    expect(search.mock.calls[0][0].filters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' },
      {
        field: 'Catalog_GemstoneInformationPrimary.GemstoneName',
        operator: 'eq',
        value: 'Diamond',
      },
    ]);
  });
  it('keeps blue watch dials and metal bracelet requirements on watch attributes', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        objectID: 'watch-bad-band',
        Catalog_ProductType: 'Wrist Watch',
        Catalog_WatchPrimaryDialPrimaryColor: 'Blue',
        Catalog_WatchBandType: 'Bracelet',
        Catalog_BandMaterialInformation: [{ WatchBandMaterialName: 'Silicone' }],
        Pricing_ActivePrice: 79,
      },
      {
        objectID: 'watch-1',
        Catalog_ProductType: 'Wrist Watch',
        Catalog_WatchPrimaryDialPrimaryColor: 'Blue',
        Catalog_WatchBandType: 'Bracelet',
        Catalog_BandMaterialInformation: [{ WatchBandMaterialName: 'Stainless Steel' }],
        Catalog_WatchCaseSize: '27mm',
        Pricing_ActivePrice: 99,
      },
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'product_type',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Wrist Watch'],
              operator: 'any',
            },
          },
          {
            field: 'watch_dial_color',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_WatchPrimaryDialPrimaryColor',
              values: ['Blue'],
              operator: 'any',
            },
          },
          {
            field: 'watch_band_type',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_WatchBandType',
              values: ['Bracelet'],
              operator: 'any',
            },
          },
          {
            field: 'watch_band_material',
            scope: { kind: 'mission', key: null },
            value: { kind: 'watch_band_family', family: 'metal' },
          },
        ]),
    });
    const result = await retrieve(productInput({ target: null, query: 'blue dial watch' }));
    expect(result.status).toBe('ok');
    expect(result.records.map((record) => record.objectID)).toEqual(['watch-1']);
    expect(search.mock.calls[0][0].filters).toEqual(
      expect.arrayContaining([
        { field: 'Catalog_ProductType', operator: 'eq', value: 'Wrist Watch' },
        { field: 'Catalog_WatchPrimaryDialPrimaryColor', operator: 'eq', value: 'Blue' },
        { field: 'Catalog_WatchBandType', operator: 'eq', value: 'Bracelet' },
        expect.objectContaining({
          field: 'Catalog_BandMaterialInformation.WatchBandMaterialName',
          operator: 'in',
          value: expect.arrayContaining(['Stainless Steel', 'Titanium']),
        }),
      ]),
    );
    expect(result.records[0].record).toMatchObject({
      Catalog_WatchPrimaryDialPrimaryColor: 'Blue',
      Catalog_WatchBandType: 'Bracelet',
      Catalog_WatchCaseSize: '27mm',
      Catalog_BandMaterialInformation: [{ WatchBandMaterialName: 'Stainless Steel' }],
    });
  });
  it('serializes watch material family as a facet OR without changing index settings', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [{ hits: [] }] }), { status: 200 }),
      );
    await createAlgoliaEvidenceSearch({ appId: 'app', searchOnlyApiKey: 'key', fetch })({
      source: 'prod_catalog',
      query: 'blue dial watch',
      count: 5,
      filters: [
        { field: 'Catalog_WatchPrimaryDialPrimaryColor', operator: 'eq', value: 'Blue' },
        {
          field: 'Catalog_BandMaterialInformation.WatchBandMaterialName',
          operator: 'in',
          value: ['Stainless Steel', 'Titanium'],
        },
      ],
      signal: new AbortController().signal,
    });
    const params = new URLSearchParams(JSON.parse(fetch.mock.calls[0][1].body).requests[0].params);
    expect(JSON.parse(params.get('facetFilters')!)).toEqual([
      'Catalog_WatchPrimaryDialPrimaryColor:Blue',
      [
        'Catalog_BandMaterialInformation.WatchBandMaterialName:Stainless Steel',
        'Catalog_BandMaterialInformation.WatchBandMaterialName:Titanium',
      ],
    ]);
  });
  it('keeps occasion and recipient context out of broad product filters', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'occasion',
            scope: { kind: 'mission', key: null },
            value: { kind: 'text', text: 'tenth anniversary' },
          },
          {
            field: 'recipient',
            scope: { kind: 'mission', key: null },
            value: { kind: 'text', text: 'partner' },
          },
          {
            field: 'budget',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'money',
              cents: 50000,
              currency: 'USD',
              operator: 'lte',
              basis: 'per-item',
            },
          },
        ]),
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('zero_hits');
    expect(search.mock.calls[0][0].filters).toEqual([
      { field: 'Pricing_ActivePrice', operator: 'lte', value: 500 },
    ]);
  });
  it('keeps subjective design context out of broad product filters', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'design',
            scope: { kind: 'mission', key: null },
            value: { kind: 'text', text: 'subtle, not showy' },
          },
          {
            field: 'budget',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'money',
              cents: 50000,
              currency: 'USD',
              operator: 'lte',
              basis: 'per-item',
            },
          },
        ]),
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('zero_hits');
    expect(result.unresolved).toEqual([]);
    expect(search.mock.calls[0][0].filters).toEqual([
      { field: 'Pricing_ActivePrice', operator: 'lte', value: 500 },
    ]);
  });
  it('keeps the explicit single-selection scope fact out of product filters', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'selection',
            scope: { kind: 'mission', key: null },
            value: { kind: 'text', text: 'the shopper wants to see only strand necklaces' },
            strength: 'requirement',
            certainty: 'explicit',
          },
          {
            field: 'budget',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'money',
              cents: 50000,
              currency: 'USD',
              operator: 'lte',
              basis: 'per-item',
            },
          },
        ]),
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('zero_hits');
    expect(result.unresolved).toEqual([]);
    expect(search.mock.calls[0][0].filters).toEqual([
      { field: 'Pricing_ActivePrice', operator: 'lte', value: 500 },
    ]);
  });
  it('accepts canonical targeted types, rejects aliases, and gates broad OR types', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'product_type',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Necklace', 'Earrings'],
              operator: 'any',
            },
          },
          {
            field: 'product_type',
            scope: { kind: 'item', key: 'necklace' },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Necklace'],
              operator: 'any',
            },
          },
        ]),
    });
    expect(
      (
        await retrieve(
          productInput({ target: { kind: 'item', itemKey: 'necklace', productType: 'Necklace' } }),
        )
      ).status,
    ).toBe('zero_hits');
    expect(search.mock.calls.at(-1)?.[0].filters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Necklace' },
    ]);
    // Lowercase alias no longer fails at the wire schema (frozen enum removed);
    // the compile gate still rejects it: the alias is neither an accepted item
    // scope nor a mission product type, so retrieval fails closed regardless.
    expect(
      (
        await retrieve({
          ...productInput(),
          target: { kind: 'item', itemKey: 'necklace', productType: 'necklace' },
        })
      ).status,
    ).toBe('unsupported_constraint');
    expect((await retrieve(productInput({ target: null }))).status).toBe('unsupported_constraint');
  });
  it('applies one accepted mission product type in a broad product search', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'product_type',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Necklace'],
              operator: 'any',
            },
          },
        ]),
    });
    expect((await retrieve(productInput({ target: null }))).status).toBe('zero_hits');
    expect(search.mock.calls[0][0].filters).toContainEqual({
      field: 'Catalog_ProductType',
      operator: 'eq',
      value: 'Necklace',
    });
  });
  it('binds distinct item identities and keeps scoped filters isolated', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'product_type',
            scope: { kind: 'item', key: 'gift-necklace' },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Necklace'],
              operator: 'any',
            },
          },
          {
            field: 'gemstone',
            scope: { kind: 'item', key: 'gift-necklace' },
            value: {
              kind: 'facet',
              attribute: 'Catalog_GemstoneInformation.GemstoneColorGroup',
              values: ['Blue'],
              operator: 'any',
            },
          },
          {
            field: 'product_type',
            scope: { kind: 'item', key: 'companion-earrings' },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Earrings'],
              operator: 'any',
            },
          },
          {
            field: 'exclusion',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Ring'],
              operator: 'none',
            },
          },
          {
            field: 'exclusion',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_Motif',
              values: ['Heart'],
              operator: 'none',
            },
          },
        ]),
    });
    expect(
      (
        await retrieve(
          productInput({
            target: { kind: 'item', itemKey: 'gift-necklace', productType: 'Necklace' },
          }),
        )
      ).status,
    ).toBe('zero_hits');
    expect(search.mock.calls[0][0].filters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Necklace' },
      { field: 'Catalog_GemstoneInformation.GemstoneColorGroup', operator: 'eq', value: 'Blue' },
      { field: 'Catalog_ProductType', operator: 'neq', value: 'Ring' },
      { field: 'Catalog_Motif', operator: 'neq', value: 'Heart' },
    ]);
    expect(
      (
        await retrieve(
          productInput({ target: { kind: 'item', itemKey: 'wrong-key', productType: 'Necklace' } }),
        )
      ).error?.code,
    ).toBe('TARGET_MISMATCH');
    expect(
      (
        await retrieve(
          productInput({
            target: { kind: 'item', itemKey: 'gift-necklace', productType: 'Earrings' },
          }),
        )
      ).error?.code,
    ).toBe('TARGET_MISMATCH');
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('serializes numeric bounds with Algolia symbols and rejects neq', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [{ hits: [] }] }), { status: 200 }),
      );
    const adapter = createAlgoliaEvidenceSearch({ appId: 'app', searchOnlyApiKey: 'key', fetch });
    await adapter({
      source: 'prod_catalog',
      query: '',
      count: 1,
      filters: [
        { field: 'Pricing_ActivePrice', operator: 'lt', value: 10 },
        { field: 'Pricing_ActivePrice', operator: 'lte', value: 20 },
        { field: 'Pricing_ActivePrice', operator: 'gt', value: 30 },
        { field: 'Pricing_ActivePrice', operator: 'gte', value: 40 },
        { field: 'Pricing_ActivePrice', operator: 'eq', value: 50 },
      ],
      signal: new AbortController().signal,
    });
    const params = new URLSearchParams(JSON.parse(fetch.mock.calls[0][1].body).requests[0].params);
    expect(JSON.parse(params.get('numericFilters')!)).toEqual([
      'Pricing_ActivePrice<10',
      'Pricing_ActivePrice<=20',
      'Pricing_ActivePrice>30',
      'Pricing_ActivePrice>=40',
      'Pricing_ActivePrice=50',
    ]);
    expect(params.get('numericFilters')).not.toContain('lt');
    await expect(
      adapter({
        source: 'prod_catalog',
        query: '',
        count: 1,
        filters: [{ field: 'Pricing_ActivePrice', operator: 'neq', value: 10 }],
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/Unsupported numeric operator/);
  });
  it('reports sanitized upstream HTTP status without query or credential leakage', async () => {
    for (const status of [400, 429]) {
      const fetch = vi.fn().mockResolvedValue(new Response('secret-query-and-key', { status }));
      const retrieve = createEvidenceRetriever({
        search: createAlgoliaEvidenceSearch({ appId: 'app', searchOnlyApiKey: 'key', fetch }),
        currentState: async () => state([ring]),
      });
      const result = await retrieve(productInput({ query: 'private shopper query' }));
      expect(result.status).toBe('upstream_failure');
      expect(result.error).toMatchObject({
        code: `UPSTREAM_HTTP_${status}`,
        upstreamStatus: status,
      });
      expect(JSON.stringify(result)).not.toContain('private shopper query');
      expect(JSON.stringify(result)).not.toContain('key');
      expect(JSON.stringify(result)).not.toContain('secret-query');
    }
  });
  it('retrieves exact product IDs in requested order and keeps accepted constraints', async () => {
    const search = vi.fn().mockResolvedValue([
      { objectID: 'DOQ140', Catalog_ProductType: 'Ring', Pricing_ActivePrice: 120 },
      { objectID: 'RST2197', Catalog_ProductType: 'Ring', Pricing_ActivePrice: 130 },
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([ring]),
    });
    const result = await retrieve(
      productInput({ query: '', exactObjectIDs: ['DOQ140', 'RST2197'] }),
    );
    expect(result.status).toBe('ok');
    expect(result.records.map((record) => record.objectID)).toEqual(['DOQ140', 'RST2197']);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        exactObjectIDs: ['DOQ140', 'RST2197'],
        count: 2,
        filters: [{ field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' }],
      }),
    );
  });
  it('treats an accepted product reference as selection state, not a search constraint', async () => {
    const search = vi
      .fn()
      .mockResolvedValue([
        { objectID: 'DOQ140', Catalog_ProductType: 'Necklace', Pricing_ActivePrice: 179.99 },
      ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'product_type',
            scope: { kind: 'item', key: 'DOQ140' },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Necklace'],
              operator: 'any',
            },
          },
          {
            field: 'item_reference',
            scope: { kind: 'item', key: 'DOQ140' },
            value: {
              kind: 'product_ref',
              objectID: 'DOQ140',
              sourceIndex: 'prod_catalog',
              relationship: 'accepted',
            },
          },
        ]),
    });
    const result = await retrieve(
      productInput({
        target: { kind: 'item', itemKey: 'DOQ140', productType: 'Necklace' },
        exactObjectIDs: ['DOQ140'],
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.records.map((record) => record.objectID)).toEqual(['DOQ140']);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: [{ field: 'Catalog_ProductType', operator: 'eq', value: 'Necklace' }],
      }),
    );
  });
  it('rejects a wrong returned ID and reports missing exact IDs as zero hits', async () => {
    const retrieve = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([{ objectID: 'other', Catalog_ProductType: 'Ring' }]),
      currentState: async () => state([ring]),
    });
    const wrong = await retrieve(productInput({ exactObjectIDs: ['RST2197'] }));
    expect(wrong.status).toBe('zero_hits');
    expect(wrong.records).toEqual([]);
    const missing = await createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([]),
      currentState: async () => state([ring]),
    })(productInput({ exactObjectIDs: ['DOQ140'] }));
    expect(missing.status).toBe('zero_hits');
  });
  it('rejects malformed exact IDs, blog exact IDs, and more than three IDs', async () => {
    const retrieve = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([]),
      currentState: async () => state([ring]),
    });
    expect((await retrieve(productInput({ exactObjectIDs: ['../DOQ140'] }))).status).toBe(
      'invalid_input',
    );
    expect((await retrieve(productInput({ exactObjectIDs: ['bad id'] }))).status).toBe(
      'invalid_input',
    );
    expect((await retrieve(productInput({ exactObjectIDs: ['A', 'B', 'C', 'D'] }))).status).toBe(
      'invalid_input',
    );
    expect(
      (
        await retrieve({
          source: 'blog',
          query: '',
          count: 1,
          exactObjectIDs: ['DOQ140'],
          missionId: 'mission-1',
          expectedRevision: 2,
          turnId: 'turn-1',
          target: null,
        })
      ).status,
    ).toBe('invalid_input');
  });
  it('uses read-only GET exact lookup with source isolation and never mutation methods', async () => {
    const fetch = vi.fn().mockImplementation(async (url: string, _init: RequestInit) => {
      expect(url).toContain('/1/indexes/prod_catalog/DOQ140');
      return new Response(JSON.stringify({ objectID: 'DOQ140', Catalog_ProductType: 'Ring' }), {
        status: 200,
      });
    });
    const adapter = createAlgoliaEvidenceSearch({ appId: 'app', searchOnlyApiKey: 'key', fetch });
    const records = await adapter({
      source: 'prod_catalog',
      query: '',
      count: 1,
      exactObjectIDs: ['DOQ140'],
      filters: [],
      signal: new AbortController().signal,
    });
    expect(records).toEqual([{ objectID: 'DOQ140', Catalog_ProductType: 'Ring' }]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/1/indexes/prod_catalog/DOQ140'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetch.mock.calls[0][1].method).not.toBe('POST');
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
  });
  it('compiles accepted strict USD price and product type into effective filters', async () => {
    const search = vi
      .fn()
      .mockResolvedValue([{ objectID: 'p1', Pricing_ActivePrice: 99.99, secret: 'omit' }]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          ring,
          {
            field: 'budget',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'money',
              cents: 10000,
              currency: 'USD',
              operator: 'lt',
              basis: 'per-item',
            },
          },
        ]),
    });
    const response = await retrieve(productInput());
    expect(response.status).toBe('ok');
    expect(response.effectiveFilters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' },
      { field: 'Pricing_ActivePrice', operator: 'lt', value: 100 },
    ]);
    expect(response.records[0].record).not.toHaveProperty('secret');
  });
  it('keeps product and blog records separate when objectIDs collide', async () => {
    const retrieve = createEvidenceRetriever({
      search: async ({ source }) =>
        source === 'blog'
          ? [
              {
                objectID: 'same',
                article_id: 'article-1',
                title: 'T',
                heading_path: 'H',
                content: 'Useful passage',
                canonical_url: 'https://example.com/a',
                source_role: 'education',
                content_hash: 'hash',
              },
            ]
          : [{ objectID: 'same', title: source }],
      currentState: async () => state([ring]),
    });
    const product = await retrieve(productInput());
    const blog = await retrieve({
      source: 'blog',
      target: null,
      query: '',
      count: 3,
      missionId: 'mission-1',
      expectedRevision: 2,
      turnId: 'turn-1',
    });
    expect(product.records[0].evidenceRef).not.toBe(blog.records[0].evidenceRef);
    expect(product.records[0].source).toBe('prod_catalog');
    expect(blog.records[0].source).toBe('blog');
  });
  it('keeps blog chunks with the same article separate and rejects incomplete passages', async () => {
    const chunks = [
      {
        objectID: 'chunk-1',
        article_id: 'article-1',
        title: 'T',
        heading_path: 'H1',
        content: 'Passage one',
        canonical_url: 'https://example.com/a',
        source_role: 'education',
        content_hash: 'h1',
      },
      {
        objectID: 'chunk-2',
        article_id: 'article-1',
        title: 'T',
        heading_path: 'H2',
        content: 'Passage two',
        canonical_url: 'https://example.com/a',
        source_role: 'education',
        content_hash: 'h2',
      },
    ];
    const retrieve = createEvidenceRetriever({
      search: async () => chunks,
      currentState: async () => state([ring]),
    });
    const response = await retrieve({
      source: 'blog',
      target: null,
      query: '',
      count: 3,
      missionId: 'mission-1',
      expectedRevision: 2,
      turnId: 'turn-1',
    });
    expect(response.status).toBe('ok');
    expect(response.records.map((record) => record.objectID)).toEqual(['chunk-1', 'chunk-2']);
    expect(new Set(response.records.map((record) => record.record.article_id)).size).toBe(1);
    const incomplete = createEvidenceRetriever({
      search: async () => [
        { objectID: 'bad', article_id: 'article-1', content: 'missing canonical fields' },
      ],
      currentState: async () => state([ring]),
    });
    expect(
      (
        await incomplete({
          source: 'blog',
          target: null,
          query: '',
          count: 1,
          missionId: 'mission-1',
          expectedRevision: 2,
          turnId: 'turn-1',
        })
      ).status,
    ).toBe('incomplete_evidence');
  });
  it('searches the compiled target type and discloses unresolved material and around constraints', async () => {
    const search = vi
      .fn()
      .mockResolvedValue([
        { objectID: 'r1', Catalog_ProductType: 'Ring', Pricing_ActivePrice: 99 },
      ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          ring,
          {
            field: 'material',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_Material',
              values: ['White Gold'],
              operator: 'any',
            },
          },
          {
            field: 'budget',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'money',
              cents: 10000,
              currency: 'USD',
              operator: 'around',
              basis: 'per-item',
            },
          },
        ]),
    });
    const response = await retrieve(productInput());
    // Classify, not veto: the target filter compiles, so the search proceeds
    // and the two un-compilable facts ride out as structured disclosures.
    expect(response.status).toBe('ok');
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0].filters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' },
    ]);
    expect(response.unresolved).toEqual([
      {
        field: 'material',
        reason:
          'Material/component correlation is not safely established by independent top-level facets',
      },
      {
        field: 'budget',
        reason: 'Only exact USD numeric bounds are supported',
      },
    ]);
    expect(response.effectiveFilters.some((filter) => filter.field === 'Catalog_Material')).toBe(
      false,
    );
  });
  it('distinguishes stale revision before and after search', async () => {
    expect(
      (
        await createEvidenceRetriever({
          search: vi.fn(),
          currentState: async () => state([ring], 3),
        })(productInput())
      ).status,
    ).toBe('stale_revision');
    let calls = 0;
    const response = await createEvidenceRetriever({
      search: async () => [{ objectID: 'p' }],
      currentState: async () => state([ring], ++calls === 1 ? 2 : 3),
    })(productInput());
    expect(response.status).toBe('stale_revision');
  });
  it('distinguishes zero hits, upstream failure, and timeout', async () => {
    const base = { currentState: async () => state([ring]) };
    expect(
      (await createEvidenceRetriever({ ...base, search: async () => [] })(productInput())).status,
    ).toBe('zero_hits');
    expect(
      (
        await createEvidenceRetriever({
          ...base,
          search: async () => {
            throw new Error('failed');
          },
        })(productInput())
      ).status,
    ).toBe('upstream_failure');
    expect(
      (
        await createEvidenceRetriever({
          ...base,
          timeoutMs: 1,
          search: async ({ signal }) => {
            await new Promise((_, reject) =>
              signal.addEventListener('abort', () => reject(new Error('abort'))),
            );
            return [];
          },
        })(productInput())
      ).status,
    ).toBe('timeout');
  });
  it('uses stable hashes and source aware refs', () => {
    expect(hashEvidenceRecord({ b: 2, a: 1 })).toBe(hashEvidenceRecord({ a: 1, b: 2 }));
    expect(evidenceRef('blog', 'same', 'abc')).toBe('blog/same/abc');
  });
  it('defers unrelated item facts and emits Algolia field negation syntax', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          { ...ring, scope: { kind: 'item', key: 'Ring' } },
          {
            field: 'product_type',
            scope: { kind: 'item', key: 'Earrings' },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Earrings'],
              operator: 'any',
            },
          },
        ]),
    });
    await retrieve(productInput());
    expect(search.mock.calls[0][0].filters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' },
    ]);
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ results: [{ hits: [] }] }), { status: 200 }),
      );
    await createAlgoliaEvidenceSearch({ appId: 'app', searchOnlyApiKey: 'key', fetch })({
      source: 'prod_catalog',
      query: '',
      count: 1,
      filters: [{ field: 'Catalog_ProductType', operator: 'neq', value: 'Earrings' }],
      signal: new AbortController().signal,
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(new URLSearchParams(body.requests[0].params).get('facetFilters')).toBe(
      '["Catalog_ProductType:-Earrings"]',
    );
  });
  it('propagates a parent abort separately from a timeout', async () => {
    const parent = new AbortController();
    const retrieve = createEvidenceRetriever({
      currentState: async () => state([ring]),
      signal: parent.signal,
      search: async ({ signal }) => {
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(new Error('abort'))),
        );
        return [];
      },
    });
    const pending = retrieve(productInput());
    parent.abort();
    expect((await pending).status).toBe('aborted');
  });
  it('verifies material facets on one material object and preserves exclusions', async () => {
    const materialFacts = [
      {
        field: 'material',
        scope: { kind: 'mission', key: null },
        value: {
          kind: 'facet',
          attribute: 'Catalog_MaterialInformation.MaterialType',
          values: ['Gold'],
          operator: 'any',
        },
      },
      {
        field: 'material',
        scope: { kind: 'mission', key: null },
        value: {
          kind: 'facet',
          attribute: 'Catalog_MaterialInformation.MaterialColor',
          values: ['White'],
          operator: 'any',
        },
      },
    ];
    const records = [
      { objectID: 'unknown', Catalog_MaterialInformation: [{ MaterialType: 'Gold' }] },
      {
        objectID: 'false',
        Catalog_MaterialInformation: [{ MaterialType: 'Gold' }, { MaterialColor: 'White' }],
      },
      {
        objectID: 'true',
        Catalog_MaterialInformation: [{ MaterialType: 'Gold', MaterialColor: 'White' }],
      },
    ];
    const retrieve = createEvidenceRetriever({
      search: async () => records,
      currentState: async () => state([ring, ...materialFacts]),
    });
    const response = await retrieve(productInput());
    expect(response.status).toBe('ok');
    expect(response.records.map((record) => record.objectID)).toEqual(['true']);
    const search = vi.fn().mockResolvedValue([]);
    await createEvidenceRetriever({
      search,
      currentState: async () => state([ring, ...materialFacts]),
    })(productInput({ count: 1 }));
    expect(search.mock.calls[0][0].count).toBe(3);
    const exclusion = createEvidenceRetriever({
      search: async () => [
        { objectID: 'unknown', Catalog_MaterialInformation: [{ MaterialType: 'Gold' }] },
      ],
      currentState: async () =>
        state([
          ring,
          { ...materialFacts[1], value: { ...materialFacts[1].value, operator: 'none' } },
        ]),
    });
    expect((await exclusion(productInput())).status).toBe('incomplete_evidence');
    const missing = createEvidenceRetriever({
      search: async () => [{ objectID: 'missing' }],
      currentState: async () => state([ring, ...materialFacts]),
    });
    expect((await missing(productInput())).status).toBe('incomplete_evidence');
  });
  it('never compiles an exclusion-field material fact with a non-none operator as an inclusion', async () => {
    // Independent review finding (d): the writer rejects exclusion+any, but the
    // compiler must reject it independently instead of compiling exclude:false.
    // Classify, not veto: the rejection is a structured unresolved entry and
    // the search proceeds on the compiled target filter without the exclusion.
    const badFact = {
      field: 'exclusion',
      scope: { kind: 'mission', key: null },
      value: {
        kind: 'facet',
        attribute: 'Catalog_MaterialInformation.MaterialColor',
        values: ['Yellow'],
        operator: 'any',
      },
    };
    const retrieve = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([]),
      currentState: async () => state([ring, badFact]),
    });
    const response = await retrieve(productInput());
    expect(response.status).toBe('zero_hits');
    expect(
      (response as { unresolved?: Array<{ reason: string }> }).unresolved?.some((entry) =>
        entry.reason.includes('Exclusion facts on material attributes require operator none'),
      ),
    ).toBe(true);
    // The safety property: the exclusion never compiles as an inclusion (or
    // any filter) on the material attribute.
    expect(
      response.effectiveFilters.some(
        (filter) => filter.field === 'Catalog_MaterialInformation.MaterialColor',
      ),
    ).toBe(false);
  });
  it('compiles an exclusion-field material colour exclusion and excludes matching records', async () => {
    const exclusionFact = {
      field: 'exclusion',
      scope: { kind: 'mission', key: null },
      value: {
        kind: 'facet',
        attribute: 'Catalog_MaterialInformation.MaterialColor',
        values: ['Yellow'],
        operator: 'none',
      },
    };
    const retrieve = createEvidenceRetriever({
      search: async () => [
        {
          objectID: 'two-tone',
          Catalog_MaterialInformation: [
            { MaterialType: 'Silver', MaterialColor: 'White', MaterialPurity: 'Sterling' },
            { MaterialType: 'Gold', MaterialColor: 'Yellow', MaterialPurity: '14K' },
          ],
        },
        {
          objectID: 'clean',
          Catalog_MaterialInformation: [
            { MaterialType: 'Gold', MaterialColor: 'White', MaterialPurity: '14K' },
          ],
        },
        {
          objectID: 'no-material',
          Catalog_ProductType: 'Necklace',
        },
      ],
      currentState: async () => state([ring, exclusionFact]),
    });
    const response = await retrieve(productInput());
    expect(response.status).toBe('ok');
    expect(response.records.map((record) => record.objectID)).toEqual(['clean']);
    const noColour = createEvidenceRetriever({
      search: async () => [
        { objectID: 'missing-colour', Catalog_MaterialInformation: [{ MaterialType: 'Gold' }] },
      ],
      currentState: async () => state([ring, exclusionFact]),
    });
    expect((await noColour(productInput())).status).toBe('incomplete_evidence');
  });
  it('verifies typed material alternatives as complete same-object branches', async () => {
    const alternatives = {
      field: 'material',
      scope: { kind: 'mission', key: null },
      value: {
        kind: 'material_alternatives',
        alternatives: [
          { type: 'Silver', color: null, purity: 'Sterling', plating: null },
          {
            type: 'Gold',
            color: 'White',
            purity: null,
            plating: { presence: 'forbidden', purity: null },
          },
        ],
      },
    };
    const retrieve = createEvidenceRetriever({
      search: async () => [
        {
          objectID: 'silver',
          Catalog_MaterialInformation: [{ MaterialType: 'Silver', MaterialPurity: 'Sterling' }],
        },
        {
          objectID: 'gold',
          Catalog_MaterialInformation: [
            { MaterialType: 'Gold', MaterialColor: 'White', MaterialPlatingPurity: null },
          ],
        },
        {
          objectID: 'false',
          Catalog_MaterialInformation: [{ MaterialType: 'Gold' }, { MaterialColor: 'White' }],
        },
      ],
      currentState: async () => state([ring, alternatives]),
    });
    const response = await retrieve(productInput());
    expect(response.records.map((record) => record.objectID)).toEqual(['silver']);
    expect(response.unresolved).toHaveLength(2);
  });
  it.each(['10K', '14K', '18K', '24K'] as const)(
    'matches explicit %s white gold only when type, color and purity share one material entry',
    async (purity) => {
      const necklace = {
        field: 'product_type',
        scope: { kind: 'mission', key: null },
        value: {
          kind: 'facet',
          attribute: 'Catalog_ProductType',
          values: ['Necklace'],
          operator: 'any',
        },
      };
      const material = {
        field: 'material',
        scope: { kind: 'mission', key: null },
        value: {
          kind: 'material_alternatives',
          alternatives: [{ type: 'Gold', color: 'White', purity, plating: null }],
        },
      };
      const search = vi.fn().mockResolvedValue([
        {
          objectID: 'exact',
          Catalog_ProductType: 'Necklace',
          Catalog_MaterialInformation: [
            { MaterialType: 'Gold', MaterialColor: 'White', MaterialPurity: purity },
          ],
        },
        {
          objectID: 'mixed-components',
          Catalog_ProductType: 'Necklace',
          Catalog_MaterialInformation: [
            { MaterialType: 'Gold', MaterialColor: 'Yellow', MaterialPurity: purity },
            {
              MaterialType: 'Gold',
              MaterialColor: 'White',
              MaterialPurity: purity === '18K' ? '14K' : '18K',
            },
          ],
        },
      ]);
      const materialState = state([necklace, material]);
      const retrieve = createEvidenceRetriever({
        search,
        currentState: async () => materialState,
      });
      const response = await retrieve(productInput({ target: null }));
      expect(response.status, JSON.stringify(response.error)).toBe('ok');
      expect(response.records.map((record) => record.objectID)).toEqual(['exact']);
      expect(search).toHaveBeenCalledOnce();

      const untypedSearch = vi.fn().mockResolvedValue([]);
      const untyped = createEvidenceRetriever({
        search: untypedSearch,
        currentState: async () =>
          state([
            necklace,
            { ...material, value: { kind: 'text', text: `${purity.toLowerCase()} white gold` } },
          ]),
      });
      const rejected = await untyped(productInput({ target: null }));
      // Classify, not veto: the text material fact is disclosed as unresolved
      // while the compiled necklace type filter still carries the search.
      expect(rejected.status).toBe('zero_hits');
      expect(rejected.unresolved).toEqual([
        {
          field: 'material',
          reason:
            'Material/component correlation is not safely established by independent top-level facets',
        },
      ]);
      expect(untypedSearch).toHaveBeenCalledTimes(1);
      expect(untypedSearch.mock.calls[0][0].filters).toContainEqual({
        field: 'Catalog_ProductType',
        operator: 'eq',
        value: 'Necklace',
      });
    },
  );

  // Fit compiler red tests (STAGE3-FIT-COMPILER-REPAIR-PLAN-2026-10-07).
  // The contract: a measurement fit fact compiles as POST-search verification
  // against the returned record's Inventory_AvailableSkuSizeNames (numeric
  // equality with the converted inches), never as an Algolia filter. Fail
  // closed when the record lacks the field or does not contain the expected
  // size. Unmapped units and product types outside the configured mapping stay
  // unresolved before any search with an honest reason. These tests are red
  // until the measurement branch lands in compile(); nothing here weakens
  // exact identity, source binding or the read-only index boundary.
  const fitFact = (patch: Record<string, unknown> = {}) => ({
    field: 'fit',
    scope: { kind: 'item', key: 'VG320P' },
    value: {
      kind: 'measurement',
      value: 22,
      unit: 'in',
      component: 'chain length',
      ...patch,
    },
  });
  const vg320pTarget = { kind: 'item', itemKey: 'VG320P', productType: 'Necklace' };
  const itemProductType = (productType: string) => ({
    field: 'product_type',
    scope: { kind: 'item', key: 'VG320P' },
    value: {
      kind: 'facet',
      attribute: 'Catalog_ProductType',
      values: [productType],
      operator: 'any',
    },
  });
  const vg320pRecord = {
    objectID: 'VG320P',
    Catalog_ProductType: 'Necklace',
    Inventory_AvailableSkuSizeNames: ['22 Inch'],
  };

  it('compiles an item-scoped 22 in fit as post-search verification and passes the exact record', async () => {
    const search = vi.fn().mockResolvedValue([vg320pRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([itemProductType('Necklace'), fitFact()]),
    });
    const response = await retrieve(productInput({ target: vg320pTarget }));
    expect(response.status, JSON.stringify(response.error)).toBe('ok');
    expect(response.records.map((record) => record.objectID)).toEqual(['VG320P']);
    // Verification runs after the search, not as a pre-search rejection.
    expect(search).toHaveBeenCalledOnce();
  });

  it('fails closed when the record lacks the size field or carries a different size', async () => {
    const missing = createEvidenceRetriever({
      search: async () => [{ objectID: 'VG320P', Catalog_ProductType: 'Necklace' }],
      currentState: async () => state([itemProductType('Necklace'), fitFact()]),
    });
    const missingResponse = await missing(productInput({ target: vg320pTarget }));
    expect(missingResponse.status).toBe('incomplete_evidence');

    const wrongSize = createEvidenceRetriever({
      search: async () => [{ ...vg320pRecord, Inventory_AvailableSkuSizeNames: ['20 Inch'] }],
      currentState: async () => state([itemProductType('Necklace'), fitFact()]),
    });
    const wrongResponse = await wrongSize(productInput({ target: vg320pTarget }));
    expect(wrongResponse.status).toBe('incomplete_evidence');
    expect(
      (wrongResponse as { unresolved?: Array<{ reason: string }> }).unresolved?.some((entry) =>
        entry.reason.toLowerCase().includes('size'),
      ),
    ).toBe(true);
  });

  it('still rejects an item-scoped fit retry that drops the required target', async () => {
    const search = vi.fn().mockResolvedValue([vg320pRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([itemProductType('Necklace'), fitFact()]),
    });
    const response = await retrieve(productInput({ target: null }));
    expect(response.status).not.toBe('ok');
    expect(
      (response as { unresolved?: Array<{ reason: string }> }).unresolved?.some((entry) =>
        entry.reason.includes('Item-scoped hard requirement needs an explicit item target'),
      ),
    ).toBe(true);
    expect(search).not.toHaveBeenCalled();
  });

  it('discloses a non-necklace fit mapping as unresolved and still searches the target type', async () => {
    const search = vi.fn().mockResolvedValue([vg320pRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([itemProductType('Bracelet'), fitFact()]),
    });
    const response = await retrieve(
      productInput({ target: { kind: 'item', itemKey: 'VG320P', productType: 'Bracelet' } }),
    );
    // Bracelet target is accepted only because the brief carries an item-scoped
    // product_type fact for it; the fit mapping is still not configured for it.
    // Classify, not veto: the target filter compiles, so the search proceeds
    // and the unmapped fit rides out as an unresolved disclosure.
    expect(response.status).toBe('ok');
    expect(search).toHaveBeenCalledTimes(1);
    expect(
      (response as { unresolved?: Array<{ reason: string }> }).unresolved?.some((entry) =>
        entry.reason.toLowerCase().includes('bracelet'),
      ),
    ).toBe(true);
  });

  it('discloses ring and unknown fit units as unresolved and still searches the necklace target', async () => {
    for (const unit of ['ring_us', 'ring_uk', 'unknown'] as const) {
      const search = vi.fn().mockResolvedValue([vg320pRecord]);
      const retrieve = createEvidenceRetriever({
        search,
        currentState: async () => state([itemProductType('Necklace'), fitFact({ value: 7, unit })]),
      });
      const response = await retrieve(productInput({ target: vg320pTarget }));
      expect(response.status, `unit ${unit}`).toBe('ok');
      expect(
        (response as { unresolved?: Array<{ reason: string }> }).unresolved?.some((entry) =>
          entry.reason.toLowerCase().includes(unit === 'unknown' ? 'unknown' : unit),
        ),
        `unit ${unit} reason`,
      ).toBe(true);
      expect(search, `unit ${unit} searches the target type`).toHaveBeenCalledTimes(1);
    }
  });

  it('fails closed when multiple fit facts compile and any one expectation is unmet', async () => {
    // Multi-fit hole (round-3 review): compile() collects every fit fact, so
    // verification must require ALL of them, not just the first. Two fit
    // expectations on the same target where the record only satisfies one is a
    // verification failure, never a silent pass.
    const search = vi.fn().mockResolvedValue([vg320pRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([itemProductType('Necklace'), fitFact(), fitFact({ value: 20, unit: 'in' })]),
    });
    const response = await retrieve(productInput({ target: vg320pTarget }));
    expect(response.status).toBe('incomplete_evidence');
    expect(
      (response as { unresolved?: Array<{ reason: string }> }).unresolved?.some((entry) =>
        entry.reason.toLowerCase().includes('size'),
      ),
    ).toBe(true);
    expect(response.records).toHaveLength(0);
  });

  it('converts cm and mm to inches by the recorded 2.54 cm rule and verifies numerically', async () => {
    // 1 in = 2.54 cm exactly; 55.88 cm = 22 in. The expected size is verified
    // against the record's own vocabulary (numeric equality), never invented
    // as a filter.
    const cm = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([vg320pRecord]),
      currentState: async () =>
        state([itemProductType('Necklace'), fitFact({ value: 55.88, unit: 'cm' })]),
    });
    expect((await cm(productInput({ target: vg320pTarget }))).status).toBe('ok');

    const mm = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([vg320pRecord]),
      currentState: async () =>
        state([itemProductType('Necklace'), fitFact({ value: 558.8, unit: 'mm' })]),
    });
    expect((await mm(productInput({ target: vg320pTarget }))).status).toBe('ok');
  });

  // Water-resistance projection red test (Father's F2 finding, 2026-10-07):
  // the evidence projection omitted Catalog_WaterResistanceRating (and
  // Catalog_PreviouslyOwned, required by the Father's record-level oracle)
  // even though the exact catalogue records carry them. The projection must
  // pass those fields through when the record has them. Query-level
  // attributesToRetrieve only; no index setting is touched.
  it('projects water-resistance rating and previously-owned flags onto returned records', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        objectID: '1W9E1B',
        Catalog_ProductType: 'Wrist Watch',
        Catalog_WaterResistanceRating: '200 meters (20 ATM)',
        Catalog_PreviouslyOwned: false,
        Catalog_Condition: 'First Quality',
        Inventory_InStock: true,
        Pricing_ActivePrice: 161.09,
      },
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([ring]),
    });
    const response = await retrieve(productInput());
    expect(response.status).toBe('ok');
    // Product fields live under the evidence envelope's record wrapper.
    const record = (response.records[0] as { record: Record<string, unknown> }).record;
    expect(record.Catalog_WaterResistanceRating).toBe('200 meters (20 ATM)');
    expect(record.Catalog_PreviouslyOwned).toBe(false);
    // The projection must reach the outgoing query too: attributesToRetrieve is
    // a per-query parameter derived from the same constant, never an index
    // setting. Asserted through the Algolia adapter's injectable fetch, where
    // the exact-lookup GET carries the list; the injected search mock above
    // never sees it because the adapter applies it later.
    const capturedUrls: string[] = [];
    const adapter = createAlgoliaEvidenceSearch({
      appId: 'TESTAPPID',
      searchOnlyApiKey: 'search-only-key',
      fetch: (async (input: RequestInfo | URL) => {
        capturedUrls.push(String(input));
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    await adapter({
      source: 'prod_catalog',
      query: '',
      count: 1,
      exactObjectIDs: ['1W9E1B'],
      filters: [],
      signal: new AbortController().signal,
    });
    expect(capturedUrls.join(' ')).toContain('Catalog_WaterResistanceRating');
    expect(capturedUrls.join(' ')).toContain('Catalog_PreviouslyOwned');
  });
});

describe('retrieve_evidence with live catalog vocabulary', () => {
  const liveVocabulary = {
    values: {
      Catalog_ProductType: ['Bracelet', 'Earrings', 'Necklace', 'Ring'],
      'Catalog_GemstoneInformation.GemstoneColorGroup': ['Blue', 'White'],
      'Catalog_BandMaterialInformation.WatchBandMaterialName': ['Stainless Steel', 'Titanium'],
    } as Record<string, string[]>,
    builtAt: '2026-10-08T00:00:00.000Z',
    hasValue: (attribute: string, value: string) =>
      (liveVocabulary.values[attribute] ?? []).includes(value),
    availableValues: (attribute: string) => liveVocabulary.values[attribute] ?? [],
    isFilterable: (attribute: string) => attribute in liveVocabulary.values,
  };
  const vocabulary = {
    get: async () => liveVocabulary,
    invalidate: () => {},
  };
  const compileState = (facts: unknown[]) => state([ring, ...facts]);

  it('compiles a product type filter from the live vocabulary', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => compileState([]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('zero_hits');
    expect(result.effectiveFilters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' },
    ]);
  });

  it('returns requirement_unavailable with live alternatives when a value is absent', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'product_type',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Titanium Ring'],
              operator: 'any',
            },
          },
        ]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('requirement_unavailable');
    expect(search).not.toHaveBeenCalled();
    expect(result.unavailableRequirements).toEqual([
      {
        field: 'product_type',
        attribute: 'Catalog_ProductType',
        requested: ['Titanium Ring'],
        availableValues: ['Bracelet', 'Earrings', 'Necklace', 'Ring'],
      },
    ]);
    expect(result.unresolved).toEqual([]);
  });

  it('reports compiled filters alongside an unavailable requirement', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'product_type',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Titanium Ring'],
              operator: 'any',
            },
          },
          {
            field: 'gemstone',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_GemstoneInformation.GemstoneColorGroup',
              values: ['Blue'],
              operator: 'any',
            },
          },
        ]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.effectiveFilters).toEqual([
      { field: 'Catalog_GemstoneInformation.GemstoneColorGroup', operator: 'eq', value: 'Blue' },
    ]);
  });

  it('expands the watch band metal family from live vocabulary values', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          {
            field: 'product_type',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Wrist Watch'],
              operator: 'any',
            },
          },
          {
            field: 'watch_band_material',
            scope: { kind: 'mission', key: null },
            value: { kind: 'watch_band_family', family: 'metal' },
          },
        ]),
      vocabulary,
    });
    const result = await retrieve(
      productInput({
        target: { kind: 'item', itemKey: 'Wrist Watch', productType: 'Wrist Watch' },
      }),
    );
    expect(result.effectiveFilters).toContainEqual({
      field: 'Catalog_BandMaterialInformation.WatchBandMaterialName',
      operator: 'in',
      value: ['Stainless Steel', 'Titanium'],
    });
  });

  it('keeps legacy behavior when no vocabulary is supplied', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => compileState([]),
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('zero_hits');
    expect(result.effectiveFilters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' },
    ]);
  });
});

describe('ring size and platinum retrieval (live vocabulary era)', () => {
  const sizedVocabulary = {
    values: {
      Catalog_ProductType: ['Ring', 'Necklace', 'Earrings', 'Bracelet', 'Pendant', 'Wrist Watch'],
      'Catalog_MaterialInformation.MaterialType': ['Gold', 'Silver', 'Platinum'],
      'Catalog_MaterialInformation.MaterialPurity': ['Sterling', '14K', '18K', '950'],
      Inventory_AvailableSkuSizeNames: ['Size 6', 'Size 6.5', 'Size 7', 'Size 8', '16 Inch'],
    } as Record<string, string[]>,
    builtAt: '2026-10-08T00:00:00.000Z',
    hasValue: (attribute: string, value: string) =>
      (sizedVocabulary.values[attribute] ?? []).includes(value),
    availableValues: (attribute: string) => sizedVocabulary.values[attribute] ?? [],
    isFilterable: (attribute: string) => attribute in sizedVocabulary.values,
  };
  const vocabulary = { get: async () => sizedVocabulary, invalidate: () => {} };
  const ev = { messageId: 'm', quote: 'explicit', explicit: true, verified: true };
  const fact = (id: string, body: Record<string, unknown>) => ({
    id,
    status: 'active',
    revision: 2,
    createdAt: 'now',
    origin: 'spoken',
    certainty: 'explicit',
    strength: 'requirement',
    evidence: ev,
    ...body,
  });
  const ringMission = (extra: Record<string, unknown>[]) => {
    const parsed = briefStateV3Schema.safeParse({
      version: 3,
      missionId: 'mission-1',
      revision: 2,
      facts: [
        fact('type', {
          field: 'product_type',
          scope: { kind: 'mission', key: null },
          value: {
            kind: 'facet',
            attribute: 'Catalog_ProductType',
            values: ['Ring'],
            operator: 'any',
          },
        }),
        ...extra.map((body, index) => fact(`extra-${index}`, body)),
      ],
      processedTurns: [],
      tombstones: [],
      events: [],
    });
    if (!parsed.success) console.log('PARSE_FAIL', JSON.stringify(parsed.error.issues));
    if (parsed.success) return parsed.data;
    return briefStateV3Schema.parse({
      version: 3,
      missionId: 'mission-1',
      revision: 2,
      facts: [],
      processedTurns: [],
      tombstones: [],
      events: [],
    });
  };

  it('compiles a ring_us size fact and verifies it against record sizes', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        objectID: 'PCG074',
        Catalog_ProductType: 'Ring',
        Inventory_AvailableSkuSizeNames: ['Size 6', 'Size 7', 'Size 8', 'Size 9'],
      },
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        ringMission([
          {
            field: 'fit',
            scope: { kind: 'item', key: 'Ring' },
            value: { kind: 'measurement', value: 6, unit: 'ring_us', component: 'ring' },
          },
        ]),
      vocabulary,
    });
    const result = await retrieve(
      productInput({ target: { kind: 'item', itemKey: 'Ring', productType: 'Ring' } }),
    );
    expect(result.status).toBe('ok');
    expect(result.records[0]?.objectID).toBe('PCG074');
  });

  it('marks a ring without the required size as incomplete evidence, not a crash', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        objectID: 'PCG072',
        Catalog_ProductType: 'Ring',
        Inventory_AvailableSkuSizeNames: ['Size 7', 'Size 8'],
      },
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        ringMission([
          {
            field: 'fit',
            scope: { kind: 'item', key: 'Ring' },
            value: { kind: 'measurement', value: 6, unit: 'ring_us', component: 'ring' },
          },
        ]),
      vocabulary,
    });
    const result = await retrieve(
      productInput({ target: { kind: 'item', itemKey: 'Ring', productType: 'Ring' } }),
    );
    expect(result.status).toBe('incomplete_evidence');
    expect(result.unresolved.some((u) => u.field === 'fit')).toBe(true);
  });

  it('verifies a platinum material requirement against record material data', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        objectID: 'PCG074',
        Catalog_ProductType: 'Ring',
        Catalog_MaterialInformation: [
          { MaterialType: 'Platinum', MaterialPurity: '950', MaterialColor: 'White' },
        ],
      },
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        ringMission([
          {
            field: 'material',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'material_alternatives',
              alternatives: [{ type: 'Platinum', color: null, purity: null, plating: null }],
            },
          },
        ]),
      vocabulary,
    });
    const result = await retrieve(
      productInput({ target: { kind: 'item', itemKey: 'Ring', productType: 'Ring' } }),
    );
    expect(result.status).toBe('ok');
    expect(result.records[0]?.objectID).toBe('PCG074');
  });
});

describe('discovery style overview and batched style search', () => {
  const broadRing = {
    field: 'product_type',
    scope: { kind: 'mission', key: null },
    value: { kind: 'facet', attribute: 'Catalog_ProductType', values: ['Ring'], operator: 'any' },
  };
  const productHit = (patch: Record<string, unknown> = {}) => ({
    objectID: 'R1',
    Catalog_ProductType: 'Ring',
    Catalog_TitleDescription: 'Test Ring',
    Catalog_LongDescription: 'A ring for testing eligibility gates.',
    Catalog_Condition: 'First Quality',
    Inventory_InStock: true,
    Pricing_ActivePrice: 299.99,
    ...patch,
  });

  it('returns brief-filtered style facet counts as candidate columns without records', async () => {
    const search = vi.fn();
    const facetSearch = vi.fn().mockResolvedValue({
      Catalog_RingType: { Halo: 7, Solitaire: 4 },
      Catalog_ProductType: { Ring: 30 },
    });
    const retrieve = createEvidenceRetriever({
      search,
      facetSearch,
      currentState: async () => state([broadRing]),
    });
    const result = await retrieve(productInput({ target: null, styleOverview: true }));
    expect(result.status).toBe('ok');
    expect(search).not.toHaveBeenCalled();
    const columns = new Map(result.styleOverview!.map((column) => [column.attribute, column]));
    expect(columns.get('Catalog_ProductType')).toEqual({
      attribute: 'Catalog_ProductType',
      values: [{ value: 'Ring', count: 30 }],
    });
    expect(columns.get('Catalog_RingType')).toEqual({
      attribute: 'Catalog_RingType',
      values: [
        { value: 'Halo', count: 7 },
        { value: 'Solitaire', count: 4 },
      ],
    });
    expect(
      result.styleOverview!.every((column) =>
        CATALOGUE_GROUP_BASIS_ATTRIBUTES.includes(
          column.attribute as (typeof CATALOGUE_GROUP_BASIS_ATTRIBUTES)[number],
        ),
      ),
    ).toBe(true);
    expect(result.records).toEqual([]);
    const request = facetSearch.mock.calls[0][0];
    expect(request.filters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' },
    ]);
  });

  it('fails honestly when the facet search is unavailable', async () => {
    const retrieve = createEvidenceRetriever({
      search: vi.fn(),
      currentState: async () => state([broadRing]),
    });
    const result = await retrieve(productInput({ target: null, styleOverview: true }));
    expect(result.status).toBe('upstream_failure');
    expect(result.error?.code).toBe('FACET_SEARCH_UNAVAILABLE');
  });

  it('keeps styleOverview and styleBatches mutually exclusive', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([broadRing]),
    });
    const result = await retrieve(
      productInput({
        target: null,
        styleOverview: true,
        styleBatches: [{ attribute: 'Catalog_RingType', value: 'Halo' }],
      }),
    );
    expect(result.status).toBe('invalid_input');
    expect(search).not.toHaveBeenCalled();
  });

  it("passes the assistant's query to each batched style search; the stockroom is not overruled", async () => {
    const queries: string[] = [];
    const search = vi.fn(async ({ query }: { query: string }) => {
      queries.push(query);
      return [
        productHit({
          objectID: `R${queries.length}`,
          Catalog_TitleDescription: `Style Ring ${queries.length}`,
          Catalog_RingType: 'Halo',
        }),
      ];
    });
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([broadRing]),
    });
    const result = await retrieve(
      productInput({
        target: null,
        count: 2,
        query: 'yellow gold',
        styleBatches: [
          { attribute: 'Catalog_RingType', value: 'Halo' },
          { attribute: 'Catalog_RingType', value: 'Solitaire' },
        ],
      }),
    );
    expect(result.status).toBe('ok');
    expect(queries.filter((q) => q === 'yellow gold').length).toBe(2);
  });

  it("falls back to the broad query when the assistant's phrasing matches nothing", async () => {
    const queries: string[] = [];
    const search = vi.fn(async ({ query }: { query: string }) => {
      queries.push(query);
      // The conversational sentence matches nothing; the broad retry matches.
      return query === ''
        ? [
            productHit({
              objectID: `R${queries.length}`,
              Catalog_TitleDescription: `Style Ring ${queries.length}`,
              Catalog_RingType: 'Halo',
            }),
          ]
        : [];
    });
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([broadRing]),
    });
    const result = await retrieve(
      productInput({
        target: null,
        count: 2,
        query: 'minimal silver bracelets around $250 for a younger sister',
        styleBatches: [{ attribute: 'Catalog_RingType', value: 'Halo' }],
      }),
    );
    expect(result.status).toBe('ok');
    expect(queries[0]).toBe('minimal silver bracelets around $250 for a younger sister');
    expect(queries[1]).toBe('');
    expect(result.styleResults![0].backfillUsed).toBe(true);
  });

  it('searches each chosen style separately, filters eligibility, and reports per-style outcomes', async () => {
    const search = vi.fn(
      async ({ filters }: { filters: readonly { field: string; value?: unknown }[] }) => {
        const style = filters.find((f) => f.field === 'Catalog_RingType');
        if (style?.value === 'Halo')
          return [
            productHit({
              objectID: 'H0',
              Catalog_TitleDescription: 'Halo Ring Zero',
              Catalog_RingType: 'Halo',
              Inventory_InStock: false,
            }),
            productHit({
              objectID: 'H1',
              Catalog_TitleDescription: 'Halo Ring One',
              Catalog_RingType: 'Halo',
            }),
            productHit({
              objectID: 'H2',
              Catalog_TitleDescription: 'Halo Ring Two',
              Catalog_RingType: 'Halo',
            }),
          ];
        if (style?.value === 'Solitaire')
          return [
            productHit({
              objectID: 'S1',
              Catalog_TitleDescription: 'Solitaire Ring One',
              Catalog_RingType: 'Solitaire',
            }),
            productHit({
              objectID: 'S2',
              Catalog_TitleDescription: 'Solitaire Ring Two',
              Catalog_RingType: 'Solitaire',
              Catalog_Condition: 'Pre-Owned',
            }),
          ];
        return [
          productHit({
            objectID: 'P1',
            Catalog_TitleDescription: 'Eternity Ring One',
            Catalog_RingType: 'Eternity',
          }),
        ];
      },
    );
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([broadRing]),
    });
    const result = await retrieve(
      productInput({
        target: null,
        count: 2,
        styleBatches: [
          { attribute: 'Catalog_RingType', value: 'Halo' },
          { attribute: 'Catalog_RingType', value: 'Solitaire' },
          { attribute: 'Catalog_RingType', value: 'Eternity' },
        ],
      }),
    );
    expect(result.status).toBe('ok');
    const byValue = new Map(result.styleResults!.map((r) => [r.value, r]));
    expect(byValue.get('Halo')).toMatchObject({ eligibleCount: 2, backfillUsed: false });
    expect(byValue.get('Halo')!.rejected).toEqual([{ objectID: 'H0', reason: 'out_of_stock' }]);
    expect(byValue.get('Solitaire')).toMatchObject({ eligibleCount: 1 });
    expect(byValue.get('Solitaire')!.rejected).toEqual([
      { objectID: 'S2', reason: 'pre_owned_not_requested' },
      { objectID: 'S1', reason: 'duplicate_product' },
      { objectID: 'S2', reason: 'pre_owned_not_requested' },
    ]);
    expect(byValue.get('Solitaire')!.backfillUsed).toBe(true);
    expect(byValue.get('Eternity')).toMatchObject({ eligibleCount: 1 });
    expect(result.records.map((record) => record.objectID)).toEqual(['H1', 'H2', 'S1', 'P1']);
  });

  it('removes duplicate products and near-identical variants across style columns', async () => {
    const search = vi.fn(
      async ({ filters }: { filters: readonly { field: string; value?: unknown }[] }) => {
        const style = filters.find((f) => f.field === 'Catalog_RingType');
        if (style?.value === 'Halo')
          return [
            productHit({
              objectID: 'H1',
              Catalog_TitleDescription: 'Halo Ring One',
              Catalog_RingType: 'Halo',
            }),
            productHit({
              objectID: 'H1b',
              Catalog_TitleDescription: 'Halo Ring Two',
              Catalog_RingType: 'Halo',
            }),
          ];
        return [
          productHit({
            objectID: 'H1',
            Catalog_TitleDescription: 'Halo Ring One',
            Catalog_RingType: 'Pavé',
          }),
          productHit({
            objectID: 'H1c',
            Catalog_TitleDescription: 'Halo Ring One',
            Catalog_RingType: 'Pavé',
          }),
        ];
      },
    );
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([broadRing]),
    });
    const result = await retrieve(
      productInput({
        target: null,
        count: 2,
        styleBatches: [
          { attribute: 'Catalog_RingType', value: 'Halo' },
          { attribute: 'Catalog_RingType', value: 'Pavé' },
        ],
      }),
    );
    expect(result.status).toBe('ok');
    const byValue = new Map(result.styleResults!.map((r) => [r.value, r]));
    expect(byValue.get('Pavé')!.rejected).toEqual([
      { objectID: 'H1', reason: 'duplicate_product' },
      { objectID: 'H1c', reason: 'duplicate_variant' },
      { objectID: 'H1', reason: 'duplicate_product' },
      { objectID: 'H1c', reason: 'duplicate_variant' },
    ]);
    expect(byValue.get('Pavé')!.eligibleCount).toBe(0);
    expect(byValue.get('Pavé')!.backfillUsed).toBe(true);
    expect(result.records.map((record) => record.objectID)).toEqual(['H1', 'H1b']);
  });

  it('includes pre-owned records only when the brief states the condition preference', async () => {
    const conditionFact = {
      field: 'condition',
      strength: 'preference',
      scope: { kind: 'mission', key: null },
      value: { kind: 'text', text: 'Pre-Owned pieces are welcome' },
    };
    const search = vi.fn().mockResolvedValue([
      productHit({
        objectID: 'P1',
        Catalog_TitleDescription: 'Pre-Owned Ring One',
        Catalog_Condition: 'Pre-Owned',
      }),
      productHit({
        objectID: 'P2',
        Catalog_TitleDescription: 'Pre-Owned Ring Two',
        Catalog_Condition: 'Pre-Owned',
      }),
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([broadRing, conditionFact]),
    });
    const result = await retrieve(
      productInput({
        target: null,
        styleBatches: [{ attribute: 'Catalog_RingType', value: 'Halo' }],
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.styleResults![0]).toMatchObject({ eligibleCount: 2, backfillUsed: false });
  });
});

describe('ground-truth audit fixes (2026-10-13)', () => {
  const broadRing = {
    field: 'product_type',
    scope: { kind: 'mission', key: null },
    value: { kind: 'facet', attribute: 'Catalog_ProductType', values: ['Ring'], operator: 'any' },
  };
  const productHit = (patch: Record<string, unknown> = {}) => ({
    objectID: 'R1',
    Catalog_ProductType: 'Ring',
    Catalog_TitleDescription: 'Test Ring',
    Catalog_LongDescription: 'A ring for testing eligibility gates.',
    Catalog_Condition: 'First Quality',
    Inventory_InStock: true,
    Pricing_ActivePrice: 299.99,
    ...patch,
  });
  const auditVocabulary = {
    values: {
      Catalog_ProductType: ['Ring'],
      Catalog_RingType: ['Halo', 'Solitaire', 'Tennis'],
      'Catalog_GemstoneInformationPrimary.GemstoneName': ['Diamond', 'Moissanite'],
    } as Record<string, string[]>,
    builtAt: '2026-10-13T00:00:00.000Z',
    hasValue: (attribute: string, value: string) =>
      (auditVocabulary.values[attribute] ?? []).includes(value),
    availableValues: (attribute: string) => auditVocabulary.values[attribute] ?? [],
    isFilterable: (attribute: string) => attribute in auditVocabulary.values,
  };

  it('F5: compiles multi-value gemstone requirements as one live-vocabulary OR group', async () => {
    const search = vi
      .fn()
      .mockResolvedValue([
        productHit({ objectID: 'D1', Catalog_TitleDescription: 'Diamond Ring' }),
        productHit({ objectID: 'M1', Catalog_TitleDescription: 'Moissanite Ring' }),
      ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          broadRing,
          {
            field: 'gemstone',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_GemstoneInformationPrimary.GemstoneName',
              values: ['Diamond', 'Moissanite'],
              operator: 'any',
            },
          },
        ]),
      vocabulary: { get: async () => auditVocabulary, invalidate: () => {} },
    });
    const result = await retrieve(productInput({ target: null, count: 5 }));
    expect(result.status).toBe('ok');
    expect(result.effectiveFilters).toContainEqual({
      field: 'Catalog_GemstoneInformationPrimary.GemstoneName',
      operator: 'in',
      value: ['Diamond', 'Moissanite'],
    });
    expect(result.records.map((r) => r.objectID)).toEqual(['D1', 'M1']);
  });

  it('F5: reports gemstone values the live catalogue does not carry as unavailable, not a silent filter', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          broadRing,
          {
            field: 'gemstone',
            scope: { kind: 'mission', key: null },
            value: {
              kind: 'facet',
              attribute: 'Catalog_GemstoneInformationPrimary.GemstoneName',
              values: ['Diamond', 'Unobtainium'],
              operator: 'any',
            },
          },
        ]),
      vocabulary: { get: async () => auditVocabulary, invalidate: () => {} },
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('requirement_unavailable');
    expect(result.unavailableRequirements).toContainEqual(
      expect.objectContaining({
        field: 'gemstone',
        attribute: 'Catalog_GemstoneInformationPrimary.GemstoneName',
        requested: ['Unobtainium'],
      }),
    );
  });

  it('G2: rejects a styleBatches value outside the live vocabulary and teaches the valid options', async () => {
    const search = vi.fn();
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([broadRing]),
      vocabulary: { get: async () => auditVocabulary, invalidate: () => {} },
    });
    const result = await retrieve(
      productInput({
        target: null,
        styleBatches: [{ attribute: 'Catalog_RingType', value: 'Not-A-Style' }],
      }),
    );
    expect(search).not.toHaveBeenCalled();
    expect(result.unavailableRequirements).toContainEqual(
      expect.objectContaining({
        attribute: 'Catalog_RingType',
        requested: ['Not-A-Style'],
        availableValues: ['Halo', 'Solitaire', 'Tennis'],
      }),
    );
  });

  it('G2: still accepts styleBatches values the live vocabulary carries', async () => {
    const search = vi
      .fn()
      .mockResolvedValue([
        productHit({ objectID: 'H1', Catalog_TitleDescription: 'Halo Ring One' }),
        productHit({ objectID: 'H2', Catalog_TitleDescription: 'Halo Ring Two' }),
      ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([broadRing]),
      vocabulary: { get: async () => auditVocabulary, invalidate: () => {} },
    });
    const result = await retrieve(
      productInput({
        target: null,
        styleBatches: [{ attribute: 'Catalog_RingType', value: 'Halo' }],
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.styleResults![0]).toMatchObject({ value: 'Halo', eligibleCount: 2 });
  });

  it('cap: accepts candidate counts up to 24 and returns up to that many eligible items', async () => {
    const many = Array.from({ length: 24 }, (_, i) =>
      productHit({ objectID: `C${i}`, Catalog_TitleDescription: `Ring ${i}` }),
    );
    const search = vi.fn().mockResolvedValue(many);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([broadRing]),
      vocabulary: { get: async () => auditVocabulary, invalidate: () => {} },
    });
    const result = await retrieve(
      productInput({
        target: null,
        count: 24,
        styleBatches: [{ attribute: 'Catalog_RingType', value: 'Halo' }],
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.styleResults![0].eligibleCount).toBe(24);
  });
});

/* Craig-feedback Task 02 (men's product audience), red-first. The verified
 * failure: the men's-watch journey staged JRJ802A, PPR7845 and IRE616, all
 * Catalog_Gender Female / Catalog_TargetConsumer Women, because the accepted
 * brief cannot carry an audience requirement at all and the projection never
 * retrieved the audience attributes. The audience fields were verified live,
 * read-only, 2026-10-13 (.checkpoint/runs/mens-watch-2026-10-13/
 * gender-audience-catalog-readback.json): Catalog_Gender is a filterable facet
 * carrying exactly Female, Male, Unisex (wrist watches: Female 1192, Male
 * 1758, Unisex 81); Catalog_TargetConsumer is the record-level cross-check
 * field carrying Men, Women, Boys, Girls. Every Male wrist watch targets a
 * male audience (Men 1747 / Boys 11), every Female one targets Women only,
 * and every Unisex one targets both sides (e.g. 1ZPF6B: Men, Women). */
describe("men's product audience (Craig Task 02)", () => {
  const audienceVocabularyValues = {
    Catalog_ProductType: ['Ring', 'Necklace', 'Wrist Watch'],
    Catalog_Gender: ['Female', 'Male', 'Unisex'],
    Catalog_WatchStyle: ['Casual', 'Dress', 'Fashion', 'Sport'],
  } as Record<string, string[]>;
  const audienceVocabulary = {
    values: audienceVocabularyValues,
    builtAt: '2026-10-13T00:00:00.000Z',
    hasValue: (attribute: string, value: string) =>
      (audienceVocabularyValues[attribute] ?? []).includes(value),
    availableValues: (attribute: string) => audienceVocabularyValues[attribute] ?? [],
    isFilterable: (attribute: string) => attribute in audienceVocabularyValues,
  };
  const vocabulary = { get: async () => audienceVocabulary, invalidate: () => {} };
  const watchType = {
    field: 'product_type',
    scope: { kind: 'mission', key: null },
    value: {
      kind: 'facet',
      attribute: 'Catalog_ProductType',
      values: ['Wrist Watch'],
      operator: 'any',
    },
  };
  const audienceFact = (values: string[]) => ({
    field: 'product_audience',
    scope: { kind: 'mission', key: null },
    value: { kind: 'facet', attribute: 'Catalog_Gender', values, operator: 'any' },
  });
  // Craig's captured budget: basis 'total' exactly as the SSE recorded it.
  const budgetTotal = {
    field: 'budget',
    scope: { kind: 'mission', key: null },
    value: { kind: 'money', cents: 100000, currency: 'USD', operator: 'lte', basis: 'total' },
  };
  const watchRecord = (objectID: string, patch: Record<string, unknown> = {}) => ({
    objectID,
    Catalog_ProductType: 'Wrist Watch',
    Catalog_TitleDescription: `Watch ${objectID}`,
    Catalog_LongDescription: 'A wrist watch for the audience eligibility gate.',
    Catalog_Condition: 'First Quality',
    Inventory_InStock: true,
    Pricing_ActivePrice: 299.99,
    ...patch,
  });

  it("compiles the accepted men's audience into one exact Catalog_Gender OR-group", async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex']), budgetTotal]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.effectiveFilters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Wrist Watch' },
      { field: 'Catalog_Gender', operator: 'in', value: ['Male', 'Unisex'] },
      { field: 'Pricing_ActivePrice', operator: 'lte', value: 1000 },
    ]);
  });

  it('keeps a total-basis budget a per-record ceiling, never a look-total relaxation', async () => {
    // "men's watch under $1,000" is a single-item ceiling. The accepted basis
    // 'total' must not reinterpret the bound: each record's own price is still
    // filtered at 1000, so a 1,200-dollar watch can never ride a multi-item
    // look through the shortlist.
    const search = vi
      .fn()
      .mockResolvedValue([
        watchRecord('CHEAP1', { Pricing_ActivePrice: 99.99, Catalog_Gender: 'Male' }),
        watchRecord('TOOBIG', { Pricing_ActivePrice: 1200, Catalog_Gender: 'Male' }),
      ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex']), budgetTotal]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null, count: 5 }));
    expect(result.effectiveFilters).toContainEqual({
      field: 'Pricing_ActivePrice',
      operator: 'lte',
      value: 1000,
    });
    // The mock ignores filters, so the per-record ceiling below is what keeps
    // TOOBIG out of a budget filter test: it is enforced by the compiled
    // filter contract asserted above. CHEAP1 is eligible audience-wise.
    expect(result.effectiveFilters).toHaveLength(3);
  });

  it('discloses an audience value the live catalogue does not carry instead of matching', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Mens'])]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('requirement_unavailable');
    expect(result.unavailableRequirements?.[0]).toMatchObject({
      field: 'product_audience',
      attribute: 'Catalog_Gender',
      requested: ['Mens'],
    });
    expect(result.unavailableRequirements?.[0]?.availableValues).toContain('Male');
    expect(search).not.toHaveBeenCalled();
  });

  it('keeps no frozen gender list and fails closed when the audience fact cannot compile', async () => {
    // A watch-only search could return Female records while the men-only
    // audience fact is unresolved. Preserve the structured reason and stop.
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex'])]),
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('unsupported_constraint');
    expect(search).not.toHaveBeenCalled();
    expect(result.error?.code).toBe('AUDIENCE_CONSTRAINT_UNAVAILABLE');
    expect(result.unresolved).toEqual([
      {
        field: 'product_audience',
        reason: 'Audience scope needs the live catalogue vocabulary',
      },
    ]);
  });

  it('rejects a returned Female record by its exact record gender in a batched style search', async () => {
    // Defense in depth: even if a search mishap returned a Female record, the
    // per-record exclusion refuses it. This is Craig's exact failure shape:
    // the grid showed JRJ802A (Female, Women-only) for a men's request.
    const search = vi.fn().mockResolvedValue([
      watchRecord('JRJ802A', {
        Catalog_Gender: 'Female',
        Catalog_TargetConsumer: ['Women'],
        Catalog_WatchStyle: 'Dress',
        Pricing_ActivePrice: 149.99,
      }),
      watchRecord('1ZLZDA', {
        Catalog_Gender: 'Male',
        Catalog_TargetConsumer: ['Men'],
        Catalog_WatchStyle: 'Dress',
        Pricing_ActivePrice: 298.99,
      }),
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex'])]),
      vocabulary,
    });
    const result = await retrieve(
      productInput({
        target: null,
        count: 3,
        styleBatches: [{ attribute: 'Catalog_WatchStyle', value: 'Dress' }],
      }),
    );
    expect(result.status).toBe('ok');
    expect(result.records.map((r) => r.objectID)).toEqual(['1ZLZDA']);
    expect(result.styleResults![0].rejected).toContainEqual({
      objectID: 'JRJ802A',
      reason: 'audience_conflict',
    });
  });

  it('rejects a record without any gender instead of inventing a match', async () => {
    const search = vi
      .fn()
      .mockResolvedValue([
        watchRecord('NOGENDER', { Catalog_Gender: undefined }),
        watchRecord('1ZLZDA', { Catalog_Gender: 'Male', Catalog_TargetConsumer: ['Men'] }),
      ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex'])]),
      vocabulary,
    });
    const result = await retrieve(
      productInput({
        target: null,
        count: 3,
        styleBatches: [{ attribute: 'Catalog_WatchStyle', value: 'Dress' }],
      }),
    );
    expect(result.records.map((r) => r.objectID)).toEqual(['1ZLZDA']);
    expect(result.styleResults![0].rejected).toContainEqual({
      objectID: 'NOGENDER',
      reason: 'audience_unknown',
    });
  });

  it('rejects a male-gender record whose own targeting names no male audience', async () => {
    // Catalog_TargetConsumer cross-check: a record labelled Male that targets
    // only Women contradicts the accepted men's scope; the second field is the
    // defense against a mislabelled first one.
    const search = vi
      .fn()
      .mockResolvedValue([
        watchRecord('MISLABELED', { Catalog_Gender: 'Male', Catalog_TargetConsumer: ['Women'] }),
        watchRecord('1ZLZDA', { Catalog_Gender: 'Male', Catalog_TargetConsumer: ['Men'] }),
      ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex'])]),
      vocabulary,
    });
    const result = await retrieve(
      productInput({
        target: null,
        count: 3,
        styleBatches: [{ attribute: 'Catalog_WatchStyle', value: 'Dress' }],
      }),
    );
    expect(result.records.map((r) => r.objectID)).toEqual(['1ZLZDA']);
    expect(result.styleResults![0].rejected).toContainEqual({
      objectID: 'MISLABELED',
      reason: 'audience_conflict',
    });
  });

  it("accepts a unisex record marketed to both audiences for an explicit men's scope", async () => {
    // Verified live: 1ZPF6B is Catalog_Gender Unisex, Catalog_TargetConsumer
    // [Men, Women], first quality, in stock, 442.99. Unisex may satisfy an
    // explicit men's request; a Female/Women-only record may not.
    const search = vi.fn().mockResolvedValue([
      watchRecord('1ZPF6B', {
        Catalog_Gender: 'Unisex',
        Catalog_TargetConsumer: ['Men', 'Women'],
        Pricing_ActivePrice: 442.99,
      }),
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex'])]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null, count: 3 }));
    expect(result.status).toBe('ok');
    expect(result.records.map((r) => r.objectID)).toEqual(['1ZPF6B']);
  });

  it('applies the same exclusion in the plain search flow', async () => {
    const search = vi.fn().mockResolvedValue([
      watchRecord('IRE616', {
        Catalog_Gender: 'Female',
        Catalog_TargetConsumer: ['Women'],
        Pricing_ActivePrice: 37.5,
      }),
      watchRecord('1ZLZDA', { Catalog_Gender: 'Male', Catalog_TargetConsumer: ['Men'] }),
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex'])]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null, count: 3 }));
    expect(result.status).toBe('ok');
    expect(result.records.map((r) => r.objectID)).toEqual(['1ZLZDA']);
  });

  it('reports incomplete evidence when every returned record conflicts with the audience', async () => {
    const search = vi
      .fn()
      .mockResolvedValue([
        watchRecord('JRJ802A', { Catalog_Gender: 'Female', Catalog_TargetConsumer: ['Women'] }),
      ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex'])]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null, count: 3 }));
    expect(result.status).toBe('incomplete_evidence');
    expect(result.unresolved[0]?.reason).toContain('audience');
  });

  it('carries condition and stock rules beside the audience scope', async () => {
    // PPR7845 in Craig's grid was both Female AND Pre-Owned: two independent
    // exclusions. A male Pre-Owned piece is refused for condition when the
    // brief did not accept pre-owned; an out-of-stock piece for stock.
    const search = vi.fn().mockResolvedValue([
      watchRecord('PPR7845', {
        Catalog_Gender: 'Male',
        Catalog_TargetConsumer: ['Men'],
        Catalog_Condition: 'Pre-Owned',
      }),
      watchRecord('SOLDOUT', {
        Catalog_Gender: 'Male',
        Catalog_TargetConsumer: ['Men'],
        Inventory_InStock: false,
      }),
      watchRecord('1ZLZDA', { Catalog_Gender: 'Male', Catalog_TargetConsumer: ['Men'] }),
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex'])]),
      vocabulary,
    });
    const result = await retrieve(
      productInput({
        target: null,
        count: 5,
        styleBatches: [{ attribute: 'Catalog_WatchStyle', value: 'Dress' }],
      }),
    );
    expect(result.records.map((r) => r.objectID)).toEqual(['1ZLZDA']);
    const rejected = result.styleResults![0].rejected;
    expect(rejected).toContainEqual({ objectID: 'PPR7845', reason: 'pre_owned_not_requested' });
    expect(rejected).toContainEqual({ objectID: 'SOLDOUT', reason: 'out_of_stock' });
  });

  it('does not let a fresh mission inherit a previous men restriction', async () => {
    // Neutral watch request, no audience fact: no Catalog_Gender filter is
    // compiled and a Female record is eligible.
    const search = vi
      .fn()
      .mockResolvedValue([
        watchRecord('JRJ802A', { Catalog_Gender: 'Female', Catalog_TargetConsumer: ['Women'] }),
      ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType]),
      vocabulary,
    });
    const result = await retrieve(productInput({ target: null, count: 3 }));
    expect(result.status).toBe('ok');
    expect(result.records.map((r) => r.objectID)).toEqual(['JRJ802A']);
    expect(result.effectiveFilters.every((f) => f.field !== 'Catalog_Gender')).toBe(true);
  });

  it('projects Catalog_Gender and Catalog_TargetConsumer onto returned records', async () => {
    // The projection previously discarded both audience attributes, so no
    // downstream identity check or card display could ground them. Query-level
    // attributesToRetrieve only; no index setting is touched.
    const search = vi.fn().mockResolvedValue([
      watchRecord('1ZPF6B', {
        Catalog_Gender: 'Unisex',
        Catalog_TargetConsumer: ['Men', 'Women'],
        Pricing_ActivePrice: 442.99,
      }),
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([watchType, audienceFact(['Male', 'Unisex'])]),
      vocabulary,
    });
    const response = await retrieve(productInput({ target: null }));
    expect(response.status).toBe('ok');
    const record = (response.records[0] as { record: Record<string, unknown> }).record;
    expect(record.Catalog_Gender).toBe('Unisex');
    expect(record.Catalog_TargetConsumer).toEqual(['Men', 'Women']);
    // The projection must reach the outgoing query too.
    const capturedUrls: string[] = [];
    const adapter = createAlgoliaEvidenceSearch({
      appId: 'TESTAPPID',
      searchOnlyApiKey: 'search-only-key',
      fetch: (async (input: RequestInfo | URL) => {
        capturedUrls.push(String(input));
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    await adapter({
      source: 'prod_catalog',
      query: '',
      count: 1,
      exactObjectIDs: ['1ZPF6B'],
      filters: [],
      signal: new AbortController().signal,
    });
    expect(capturedUrls.join(' ')).toContain('Catalog_Gender');
    expect(capturedUrls.join(' ')).toContain('Catalog_TargetConsumer');
  });
});

/* Compiler classification (Arijit directive "Classify, not skip", 2026-10-14;
 * diagnosis .checkpoint/runs/sister-fix-retrieval-2026-10-14/DIAGNOSIS.md).
 * The failing class: one accepted fact the compiler can never turn into a safe
 * filter (a text wearability requirement, exactly as the P4 correction wrote
 * it) returned unsupported_constraint with zero records for every later
 * prod_catalog search. The contract: un-compilable facts ride out as the
 * structured unresolved array and the search proceeds on the compilable subset
 * whenever at least one filter compiled, the assistant supplied a query, or an
 * exact-ID lookup was requested. unsupported_constraint is reserved for a
 * brief where nothing at all is searchable. requirement_unavailable stays a
 * separate path and is unchanged. */
describe('compiler classification: unresolved facts no longer veto a searchable brief', () => {
  const wearabilityRequirement = {
    field: 'wearability',
    scope: { kind: 'mission', key: null },
    value: { kind: 'text', text: 'ears not pierced; clip-on earrings hurt' },
  };
  const ringRecord = {
    objectID: 'R1',
    Catalog_ProductType: 'Ring',
    Pricing_ActivePrice: 99,
  };

  it('searches the compilable subset when one filter compiles beside an un-compilable requirement fact', async () => {
    const search = vi.fn().mockResolvedValue([ringRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([ring, wearabilityRequirement]),
    });
    const result = await retrieve(productInput());
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.status, JSON.stringify(result.error)).toBe('ok');
    expect(result.records.map((record) => record.objectID)).toEqual(['R1']);
    expect(result.unresolved).toEqual([
      {
        field: 'wearability',
        reason: 'Constraint is not in the approved exact catalogue vocabulary',
      },
    ]);
    expect(result.effectiveFilters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Ring' },
    ]);
  });

  it('carries a recipient-scoped un-compilable requirement beside a compilable search instead of vetoing it', async () => {
    const search = vi.fn().mockResolvedValue([ringRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([ring, { ...wearabilityRequirement, scope: { kind: 'recipient', key: 'sister' } }]),
    });
    const result = await retrieve(productInput());
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    expect(result.unresolved).toEqual([
      {
        field: 'wearability',
        reason: 'Recipient or component scope is not provably bound to this item target',
      },
    ]);
  });

  it('proceeds on the assistant query when nothing compiles into a filter', async () => {
    const search = vi.fn().mockResolvedValue([ringRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([wearabilityRequirement]),
    });
    const result = await retrieve(
      productInput({ target: null, query: 'necklaces for sensitive ears' }),
    );
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toMatchObject({
      query: 'necklaces for sensitive ears',
      filters: [],
    });
    expect(result.status).toBe('ok');
    expect(result.records.map((record) => record.objectID)).toEqual(['R1']);
    expect(result.unresolved).toEqual([
      {
        field: 'wearability',
        reason: 'Constraint is not in the approved exact catalogue vocabulary',
      },
    ]);
  });

  it('keeps unsupported_constraint when only un-compilable facts exist and there is no query', async () => {
    const search = vi.fn().mockResolvedValue([ringRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([wearabilityRequirement]),
    });
    const result = await retrieve(productInput({ target: null }));
    expect(result.status).toBe('unsupported_constraint');
    expect(result.error).toMatchObject({ code: 'UNSUPPORTED_CONSTRAINT' });
    expect(result.unresolved).toEqual([
      {
        field: 'wearability',
        reason: 'Constraint is not in the approved exact catalogue vocabulary',
      },
    ]);
    expect(search).not.toHaveBeenCalled();
  });

  it('proceeds with an exact-ID lookup beside an un-compilable requirement fact', async () => {
    const search = vi.fn().mockResolvedValue([ringRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([wearabilityRequirement]),
    });
    const result = await retrieve(productInput({ target: null, exactObjectIDs: ['R1'] }));
    expect(search).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    expect(result.records.map((record) => record.objectID)).toEqual(['R1']);
    expect(result.unresolved).toEqual([
      {
        field: 'wearability',
        reason: 'Constraint is not in the approved exact catalogue vocabulary',
      },
    ]);
  });

  it('leaves a clean brief unchanged: no unresolved entries ride an ok result', async () => {
    const search = vi.fn().mockResolvedValue([ringRecord]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([ring]),
    });
    const result = await retrieve(productInput());
    expect(result.status).toBe('ok');
    expect(result.unresolved).toEqual([]);
    expect(result.records.map((record) => record.objectID)).toEqual(['R1']);
  });

  it('attaches unresolved entries to batched style results instead of vetoing the grid', async () => {
    const search = vi.fn().mockResolvedValue([
      {
        objectID: 'R1',
        Catalog_ProductType: 'Ring',
        Catalog_TitleDescription: 'Halo Ring',
        Catalog_LongDescription: 'A ring for the disclosure grid.',
        Catalog_Condition: 'First Quality',
        Inventory_InStock: true,
        Pricing_ActivePrice: 299.99,
      },
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([ring, wearabilityRequirement]),
    });
    const result = await retrieve(
      productInput({
        target: null,
        styleBatches: [{ attribute: 'Catalog_RingType', value: 'Halo' }],
      }),
    );
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ok');
    expect(result.styleResults?.[0]).toMatchObject({ value: 'Halo', eligibleCount: 1 });
    expect(result.unresolved).toEqual([
      {
        field: 'wearability',
        reason: 'Constraint is not in the approved exact catalogue vocabulary',
      },
    ]);
  });
});
