import { describe, expect, it, vi } from 'vitest';
import { createBriefState } from '../../shared/briefState.js';
import {
  type ShoppingState,
  updateShoppingState,
} from '../../shared/concierge/state/updateShoppingState.js';
import { briefStateV3Schema, type BriefStateV3 } from '../../shared/briefSchema.js';
import { createEvidenceRetriever } from '../../server/concierge/retrieveEvidence.js';

/* Earring backing type (Craig feedback, backing-type lane 2026-10-14), red-first.
 *
 * Verified live (read-only facet interrogation, the exact code path behind
 * GET /api/catalog-vocabulary): Catalog_BackingType is a filterable facet whose
 * live values include Clip-On, Fish Hook, Leverback and Push Back. Arijit
 * verified the data exists before this lane started; the probe receipt lives in
 * .checkpoint/runs/backing-type-2026-10-14/.
 *
 * Contract under test:
 * - The accepted brief carries an earring_backing field whose requirement
 *   encoding is a facet on Catalog_BackingType with LIVE-vocabulary values,
 *   never a frozen list and never a free-text requirement.
 * - A backing meaning the agent cannot map to a live value stays as text
 *   context (strength context): never a bogus facet, never a dropped fact.
 * - An explicit backing requirement compiles ONLY when the accepted product
 *   direction includes earrings (product_type Earrings or an earring item
 *   target). Against a necklace (or any other) direction the fact stays
 *   context: no Catalog_BackingType filter, no failure noise.
 * - A value the live vocabulary does not carry takes the
 *   requirement_unavailable disclosure path, never silent broadening. */

const BACKING_VALUES = ['Clip-On', 'Fish Hook', 'Leverback', 'Push Back'];

const writerVocabulary = {
  values: {
    'Catalog_ProductType': [
      'Ring', 'Earrings', 'Necklace', 'Bracelet', 'Pendant', 'Wrist Watch',
    ],
    // Mirrors the live Catalog_BackingType facet scan of 2026-10-14
    // (.checkpoint/runs/backing-type-2026-10-14/). The writer validates against
    // this the way production validates against /api/catalog-vocabulary.
    'Catalog_BackingType': BACKING_VALUES,
  } as Record<string, string[]>,
  builtAt: '2026-10-14T00:00:00.000Z',
  hasValue: (attribute: string, value: string) =>
    (writerVocabulary.values[attribute] ?? []).includes(value),
  availableValues: (attribute: string) => writerVocabulary.values[attribute] ?? [],
  isFilterable: (attribute: string) => attribute in writerVocabulary.values,
};

const backingMessage = {
  id: 'm-backing',
  text: 'She loves drop earrings but her ears are not pierced, so clip-ons only please.',
};

const base = (): ShoppingState => ({ brief: createBriefState('mission-1'), receipts: [] });

const backingOperation = (
  id: string,
  value: unknown,
  overrides: Record<string, unknown> = {},
  sourceQuote = 'clip-ons only',
) => ({
  missionId: 'mission-1',
  expectedRevision: 0,
  operationId: id,
  sourceMessageId: backingMessage.id,
  operations: [
    {
      action: 'add',
      factIds: [],
      sourceQuote,
      fact: {
        id,
        field: 'earring_backing',
        value,
        scope: { kind: 'mission', key: null },
        strength: 'requirement',
        certainty: 'explicit',
        ...overrides,
      },
    },
  ],
});

describe('earring_backing writer gate (backing-type lane)', () => {
  it('accepts a clip-on requirement as a facet on Catalog_BackingType with a live value', async () => {
    const result = await updateShoppingState(
      base(),
      backingOperation('backing-1', {
        kind: 'facet',
        attribute: 'Catalog_BackingType',
        values: ['Clip-On'],
        operator: 'any',
      }),
      backingMessage,
      writerVocabulary,
    );
    expect(result.result.status).toBe('applied');
    const brief = result.state.brief as { facts: Array<{ field: string; value: unknown }> };
    const backing = brief.facts.find((f) => f.field === 'earring_backing') as {
      value: { kind: string; attribute: string; values: string[]; operator: string };
    };
    expect(backing.value).toMatchObject({
      kind: 'facet',
      attribute: 'Catalog_BackingType',
      values: ['Clip-On'],
      operator: 'any',
    });
  });

  it('accepts a multi-value live backing OR group (clip-on or leverback)', async () => {
    const result = await updateShoppingState(
      base(),
      backingOperation('backing-2', {
        kind: 'facet',
        attribute: 'Catalog_BackingType',
        values: ['Clip-On', 'Leverback'],
        operator: 'any',
      }),
      backingMessage,
      writerVocabulary,
    );
    expect(result.result.status).toBe('applied');
  });

  it('keeps a backing meaning with no live value as text context, never a bogus facet', async () => {
    // "her ears are not pierced" means clip-ons, but when the agent cannot map
    // a meaning onto a live Catalog_BackingType value it must not invent one:
    // the fact stays as context text the conversation can still use.
    const result = await updateShoppingState(
      base(),
      backingOperation(
        'backing-3',
        { kind: 'text', text: 'her ears are not pierced' },
        { strength: 'context' },
        'her ears are not pierced',
      ),
      backingMessage,
      writerVocabulary,
    );
    expect(result.result.status).toBe('applied');
    const brief = result.state.brief as {
      facts: Array<{ field: string; strength: string; value: { kind: string } }>;
    };
    const backing = brief.facts.find((f) => f.field === 'earring_backing');
    expect(backing?.value.kind).toBe('text');
    expect(backing?.strength).toBe('context');
  });

  it('refuses a made-up backing value with the live-vocabulary code', async () => {
    // A plausible-but-absent value ('Screw-Back') must never silently match:
    // the vocabulary is the index's, live, not a frozen guess list.
    const result = await updateShoppingState(
      base(),
      backingOperation('backing-4', {
        kind: 'facet',
        attribute: 'Catalog_BackingType',
        values: ['Screw-Back'],
        operator: 'any',
      }),
      backingMessage,
      writerVocabulary,
    );
    expect(result.result.status).toBe('invalid_input');
    expect(result.result.failure?.code).toBe('VALUE_NOT_IN_LIVE_VOCABULARY');
  });

  it('refuses a backing requirement expressed as free text', async () => {
    // Text can never be an eligibility gate. The context-strength escape is the
    // ONLY text encoding; a requirement must be a validated facet.
    const result = await updateShoppingState(
      base(),
      backingOperation(
        'backing-5',
        { kind: 'text', text: 'clip-ons' },
        { strength: 'requirement' },
      ),
      backingMessage,
      writerVocabulary,
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('refuses backing facets on any other catalogue attribute', async () => {
    const result = await updateShoppingState(
      base(),
      backingOperation('backing-6', {
        kind: 'facet',
        attribute: 'Catalog_ProductType',
        values: ['Clip-On'],
        operator: 'any',
      }),
      backingMessage,
      writerVocabulary,
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('refuses a none-operator backing exclusion', async () => {
    // Excluding a backing is a different product conversation; the contract
    // supports positive selections only.
    const result = await updateShoppingState(
      base(),
      backingOperation('backing-7', {
        kind: 'facet',
        attribute: 'Catalog_BackingType',
        values: ['Fish Hook'],
        operator: 'none',
      }),
      backingMessage,
      writerVocabulary,
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('fails closed without a live vocabulary', async () => {
    const result = await updateShoppingState(
      base(),
      backingOperation('backing-8', {
        kind: 'facet',
        attribute: 'Catalog_BackingType',
        values: ['Clip-On'],
        operator: 'any',
      }),
      backingMessage,
      undefined,
    );
    expect(result.result.status).toBe('invalid_input');
    expect(result.result.failure?.code).toBe('VOCABULARY_UNAVAILABLE');
  });
});

/* Retrieval half: compile semantics and the earring-direction gate. */
const compilerVocabularyValues = {
  'Catalog_ProductType': ['Ring', 'Earrings', 'Necklace'],
  'Catalog_BackingType': BACKING_VALUES,
} as Record<string, string[]>;
const compilerVocabulary = {
  values: compilerVocabularyValues,
  builtAt: '2026-10-14T00:00:00.000Z',
  hasValue: (attribute: string, value: string) =>
    (compilerVocabularyValues[attribute] ?? []).includes(value),
  availableValues: (attribute: string) => compilerVocabularyValues[attribute] ?? [],
  isFilterable: (attribute: string) => attribute in compilerVocabularyValues,
};
const compilerVocabularyCache = {
  get: async () => compilerVocabulary,
  invalidate: () => {},
};

const ev = { messageId: 'm', quote: 'explicit', explicit: true, verified: true };
const compilerState = (facts: unknown[]): BriefStateV3 =>
  briefStateV3Schema.parse({
    version: 3,
    missionId: 'mission-1',
    revision: 2,
    facts: facts.map((fact, i) => ({
      id: `f${i}`,
      status: 'active',
      revision: 2,
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
const productTypeFact = (values: string[]) => ({
  field: 'product_type',
  scope: { kind: 'mission', key: null },
  value: { kind: 'facet', attribute: 'Catalog_ProductType', values, operator: 'any' },
});
const backingFact = (values: string[], patch: Record<string, unknown> = {}) => ({
  field: 'earring_backing',
  scope: { kind: 'mission', key: null },
  value: { kind: 'facet', attribute: 'Catalog_BackingType', values, operator: 'any' },
  ...patch,
});
const retrievalInput = (patch: Record<string, unknown> = {}) => ({
  source: 'prod_catalog',
  query: '',
  count: 3,
  missionId: 'mission-1',
  expectedRevision: 2,
  turnId: 'turn-1',
  target: null,
  ...patch,
});
const earringRecord = (objectID: string, patch: Record<string, unknown> = {}) => ({
  objectID,
  Catalog_ProductType: 'Earrings',
  Catalog_BackingType: 'Clip-On',
  Catalog_TitleDescription: `Drop earrings ${objectID}`,
  Catalog_LongDescription: 'Drop earrings with a comfortable backing.',
  Catalog_Condition: 'First Quality',
  Inventory_InStock: true,
  Pricing_ActivePrice: 89.99,
  ...patch,
});

describe('earring_backing compile gate (backing-type lane)', () => {
  it('compiles the backing OR-group for an earring mission direction', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        compilerState([productTypeFact(['Earrings']), backingFact(['Clip-On', 'Leverback'])]),
      vocabulary: compilerVocabularyCache,
    });
    const result = await retrieve(retrievalInput());
    expect(result.effectiveFilters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Earrings' },
      { field: 'Catalog_BackingType', operator: 'in', value: ['Clip-On', 'Leverback'] },
    ]);
  });

  it('sends the backing filter to the index and returns an eligible clip-on record', async () => {
    const search = vi.fn().mockResolvedValue([earringRecord('E111')]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        compilerState([productTypeFact(['Earrings']), backingFact(['Clip-On'])]),
      vocabulary: compilerVocabularyCache,
    });
    const result = await retrieve(retrievalInput({ count: 3 }));
    expect(result.status).toBe('ok');
    expect(result.records.map((r) => r.objectID)).toEqual(['E111']);
    const request = search.mock.calls[0][0] as unknown as {
      filters: Array<{ field: string; operator: string; value: unknown }>;
    };
    expect(request.filters).toContainEqual({
      field: 'Catalog_BackingType',
      operator: 'in',
      value: ['Clip-On'],
    });
  });

  it('compiles for an earring item target when the item scope pins Earrings', async () => {
    const search = vi.fn().mockResolvedValue([earringRecord('E222')]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        compilerState([
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
          backingFact(['Clip-On']),
        ]),
      vocabulary: compilerVocabularyCache,
    });
    const result = await retrieve(
      retrievalInput({ target: { kind: 'item', itemKey: 'Earrings', productType: 'Earrings' } }),
    );
    expect(result.status).toBe('ok');
    expect(result.effectiveFilters).toContainEqual({
      field: 'Catalog_BackingType',
      operator: 'in',
      value: ['Clip-On'],
    });
    expect(result.effectiveFilters).toContainEqual({
      field: 'Catalog_ProductType',
      operator: 'eq',
      value: 'Earrings',
    });
  });

  it('keeps the backing fact as context against a necklace direction: no filter, no failure', async () => {
    // The strength law: an explicit backing requirement compiles ONLY when the
    // accepted direction includes earrings. A necklace brief must not inherit a
    // Catalog_BackingType filter, and the fact must not surface as a failed
    // requirement either: it stays conversation context while the necklace
    // search proceeds on its own basis.
    const search = vi.fn().mockResolvedValue([
      {
        objectID: 'N111',
        Catalog_ProductType: 'Necklace',
        Catalog_TitleDescription: 'Necklace N111',
        Catalog_LongDescription: 'A necklace for the backing direction gate.',
        Catalog_Condition: 'First Quality',
        Inventory_InStock: true,
        Pricing_ActivePrice: 120,
      },
    ]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        compilerState([productTypeFact(['Necklace']), backingFact(['Clip-On'])]),
      vocabulary: compilerVocabularyCache,
    });
    const result = await retrieve(retrievalInput());
    expect(result.status).toBe('ok');
    expect(result.effectiveFilters).toEqual([
      { field: 'Catalog_ProductType', operator: 'eq', value: 'Necklace' },
    ]);
    const request = search.mock.calls[0][0] as unknown as {
      filters: Array<{ field: string; operator: string; value: unknown }>;
    };
    expect(request.filters.some((filter) => filter.field === 'Catalog_BackingType')).toBe(false);
    expect(result.unresolved.filter((u) => u.field === 'earring_backing')).toEqual([]);
    expect(result.unavailableRequirements ?? []).toEqual([]);
  });

  it('keeps the backing fact as context when no product direction is stated', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => compilerState([backingFact(['Clip-On'])]),
      vocabulary: compilerVocabularyCache,
    });
    const result = await retrieve(retrievalInput());
    expect(result.effectiveFilters).toEqual([]);
    expect(
      result.unresolved.filter((u) => u.field === 'earring_backing'),
    ).toEqual([]);
    expect(result.unavailableRequirements ?? []).toEqual([]);
  });

  it('discloses a backing value the live vocabulary does not carry instead of matching', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        compilerState([productTypeFact(['Earrings']), backingFact(['Screw-Back'])]),
      vocabulary: compilerVocabularyCache,
    });
    const result = await retrieve(retrievalInput());
    expect(result.status).toBe('requirement_unavailable');
    expect(result.unavailableRequirements?.[0]).toMatchObject({
      field: 'earring_backing',
      attribute: 'Catalog_BackingType',
      requested: ['Screw-Back'],
    });
    expect(result.unavailableRequirements?.[0]?.availableValues).toContain('Clip-On');
    expect(search).not.toHaveBeenCalled();
  });

  it('stays unresolved without a live vocabulary: no frozen backing list', async () => {
    // Without the live vocabulary the backing filter must not compile from a
    // frozen copy: the earring search proceeds on its compilable product-type
    // basis (classify, not veto) and the backing fact rides out as a
    // structured unresolved disclosure for the agent.
    const search = vi.fn().mockResolvedValue([earringRecord('E333')]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        compilerState([productTypeFact(['Earrings']), backingFact(['Clip-On'])]),
    });
    const result = await retrieve(retrievalInput());
    const request = search.mock.calls[0]?.[0] as unknown as
      | { filters: Array<{ field: string; operator: string; value: unknown }> }
      | undefined;
    expect(request).toBeDefined();
    expect(
      request?.filters.some((filter) => filter.field === 'Catalog_BackingType'),
    ).toBe(false);
    expect(result.unresolved).toContainEqual({
      field: 'earring_backing',
      reason: 'Earring backing needs the live catalogue vocabulary',
    });
  });
});
