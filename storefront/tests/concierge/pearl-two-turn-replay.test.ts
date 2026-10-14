import { describe, expect, it, vi } from 'vitest';
import { createBriefState } from '../../shared/briefState.js';
import type { BriefStateV3 } from '../../shared/briefSchema.js';
import { briefStateV3Schema } from '../../shared/briefSchema.js';
import {
  updateShoppingState,
  type ShoppingState,
} from '../../shared/concierge/state/updateShoppingState.js';
import { createEvidenceRetriever } from '../../server/concierge/retrieveEvidence.js';

/* Deterministic two-turn replay for Craig-feedback Task 01 (pearl evidence and
 * classic strands). Prompts are Craig's exact words. Turn-level assertions
 * cover accepted facts; retrieval assertions cover the exact effective filters,
 * the Algolia request, record identity, and the genuine shortage path.
 * Connected acceptance of these exact journeys stays reserved for the later
 * coordinated gate (Task 04) with fresh phrasing per the completion-cache rule.
 * Live pearl vocabulary mirrors the 2026-10-12 read-only probe. */

const TURN_1 = 'I\'m looking for a pearl necklace under $1,000. What are my options?';
const TURN_2 =
  'I want a classic pearl strand, still under $1,000. Please show me classic strands.';

const PEARL_NAMES = [
  'Akoya Pearl', 'Baroque Pearl', 'Blister Pearl', 'Freshwater Pearl',
  'Genusis Pearls', 'Kasumiga Pearl', 'Mabe Pearl', 'Saltwater Pearl',
  'South Sea Pearl', 'Tahitian Pearl',
];

const vocabularyValues = {
  'Catalog_ProductType': ['Ring', 'Earrings', 'Necklace', 'Bracelet', 'Pendant', 'Wrist Watch'],
  'Catalog_PearlInformationPrimary.PearlFullName': PEARL_NAMES,
  'Catalog_PearlInformation.PearlFullName': PEARL_NAMES,
  'Catalog_NecklaceType': ['Chain', 'Pendant', 'Strand', 'Statement', 'Beaded', 'Endless Strand'],
} as Record<string, string[]>;
const liveVocabulary = {
  values: vocabularyValues,
  builtAt: '2026-10-12T00:00:00.000Z',
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

describe('pearl two-turn replay (Craig Task 01), state half', () => {
  it('accepts the turn-1 pearl requirement, product type and ceiling budget', async () => {
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
            sourceQuote: 'pearl necklace',
            fact: {
              id: 'type-1',
              field: 'product_type',
              value: { kind: 'facet', attribute: 'Catalog_ProductType', values: ['Necklace'], operator: 'any' },
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
              value: { kind: 'money', cents: 100000, currency: 'USD', operator: 'lt', basis: 'per_item' },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
          {
            action: 'add',
            factIds: [],
            sourceQuote: 'pearl',
            fact: {
              id: 'pearl-1',
              field: 'pearl',
              value: {
                kind: 'facet',
                attribute: 'Catalog_PearlInformationPrimary.PearlFullName',
                values: liveVocabulary.availableValues('Catalog_PearlInformationPrimary.PearlFullName'),
                operator: 'any',
              },
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

    // Turn 2 refines to classic strands; budget and pearl carry over untouched.
    const turn2 = await updateShoppingState(
      turn1.state,
      {
        missionId: 'mission-1',
        expectedRevision: 1,
        operationId: 'turn-2',
        sourceMessageId: 'm2',
        operations: [
          {
            action: 'add',
            factIds: [],
            sourceQuote: 'classic strands',
            fact: {
              id: 'strand-1',
              field: 'necklace_type',
              value: { kind: 'facet', attribute: 'Catalog_NecklaceType', values: ['Strand'], operator: 'any' },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
        ],
      },
      { id: 'm2', text: TURN_2 },
      liveVocabulary,
    );
    expect(turn2.result.status).toBe('applied');

    const budget = factByField(turn2.state, 'budget')[0];
    expect(budget).toBeDefined();
    expect(budget.value).toMatchObject({ cents: 100000, operator: 'lt', basis: 'per-item' });
    const pearl = factByField(turn2.state, 'pearl')[0];
    expect(pearl.value).toMatchObject({
      attribute: 'Catalog_PearlInformationPrimary.PearlFullName',
      operator: 'any',
    });
    expect((pearl.value as { values: string[] }).values).toEqual(PEARL_NAMES);
    const strand = factByField(turn2.state, 'necklace_type')[0];
    expect(strand.value).toMatchObject({ attribute: 'Catalog_NecklaceType', values: ['Strand'] });
    // The ceiling is never re-encoded as a target or minimum: exactly one
    // budget fact exists and no second money fact was invented on refinement.
    expect(factByField(turn2.state, 'budget')).toHaveLength(1);
  });
});

describe('pearl two-turn replay (Craig Task 01), retrieval half', () => {
  const fact = (id: string, field: string, value: unknown) => ({
    id,
    field,
    value,
    scope: { kind: 'mission', key: null },
    status: 'active',
    revision: 2,
    createdAt: 'now',
    origin: 'spoken',
    certainty: 'explicit',
    strength: 'requirement',
    evidence: { messageId: 'm2', quote: 'explicit', explicit: true, verified: true },
  });
  const turn2State = (extra: unknown[] = []): BriefStateV3 =>
    briefStateV3Schema.parse({
      version: 3,
      missionId: 'mission-1',
      revision: 2,
      facts: [
        fact('type-1', 'product_type', {
          kind: 'facet',
          attribute: 'Catalog_ProductType',
          values: ['Necklace'],
          operator: 'any',
        }),
        fact('budget-1', 'budget', {
          kind: 'money',
          cents: 100000,
          currency: 'USD',
          operator: 'lt',
          basis: 'per-item',
        }),
        fact('pearl-1', 'pearl', {
          kind: 'facet',
          attribute: 'Catalog_PearlInformationPrimary.PearlFullName',
          values: PEARL_NAMES,
          operator: 'any',
        }),
        fact('strand-1', 'necklace_type', {
          kind: 'facet',
          attribute: 'Catalog_NecklaceType',
          values: ['Strand'],
          operator: 'any',
        }),
        ...extra,
      ],
      processedTurns: [],
      tombstones: [],
      events: [],
    });
  const input = (patch: Record<string, unknown> = {}) => ({
    source: 'prod_catalog',
    query: '',
    count: 3,
    missionId: 'mission-1',
    expectedRevision: 2,
    turnId: 'turn-2',
    target: null,
    ...patch,
  });
  const strandRecord = (objectID: string, pearl: string) => ({
    objectID,
    Catalog_TitleDescription: `${pearl} Strand Necklace`,
    Catalog_LongDescription: 'A classic strand of pearls with a secure clasp.',
    Inventory_InStock: true,
    Catalog_Condition: 'First Quality',
    'Catalog_PearlInformationPrimary.PearlFullName': pearl,
  });

  it('compiles the exact turn-2 filters: type, ceiling, pearl, strand', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({ search, currentState: async () => turn2State(), vocabulary });
    const result = await retrieve(input());
    expect(result.effectiveFilters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Necklace' },
      { field: 'Pricing_ActivePrice', operator: 'lt', value: 1000 },
      {
        field: 'Catalog_PearlInformationPrimary.PearlFullName',
        operator: 'in',
        value: PEARL_NAMES,
      },
      { field: 'Catalog_NecklaceType', operator: 'eq', value: 'Strand' },
    ]);
  });

  it('sends the pearl OR-group and ceiling to the index and returns eligible identities', async () => {
    const search = vi.fn().mockResolvedValue([
      strandRecord('PWP324D', 'Freshwater Pearl'),
      strandRecord('PW879', 'Tahitian Pearl'),
    ]);
    const retrieve = createEvidenceRetriever({ search, currentState: async () => turn2State(), vocabulary });
    const result = await retrieve(input());
    expect(result.status).toBe('ok');
    expect(result.records.map((r) => r.objectID)).toEqual(['PWP324D', 'PW879']);
    // The mock intercepts before the Algolia string builder; the compiled
    // request filters ARE the boundary contract (the 'in' OR-group becomes the
    // facetFilters array inside createAlgoliaEvidenceSearch, covered by the
    // retrieval suite's own translation tests).
    const request = search.mock.calls[0][0] as unknown as {
      filters: Array<{ field: string; operator: string; value: unknown }>;
    };
    expect(request.filters).toContainEqual({
      field: 'Catalog_PearlInformationPrimary.PearlFullName',
      operator: 'in',
      value: PEARL_NAMES,
    });
    expect(request.filters).toContainEqual({
      field: 'Pricing_ActivePrice',
      operator: 'lt',
      value: 1000,
    });
    expect(request.filters).toContainEqual({
      field: 'Catalog_NecklaceType',
      operator: 'eq',
      value: 'Strand',
    });
    expect(request.filters).toContainEqual({
      field: 'Catalog_ProductType',
      operator: 'eq',
      value: 'Necklace',
    });
  });

  it('reports a genuine shortage with source-backed filters, not a fabricated answer', async () => {
    // Kasumiga strands at this ceiling exist in the vocabulary but the mock
    // search returns none — the shopper is told what was searched and that it
    // came back empty, exactly as the catalogue answered.
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({ search, currentState: async () => turn2State(), vocabulary });
    const result = await retrieve(input());
    expect(result.status).toBe('zero_hits');
    expect(result.effectiveFilters).toHaveLength(4);
    expect(result.effectiveFilters).toContainEqual({
      field: 'Catalog_PearlInformationPrimary.PearlFullName',
      operator: 'in',
      value: PEARL_NAMES,
    });
  });

  it('discloses a named pearl the live vocabulary does not carry', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        turn2State([
          fact('pearl-2', 'pearl', {
            kind: 'facet',
            attribute: 'Catalog_PearlInformationPrimary.PearlFullName',
            values: ['Conch Pearl'],
            operator: 'any',
          }),
        ]),
      vocabulary,
    });
    const result = await retrieve(input());
    expect(result.status).toBe('requirement_unavailable');
    expect(result.unavailableRequirements?.[0]).toMatchObject({
      field: 'pearl',
      requested: ['Conch Pearl'],
    });
    expect(result.unavailableRequirements?.[0]?.availableValues).toContain('Freshwater Pearl');
    expect(search).not.toHaveBeenCalled();
  });
});
