import { describe, expect, it, vi } from 'vitest';
import { createBriefState } from '../../shared/briefState.js';
import type { BriefStateV3 } from '../../shared/briefSchema.js';
import { briefStateV3Schema } from '../../shared/briefSchema.js';
import {
  updateShoppingState,
  type ShoppingState,
} from '../../shared/concierge/state/updateShoppingState.js';
import { createEvidenceRetriever } from '../../server/concierge/retrieveEvidence.js';

/* Deterministic replay for Craig-feedback Task 02 (men's product audience).
 * Prompts are Craig's exact words and the neutral wording variant Task 04
 * will run connected after the coordinated agent save. State assertions
 * cover the accepted facts; retrieval assertions cover the exact effective
 * filters, the compiled search request, per-record exclusion by exact record
 * gender, and the fact that a fresh mission inherits no audience restriction.
 * Record identity and audience fields mirror the live read-only probe of
 * 2026-10-13 (.checkpoint/runs/mens-watch-2026-10-13/
 * gender-audience-catalog-readback.json) and Craig's captured exact records
 * (.checkpoint/runs/craig-feedback-verification-2026-10-12/watch/). */

const TURN_1 = "I'm shopping for a men's watch under $1,000. Show me a few genuinely different styles.";
const TURN_NEUTRAL = 'Show me wrist watches under $1,000.';

// Live Catalog_Gender vocabulary: exactly Female, Male, Unisex (verified
// 2026-10-13, whole index and wrist-watch scope alike). Never a frozen copy:
// this fixture stands in for the live vocabulary snapshot the runtime serves.
const vocabularyValues = {
  'Catalog_ProductType': ['Ring', 'Necklace', 'Bracelet', 'Wrist Watch'],
  'Catalog_Gender': ['Female', 'Male', 'Unisex'],
  'Catalog_WatchStyle': ['Casual', 'Dress', 'Fashion', 'Sport'],
} as Record<string, string[]>;
const liveVocabulary = {
  values: vocabularyValues,
  builtAt: '2026-10-13T00:00:00.000Z',
  hasValue: (attribute: string, value: string) =>
    (vocabularyValues[attribute] ?? []).includes(value),
  availableValues: (attribute: string) => vocabularyValues[attribute] ?? [],
  isFilterable: (attribute: string) => attribute in vocabularyValues,
};
const vocabulary = { get: async () => liveVocabulary, invalidate: () => {} };

const base = (): ShoppingState => ({ brief: createBriefState('mission-1'), receipts: [] });
const factsOf = (state: ShoppingState) => (state.brief as BriefStateV3).facts;
const factByField = (state: ShoppingState, field: string) =>
  factsOf(state).filter((f) => f.field === field);

/* The records from Craig's captured failure and the verified eligible
 * examples, with the exact audience fields the live catalogue carries. */
const watchRecord = (
  objectID: string,
  patch: Record<string, unknown> = {},
): Record<string, unknown> => ({
  objectID,
  Catalog_ProductType: 'Wrist Watch',
  Catalog_TitleDescription: `Watch ${objectID}`,
  Catalog_LongDescription: 'A wrist watch for the deterministic replay.',
  Catalog_Condition: 'First Quality',
  Inventory_InStock: true,
  Pricing_ActivePrice: 299.99,
  ...patch,
});
const capturedFemaleRecords = () => [
  // JRJ802A and IRE616 are exactly what Craig's grid staged for a men's
  // request; PPR7845 was the third, additionally Pre-Owned.
  watchRecord('JRJ802A', {
    Catalog_Gender: 'Female',
    Catalog_TargetConsumer: ['Women'],
    Catalog_WatchStyle: 'Dress',
    Pricing_ActivePrice: 149.99,
  }),
  watchRecord('IRE616', {
    Catalog_Gender: 'Female',
    Catalog_TargetConsumer: ['Women'],
    Catalog_WatchStyle: 'Casual',
    Pricing_ActivePrice: 37.5,
  }),
  watchRecord('PPR7845', {
    Catalog_Gender: 'Female',
    Catalog_TargetConsumer: ['Women'],
    Catalog_WatchStyle: 'Dress',
    Catalog_Condition: 'Pre-Owned',
    Pricing_ActivePrice: 458.99,
  }),
];
const eligibleRecords = () => [
  // 1ZPF6B: Unisex marketed to both audiences, 442.99, first quality, stock.
  // 1ZLZDA: Male targeting Men, 298.99, first quality, stock.
  watchRecord('1ZPF6B', {
    Catalog_Gender: 'Unisex',
    Catalog_TargetConsumer: ['Men', 'Women'],
    Catalog_WatchStyle: 'Casual',
    Pricing_ActivePrice: 442.99,
  }),
  watchRecord('1ZLZDA', {
    Catalog_Gender: 'Male',
    Catalog_TargetConsumer: ['Men'],
    Catalog_WatchStyle: 'Dress',
    Pricing_ActivePrice: 298.99,
  }),
];

describe("men's watch audience replay (Craig Task 02), state half", () => {
  it('accepts the turn-1 men\'s audience, product type and ceiling budget', async () => {
    const turn1 = await updateShoppingState(
      base(),
      {
        missionId: 'mission-1',
        expectedRevision: 0,
        operationId: 'turn-1',
        sourceMessageId: 'm1',
        operations: [
          {
            action: 'add',
            factIds: [],
            sourceQuote: "men's watch",
            fact: {
              id: 'type-1',
              field: 'product_type',
              value: {
                kind: 'facet',
                attribute: 'Catalog_ProductType',
                values: ['Wrist Watch'],
                operator: 'any',
              },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
          {
            action: 'add',
            factIds: [],
            sourceQuote: "men's watch",
            fact: {
              id: 'audience-1',
              field: 'product_audience',
              value: {
                kind: 'facet',
                attribute: 'Catalog_Gender',
                values: ['Male', 'Unisex'],
                operator: 'any',
              },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
          {
            action: 'add',
            factIds: [],
            sourceQuote: 'under $1,000',
            fact: {
              id: 'budget-1',
              field: 'budget',
              value: { kind: 'money', cents: 100000, currency: 'USD', operator: 'lte', basis: 'total' },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
        ],
      },
      { id: 'm1', text: TURN_1 },
      liveVocabulary,
    );
    expect(turn1.result.status).toBe('applied');
    const type = factByField(turn1.state, 'product_type')[0];
    expect(type.value).toMatchObject({
      attribute: 'Catalog_ProductType',
      values: ['Wrist Watch'],
      operator: 'any',
    });
    // The accepted audience fact is explicit product-audience scope on the
    // product record: Male plus Unisex, never Female, and never a guess
    // about the shopper.
    const audience = factByField(turn1.state, 'product_audience')[0];
    expect(audience.value).toMatchObject({
      attribute: 'Catalog_Gender',
      values: ['Male', 'Unisex'],
      operator: 'any',
    });
    // The captured input recorded basis 'total'; the accepted basis is
    // carried untouched, and exactly one budget fact exists.
    const budget = factByField(turn1.state, 'budget')[0];
    expect(budget.value).toMatchObject({ cents: 100000, operator: 'lte', basis: 'total' });
    expect(factByField(turn1.state, 'budget')).toHaveLength(1);
  });

  it('accepts a neutral watch request with no audience fact at all', async () => {
    const turn = await updateShoppingState(
      base(),
      {
        missionId: 'mission-1',
        expectedRevision: 0,
        operationId: 'turn-neutral',
        sourceMessageId: 'm1',
        operations: [
          {
            action: 'add',
            factIds: [],
            sourceQuote: 'wrist watches',
            fact: {
              id: 'type-1',
              field: 'product_type',
              value: {
                kind: 'facet',
                attribute: 'Catalog_ProductType',
                values: ['Wrist Watch'],
                operator: 'any',
              },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
          {
            action: 'add',
            factIds: [],
            sourceQuote: 'under $1,000',
            fact: {
              id: 'budget-1',
              field: 'budget',
              value: { kind: 'money', cents: 100000, currency: 'USD', operator: 'lte', basis: 'total' },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
        ],
      },
      { id: 'm1', text: TURN_NEUTRAL },
      liveVocabulary,
    );
    expect(turn.result.status).toBe('applied');
    expect(factByField(turn.state, 'product_audience')).toHaveLength(0);
  });
});

describe("men's watch audience replay (Craig Task 02), retrieval half", () => {
  const fact = (id: string, field: string, value: unknown) => ({
    id,
    field,
    value,
    scope: { kind: 'mission', key: null },
    status: 'active',
    revision: 1,
    createdAt: 'now',
    origin: 'spoken',
    certainty: 'explicit',
    strength: 'requirement',
    evidence: { messageId: 'm1', quote: 'explicit', explicit: true, verified: true },
  });
  const audienceState = (facts: unknown[]): BriefStateV3 =>
    briefStateV3Schema.parse({
      version: 3,
      missionId: 'mission-1',
      revision: 1,
      facts: facts.map((entry, i) =>
        fact(`f${i}`, (entry as { field: string }).field, (entry as { value: unknown }).value),
      ),
      processedTurns: [],
      tombstones: [],
      events: [],
    });
  const input = (patch: Record<string, unknown> = {}) => ({
    source: 'prod_catalog',
    query: '',
    count: 3,
    missionId: 'mission-1',
    expectedRevision: 1,
    turnId: 'turn-1',
    target: null,
    ...patch,
  });

  it('compiles the exact turn-1 filters: type, audience OR-group, per-record ceiling', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        audienceState([
          { field: 'product_type', value: { kind: 'facet', attribute: 'Catalog_ProductType', values: ['Wrist Watch'], operator: 'any' } },
          { field: 'product_audience', value: { kind: 'facet', attribute: 'Catalog_Gender', values: ['Male', 'Unisex'], operator: 'any' } },
          { field: 'budget', value: { kind: 'money', cents: 100000, currency: 'USD', operator: 'lte', basis: 'total' } },
        ]),
      vocabulary,
    });
    const result = await retrieve(input());
    expect(result.effectiveFilters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Wrist Watch' },
      { field: 'Catalog_Gender', operator: 'in', value: ['Male', 'Unisex'] },
      { field: 'Pricing_ActivePrice', operator: 'lte', value: 1000 },
    ]);
  });

  it('stages only Male or Unisex records across the style grid and excludes the captured Female substitutes', async () => {
    // Two style batches mirror Craig's two Dress/Casual columns. The search
    // mock returns the captured Female substitutes and the verified eligible
    // examples together; the per-record exclusion must keep only the
    // Male/Unisex identities, by exact record gender and condition.
    const allRecords = [...capturedFemaleRecords(), ...eligibleRecords()];
    const search = vi.fn(async ({ filters }: { filters: readonly { field: string; value: unknown }[] }) => {
      const styleFilter = filters.find((f) => f.field === 'Catalog_WatchStyle');
      return allRecords.filter(
        (r) => !styleFilter || r.Catalog_WatchStyle === styleFilter.value,
      );
    });
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        audienceState([
          { field: 'product_type', value: { kind: 'facet', attribute: 'Catalog_ProductType', values: ['Wrist Watch'], operator: 'any' } },
          { field: 'product_audience', value: { kind: 'facet', attribute: 'Catalog_Gender', values: ['Male', 'Unisex'], operator: 'any' } },
          { field: 'budget', value: { kind: 'money', cents: 100000, currency: 'USD', operator: 'lte', basis: 'total' } },
        ]),
      vocabulary,
    });
    const result = await retrieve(
      input({
        count: 3,
        styleBatches: [
          { attribute: 'Catalog_WatchStyle', value: 'Dress' },
          { attribute: 'Catalog_WatchStyle', value: 'Casual' },
        ],
      }),
    );
    expect(result.status).toBe('ok');
    const eligible = result.records.map((r) => r.objectID).sort();
    expect(eligible).toEqual(['1ZLZDA', '1ZPF6B']);
    const reasons = result.styleResults!.flatMap((batch) => batch.rejected);
    // Every rejected candidate names its exact recorded reason.
    expect(reasons).toContainEqual({ objectID: 'JRJ802A', reason: 'audience_conflict' });
    expect(reasons).toContainEqual({ objectID: 'IRE616', reason: 'audience_conflict' });
    // PPR7845 is Female AND Pre-Owned: the audience gate fires first on
    // gender; the condition gate independently refuses Pre-Owned pieces.
    expect(reasons.some((r) => r.objectID === 'PPR7845')).toBe(true);
    const pprReason = reasons.find((r) => r.objectID === 'PPR7845')!.reason;
    expect(['audience_conflict', 'pre_owned_not_requested']).toContain(pprReason);
    // The compiled request carried the audience OR-group to the index.
    const firstCall = search.mock.calls[0][0] as unknown as {
      filters: Array<{ field: string; operator: string; value: unknown }>;
    };
    expect(firstCall.filters).toContainEqual({
      field: 'Catalog_Gender',
      operator: 'in',
      value: ['Male', 'Unisex'],
    });
  });

  it('keeps a neutral mission free of any audience restriction', async () => {
    const search = vi.fn().mockResolvedValue(capturedFemaleRecords().slice(0, 1));
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        audienceState([
          { field: 'product_type', value: { kind: 'facet', attribute: 'Catalog_ProductType', values: ['Wrist Watch'], operator: 'any' } },
          { field: 'budget', value: { kind: 'money', cents: 100000, currency: 'USD', operator: 'lte', basis: 'total' } },
        ]),
      vocabulary,
    });
    const result = await retrieve(input({ count: 3 }));
    expect(result.status).toBe('ok');
    expect(result.records.map((r) => r.objectID)).toEqual(['JRJ802A']);
    expect(result.effectiveFilters.every((f) => f.field !== 'Catalog_Gender')).toBe(true);
  });
});
