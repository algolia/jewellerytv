import { describe, expect, it, vi } from 'vitest';
import { briefStateV3Schema, type BriefStateV3 } from '../../shared/briefSchema.js';
import { createEvidenceRetriever } from '../../server/concierge/retrieveEvidence.js';

/* Scenario list, before implementation:
 * - Clear recipient relations derive Male or Female plus Unisex across product types.
 * - Returned contrary-gender records are rejected even if search ignores filters.
 * - An explicit product-audience fact overrides a relationship default.
 * - An explicit but nonbinding or conflicting audience fact cannot silently
 *   disable the relationship default and leave the search unfiltered.
 * - Unknown or compound relationship text does not guess an audience.
 * - Conflicting recipients and unavailable live audience vocabulary fail closed.
 * - A retracted relationship cannot constrain a corrected active recipient.
 */

const evidence = { messageId: 'message-1', quote: 'for Dad', explicit: true, verified: true };
const vocabularyValues: Record<string, string[]> = {
  Catalog_ProductType: ['Wrist Watch', 'Bracelet', 'Earrings', 'Necklace'],
  Catalog_Gender: ['Male', 'Female', 'Unisex'],
};
const vocabulary = {
  get: async () => ({
    values: vocabularyValues,
    builtAt: '2026-10-14T00:00:00.000Z',
    hasValue: (attribute: string, value: string) =>
      (vocabularyValues[attribute] ?? []).includes(value),
    availableValues: (attribute: string) => vocabularyValues[attribute] ?? [],
    isFilterable: (attribute: string) => attribute in vocabularyValues,
  }),
  invalidate: () => {},
};
const state = (facts: unknown[]): BriefStateV3 =>
  briefStateV3Schema.parse({
    version: 3,
    missionId: 'mission-1',
    revision: 1,
    facts: facts.map((fact, index) => ({
      id: `fact-${index}`,
      status: 'active',
      revision: 1,
      createdAt: 'now',
      origin: 'spoken',
      certainty: 'explicit',
      strength: 'requirement',
      evidence,
      ...(fact as Record<string, unknown>),
    })),
    processedTurns: [],
    tombstones: [],
    events: [],
  });
const recipient = (text: string, patch: Record<string, unknown> = {}) => ({
  field: 'recipient',
  scope: { kind: 'recipient', key: text.toLowerCase().replaceAll(' ', '-') },
  strength: 'context',
  value: { kind: 'text', text },
  ...patch,
});
const productType = (value: string) => ({
  field: 'product_type',
  scope: { kind: 'mission', key: null },
  value: { kind: 'facet', attribute: 'Catalog_ProductType', values: [value], operator: 'any' },
});
const audience = (values: string[]) => ({
  field: 'product_audience',
  scope: { kind: 'mission', key: null },
  value: { kind: 'facet', attribute: 'Catalog_Gender', values, operator: 'any' },
});
const request = {
  source: 'prod_catalog',
  query: 'jewelry',
  count: 6,
  exactObjectIDs: null,
  missionId: 'mission-1',
  expectedRevision: 1,
  turnId: 'turn-1',
  target: null,
};

describe('recipient relationship audience default across jewellery', () => {
  it.each([
    ['Dad', 'Wrist Watch', 'Male'],
    ['my father', 'Bracelet', 'Male'],
    ['grandfather', 'Earrings', 'Male'],
    ['nephew', 'Necklace', 'Male'],
    ['for my nephew', 'Necklace', 'Male'],
    ["Dad's.", 'Bracelet', 'Male'],
    ['Mom', 'Wrist Watch', 'Female'],
    ['my aunt', 'Bracelet', 'Female'],
    ['niece', 'Earrings', 'Female'],
    ['sister', 'Necklace', 'Female'],
    ['son', 'Earrings', 'Male'],
  ])('filters %s %s to %s or Unisex', async (relation, category, gender) => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([productType(category), recipient(relation)]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.effectiveFilters).toContainEqual({
      field: 'Catalog_Gender',
      operator: 'in',
      value: [gender, 'Unisex'],
    });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.arrayContaining([
          { field: 'Catalog_Gender', operator: 'in', value: [gender, 'Unisex'] },
        ]),
      }),
    );
  });

  it('uses the accepted recipient key when its description also mentions the shopper', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const dad = recipient('Gift for dad; mom is helping shop', {
      scope: { kind: 'recipient', key: 'dad' },
    });
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([productType('Wrist Watch'), dad]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.effectiveFilters).toContainEqual({
      field: 'Catalog_Gender',
      operator: 'in',
      value: ['Male', 'Unisex'],
    });
  });

  it('fails closed when the recipient key contradicts the exact recipient value', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const dad = recipient('Mom', { scope: { kind: 'recipient', key: 'dad' } });
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([productType('Wrist Watch'), dad]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.status).toBe('unsupported_constraint');
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ field: 'product_audience' }),
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('uses an explicit audience fact instead of inferring from the relationship', async () => {
    const retrieve = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([]),
      currentState: async () =>
        state([productType('Wrist Watch'), recipient('Dad'), audience(['Female', 'Unisex'])]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.effectiveFilters.filter((filter) => filter.field === 'Catalog_Gender')).toEqual([
      { field: 'Catalog_Gender', operator: 'in', value: ['Female', 'Unisex'] },
    ]);
  });

  it('fails closed when a stated audience preference would suppress the recipient default', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          productType('Wrist Watch'),
          recipient('Dad'),
          { ...audience(['Female', 'Unisex']), strength: 'preference' },
        ]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.status).toBe('unsupported_constraint');
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ field: 'product_audience' }),
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('fails closed when two active audience requirements conflict', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([
          productType('Bracelet'),
          recipient('Dad'),
          audience(['Male', 'Unisex']),
          audience(['Female', 'Unisex']),
        ]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.status).toBe('unsupported_constraint');
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ field: 'product_audience' }),
    );
    expect(search).not.toHaveBeenCalled();
  });

  it.each(['partner', 'Dad buying for Mom'])('does not guess from %s', async (relation) => {
    const retrieve = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([]),
      currentState: async () => state([productType('Bracelet'), recipient(relation)]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.effectiveFilters.some((filter) => filter.field === 'Catalog_Gender')).toBe(false);
  });

  it('fails closed for conflicting recipient relationships', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () =>
        state([productType('Bracelet'), recipient('Dad'), recipient('Mom')]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.status).toBe('unsupported_constraint');
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ field: 'product_audience' }),
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('fails closed when a clear audience cannot be validated against live vocabulary', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const retrieve = createEvidenceRetriever({
      search,
      currentState: async () => state([productType('Earrings'), recipient('Aunt')]),
    });
    const result = await retrieve(request);
    expect(result.status).toBe('unsupported_constraint');
    expect(result.unresolved).toContainEqual(
      expect.objectContaining({ field: 'product_audience' }),
    );
    expect(search).not.toHaveBeenCalled();
  });

  it('ignores a retracted old recipient when a new recipient is active', async () => {
    const retrieve = createEvidenceRetriever({
      search: vi.fn().mockResolvedValue([]),
      currentState: async () =>
        state([
          productType('Bracelet'),
          recipient('Dad', { status: 'retracted' }),
          recipient('Mom'),
        ]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.effectiveFilters).toContainEqual({
      field: 'Catalog_Gender',
      operator: 'in',
      value: ['Female', 'Unisex'],
    });
  });

  it('rejects a contrary-gender returned record for an accepted Dad recipient', async () => {
    const record = (objectID: string, gender: string, target: string) => ({
      objectID,
      Catalog_ProductType: 'Bracelet',
      Catalog_TitleDescription: `Bracelet ${objectID}`,
      Catalog_LongDescription: 'A bracelet with recorded audience.',
      Catalog_Condition: 'First Quality',
      Inventory_InStock: true,
      Pricing_ActivePrice: 99.99,
      Catalog_Gender: gender,
      Catalog_TargetConsumer: [target],
    });
    const retrieve = createEvidenceRetriever({
      search: vi
        .fn()
        .mockResolvedValue([record('FEMALE1', 'Female', 'Women'), record('MALE1', 'Male', 'Men')]),
      currentState: async () => state([productType('Bracelet'), recipient('Dad')]),
      vocabulary,
    });
    const result = await retrieve(request);
    expect(result.records.map((item) => item.objectID)).toEqual(['MALE1']);
  });
});
