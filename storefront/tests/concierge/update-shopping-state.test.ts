import { describe, expect, it } from 'vitest';
import { createBriefState, migrateBriefStateV2ToV3 } from '../../shared/briefState.js';
import {
  canonicalSha256,
  type ShoppingState,
  updateShoppingState as updateShoppingStateBase,
} from '../../shared/concierge/state/updateShoppingState.js';

// Every existing call site runs against the fixture vocabulary (the production
// client always supplies the live payload from /api/catalog-vocabulary). The
// explicit no-vocabulary behavior is covered in its own test below.
const updateShoppingState = (
  state: ShoppingState,
  input: unknown,
  message: { id: string; text: string },
  vocabulary = fixtureVocabulary,
) => updateShoppingStateBase(state, input, message, vocabulary);

const message = {
  id: 'm-current',
  text: 'Please make the budget up to $200 total, and use silver.',
};
// Fixture live vocabulary seeded from the verified Oct 2 index capture plus the
// probe-confirmed platinum/purity values. Writer validation runs against this,
// mirroring the /api/catalog-vocabulary payload the client uses in production.
const fixtureVocabulary = {
  values: {
    Catalog_ProductType: ['Ring', 'Earrings', 'Necklace', 'Bracelet', 'Pendant', 'Wrist Watch'],
    'Catalog_MaterialInformation.MaterialType': ['Gold', 'Silver', 'Platinum'],
    'Catalog_MaterialInformation.MaterialColor': [
      'White',
      'Yellow',
      'Blue',
      'Rose',
      'Two-tone',
      'Tri-color',
    ],
    'Catalog_MaterialInformation.MaterialPurity': ['Sterling', '10K', '14K', '18K', '24K', '950'],
    'Catalog_GemstoneInformation.GemstoneColorGroup': ['Blue', 'White', 'Red'],
    'Catalog_GemstoneInformationPrimary.GemstoneName': ['Diamond', 'Ruby'],
    Catalog_WatchPrimaryDialPrimaryColor: ['Blue'],
    Catalog_WatchBandType: ['Bracelet'],
    // Pearl vocabulary mirrors the live prod_catalog facet scan of 2026-10-12
    // (read-only probe, .checkpoint/runs/craig-task01-pearl-2026-10-12/): ten
    // distinct PearlFullName values on both pearl attributes.
    'Catalog_PearlInformationPrimary.PearlFullName': [
      'Akoya Pearl',
      'Baroque Pearl',
      'Blister Pearl',
      'Freshwater Pearl',
      'Genusis Pearls',
      'Kasumiga Pearl',
      'Mabe Pearl',
      'Saltwater Pearl',
      'South Sea Pearl',
      'Tahitian Pearl',
    ],
    'Catalog_PearlInformation.PearlFullName': [
      'Akoya Pearl',
      'Baroque Pearl',
      'Blister Pearl',
      'Freshwater Pearl',
      'Genusis Pearls',
      'Kasumiga Pearl',
      'Mabe Pearl',
      'Saltwater Pearl',
      'South Sea Pearl',
      'Tahitian Pearl',
    ],
    Catalog_NecklaceType: ['Chain', 'Pendant', 'Strand', 'Statement', 'Tennis', 'Beaded'],
    // Gender vocabulary mirrors the live prod_catalog facet scan of 2026-10-13
    // (read-only probe, .checkpoint/runs/mens-watch-2026-10-13/): exactly
    // Female, Male, Unisex on Catalog_Gender, whole index and wrist-watch
    // scope alike.
    Catalog_Gender: ['Female', 'Male', 'Unisex'],
  } as Record<string, string[]>,
  builtAt: '2026-10-08T00:00:00.000Z',
  hasValue: (attribute: string, value: string) =>
    (fixtureVocabulary.values[attribute] ?? []).includes(value),
  availableValues: (attribute: string) => fixtureVocabulary.values[attribute] ?? [],
  isFilterable: (attribute: string) => attribute in fixtureVocabulary.values,
};
const base = (): ShoppingState => ({ brief: createBriefState('mission-1'), receipts: [] });
const add = (operationId = 'op-1') => ({
  missionId: 'mission-1',
  expectedRevision: 0,
  operationId,
  sourceMessageId: message.id,
  operations: [
    {
      action: 'add',
      factIds: [],
      fact: {
        id: 'budget-1',
        field: 'budget',
        value: { kind: 'money', cents: 20000, currency: 'USD', operator: 'lte', basis: 'total' },
        scope: { kind: 'mission', key: null },
        strength: 'requirement',
        certainty: 'explicit',
      },
      sourceQuote: 'up to $200 total',
    },
  ],
});

describe('an add operation needs no factIds', () => {
  // Logged 2026-10-16: Agent Studio rejected the agent's call ("'factIds' is a required property")
  // in 4 of 51 test conversations. An add has no existing facts to name, so the field must be optional.
  it('applies an add that omits factIds, treating it as an empty list', async () => {
    const input = add();
    const { factIds: _omitted, ...operation } = input.operations[0];
    const { result } = await updateShoppingState(
      base(),
      { ...input, operations: [operation] },
      message,
    );
    expect(result.status).toBe('applied');
  });
});

/* Item-scope collision scenarios: same exact key can hold multiple facts; distinct keys
 * stay independent; differently cased live keys reject atomically across existing state,
 * tentative state and one operation batch; superseded keys do not reserve identity. */
const itemFact = (id: string, key: string, certainty: 'explicit' | 'tentative' = 'explicit') => ({
  id,
  field: 'budget',
  value: { kind: 'money', cents: 50000, currency: 'USD', operator: 'lte', basis: 'per_item' },
  scope: { kind: 'item', key },
  strength: 'requirement',
  certainty,
});
const itemOperation = (
  id: string,
  key: string,
  certainty: 'explicit' | 'tentative' = 'explicit',
) => ({
  action: 'add',
  factIds: [],
  fact: itemFact(id, key, certainty),
  sourceQuote: '$500',
});
const itemInput = (operationId: string, revision: number, operations: unknown[]) => ({
  missionId: 'mission-1',
  expectedRevision: revision,
  operationId,
  sourceMessageId: 'item-message',
  operations,
});
const itemMessage = { id: 'item-message', text: 'I have a $500 budget' };

describe('update_shopping_state domain callback', () => {
  it('rejects a case-colliding item scope against a live fact without changing state', async () => {
    const first = await updateShoppingState(
      base(),
      itemInput('first-item', 0, [itemOperation('fit-anchor', 'necklace-vg320p')]),
      itemMessage,
    );
    expect(first.result.status).toBe('applied');
    const result = await updateShoppingState(
      first.state,
      itemInput('case-drift', 1, [itemOperation('budget-drift', 'necklace-vg320P')]),
      itemMessage,
    );
    expect(result.result).toMatchObject({
      status: 'invalid_input',
      failure: { code: 'ITEM_SCOPE_KEY_COLLISION' },
    });
    expect(result.state).toBe(first.state);
    expect(result.state.brief.revision).toBe(1);
    expect(result.state.receipts).toHaveLength(1);
  });

  it('rejects colliding keys in one batch, including a tentative key', async () => {
    const original = base();
    const result = await updateShoppingState(
      original,
      itemInput('batch-collision', 0, [
        itemOperation('product-fit', 'necklace-vg320p', 'tentative'),
        itemOperation('budget', 'necklace-vg320P'),
      ]),
      itemMessage,
    );
    expect(result.result.failure?.code).toBe('ITEM_SCOPE_KEY_COLLISION');
    expect(result.state).toBe(original);
    expect(result.state.brief.facts).toEqual([]);
  });

  it('preserves exact item keys with multiple facts and keeps distinct items isolated', async () => {
    const result = await updateShoppingState(
      base(),
      itemInput('distinct-items', 0, [
        itemOperation('first', 'necklace-vg320p'),
        itemOperation('second', 'necklace-vg320p'),
        itemOperation('third', 'bracelet-rst2197'),
      ]),
      itemMessage,
    );
    expect(result.result.status).toBe('applied');
    expect(result.state.brief.facts.map((fact) => fact.scope.key)).toEqual([
      'necklace-vg320p',
      'necklace-vg320p',
      'bracelet-rst2197',
    ]);
  });
  it('applies an exact correction atomically and preserves unrelated facts', async () => {
    const first = await updateShoppingState(base(), add(), message);
    expect(first.result.status).toBe('applied');
    const correction = {
      ...add('op-2'),
      expectedRevision: 1,
      operations: [
        {
          action: 'replace',
          factIds: ['budget-1'],
          fact: {
            id: 'budget-2',
            field: 'budget',
            value: {
              kind: 'money',
              cents: 15000,
              currency: 'USD',
              operator: 'lte',
              basis: 'total',
            },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
          sourceQuote: 'budget up to $150 total',
        },
      ],
    };
    const next = await updateShoppingState(first.state, correction, {
      id: message.id,
      text: 'Actually, budget up to $150 total',
    });
    expect(next.result.status).toBe('applied');
    expect(next.state.brief.facts.find((f) => f.id === 'budget-1')?.status).toBe('superseded');
    expect(next.state.brief.facts.find((f) => f.id === 'budget-2')?.value).toMatchObject({
      kind: 'money',
      cents: 15000,
    });
  });

  it('rejects stale revisions without changing the brief', async () => {
    const current = await updateShoppingState(base(), add(), message);
    const stale = await updateShoppingState(
      current.state,
      { ...add('stale'), expectedRevision: 0 },
      message,
    );
    expect(stale.result.status).toBe('stale_revision');
    expect(stale.state.brief).toEqual(current.state.brief);
  });

  it('replays an exact operation and rejects a conflicting reuse', async () => {
    const first = await updateShoppingState(base(), add(), message);
    const replay = await updateShoppingState(first.state, add(), message);
    expect(replay.result.status).toBe('replayed');
    expect(replay.state.brief.revision).toBe(1);
    const conflict = await updateShoppingState(
      first.state,
      { ...add(), operations: [{ ...add().operations[0], sourceQuote: 'silver' }] },
      message,
    );
    expect(conflict.result.status).toBe('operation_conflict');
  });

  it('rejects forged evidence even when the message ID is current', async () => {
    const forged = {
      ...add(),
      operations: [{ ...add().operations[0], sourceQuote: '$999 total' }],
    };
    const result = await updateShoppingState(base(), forged, message);
    expect(result.result.status).toBe('invalid_input');
    expect(result.result.failure?.code).toBe('quote_mismatch');
  });

  it('retains an ambiguous budget as tentative, without inventing its basis', async () => {
    const input = {
      ...add('ambiguous'),
      operations: [
        {
          ...add().operations[0],
          fact: {
            ...add().operations[0].fact!,
            value: {
              kind: 'money',
              cents: 20000,
              currency: 'USD',
              operator: 'lte',
              basis: 'unresolved',
            },
          },
        },
      ],
    };
    const result = await updateShoppingState(base(), input, message);
    expect(result.result.status).toBe('applied');
    expect(result.state.brief.facts[0]).toMatchObject({
      status: 'tentative',
      value: { kind: 'money', basis: 'unresolved' },
    });
  });

  it('round trips every v3 typed value, component scope, context strength and per-item basis', async () => {
    const input = {
      missionId: 'mission-1',
      expectedRevision: 0,
      operationId: 'typed',
      sourceMessageId: 'typed-message',
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'recipient',
          fact: {
            id: 'recipient',
            field: 'recipient',
            value: { kind: 'text', text: 'sister' },
            scope: { kind: 'recipient', key: 'sister' },
            strength: 'context',
            certainty: 'tentative',
          },
        },
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'size',
          fact: {
            id: 'size',
            field: 'fit',
            value: { kind: 'measurement', value: 7, unit: 'ring_us', component: 'finger' },
            scope: { kind: 'component', key: 'ring' },
            strength: 'preference',
            certainty: 'explicit',
          },
        },
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'saved',
          fact: {
            id: 'saved',
            field: 'selection',
            value: {
              kind: 'product_ref',
              objectID: 'p1',
              sourceIndex: 'prod_catalog',
              relationship: 'saved',
            },
            scope: { kind: 'item', key: 'ring' },
            strength: 'context',
            certainty: 'explicit',
          },
        },
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'all silver',
          fact: {
            id: 'all',
            field: 'material',
            value: {
              kind: 'material_alternatives',
              alternatives: [
                { type: 'Gold', color: 'White', purity: null, plating: null },
                { type: 'Silver', color: null, purity: 'Sterling', plating: null },
              ],
            },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'around $200',
          fact: {
            id: 'around',
            field: 'budget',
            value: {
              kind: 'money',
              cents: 20000,
              currency: 'USD',
              operator: 'around',
              basis: 'per_item',
            },
            scope: { kind: 'mission', key: null },
            strength: 'preference',
            certainty: 'tentative',
          },
        },
      ],
    };
    const result = await updateShoppingState(base(), input, {
      id: 'typed-message',
      text: 'recipient size saved all silver around $200',
    });
    expect(result.result.status).toBe('applied');
    expect(result.state.brief.facts.map((f) => f.field)).toEqual([
      'recipient',
      'fit',
      'selection',
      'material',
      'budget',
    ]);
    expect(result.state.brief.facts.find((f) => f.id === 'size')?.scope.kind).toBe('component');
    expect(result.state.brief.facts.find((f) => f.id === 'around')?.value).toMatchObject({
      kind: 'money',
      operator: 'around',
      basis: 'per-item',
    });
    expect(result.state.brief.events).toHaveLength(1);
  });

  it('uses canonical SHA-256 and preserves v2 undo events during migration', async () => {
    expect(await canonicalSha256({})).toBe(
      '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    );
    const old = {
      ...createBriefState('mission-1'),
      events: [
        {
          revision: 1,
          turnId: 'turn-1',
          beforeFacts: [],
          beforeTombstones: [],
          resetEvidence: { messageId: 'm', quote: 'reset', explicit: true, verified: true },
        },
      ],
    };
    const migrated = migrateBriefStateV2ToV3(old);
    expect(migrated.version).toBe(3);
    expect(migrated.events).toHaveLength(1);
    expect(migrated.events[0].resetEvidence?.quote).toBe('reset');
  });

  it('returns the exact original state object for rejected operations', async () => {
    const original = base();
    const result = await updateShoppingState(
      original,
      { ...add(), operationId: 'bad', sourceMessageId: 'old' },
      message,
    );
    expect(result.result.status).toBe('invalid_input');
    expect(result.state).toBe(original);
  });
  it('rejects duplicate targets atomically', async () => {
    const first = await updateShoppingState(base(), add(), message);
    const result = await updateShoppingState(
      first.state,
      {
        ...add('dup'),
        expectedRevision: 1,
        operations: [
          {
            action: 'retract',
            factIds: ['budget-1', 'budget-1'],
            fact: null,
            sourceQuote: 'up to $200 total',
          },
        ],
      },
      message,
    );
    expect(result.result.status).toBe('invalid_input');
    expect(result.state).toBe(first.state);
    expect(result.state.brief.facts[0].status).toBe('active');
  });
  it('rejects live C1 facet aliases while accepting exact bounded identifiers', async () => {
    const make = (field: string, attribute: string, value: string) => ({
      ...add(`facet-${field}`),
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'facet',
          fact: {
            id: `f-${field}`,
            field,
            value: { kind: 'facet', attribute, values: [value], operator: 'any' },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    });
    expect(
      (
        await updateShoppingState(base(), make('material', 'material', 'silver'), {
          id: message.id,
          text: 'facet',
        })
      ).result.failure?.code,
    ).toBe('UNSUPPORTED_FACT_ENCODING');
    expect(
      (
        await updateShoppingState(base(), make('gemstone', 'gemstone color', 'Blue'), {
          id: message.id,
          text: 'facet',
        })
      ).result.failure?.code,
    ).toBe('UNSUPPORTED_FACT_ENCODING');
    expect(
      (
        await updateShoppingState(
          base(),
          make('gemstone', 'Catalog_GemstoneInformation.GemstoneColorGroup', 'Blue'),
          { id: message.id, text: 'facet' },
        )
      ).result.status,
    ).toBe('applied');
    expect(
      (
        await updateShoppingState(
          base(),
          make('gemstone', 'Catalog_GemstoneInformationPrimary.GemstoneName', 'Diamond'),
          { id: message.id, text: 'facet' },
        )
      ).result.status,
    ).toBe('applied');
  });
  it('keeps watch dial and band facts in their exact catalogue fields', async () => {
    const watchInput = (
      field: string,
      value: unknown,
      sourceQuote: string,
      operationId: string,
    ) => ({
      ...add(operationId),
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote,
          fact: {
            id: operationId,
            field,
            value,
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    });
    const dial = await updateShoppingState(
      base(),
      watchInput(
        'watch_dial_color',
        {
          kind: 'facet',
          attribute: 'Catalog_WatchPrimaryDialPrimaryColor',
          values: ['Blue'],
          operator: 'any',
        },
        'blue dial',
        'watch-dial',
      ),
      { id: message.id, text: 'blue dial' },
    );
    expect(dial.result.status).toBe('applied');
    expect(dial.state.brief.facts[0]).toMatchObject({
      field: 'watch_dial_color',
      value: { kind: 'facet', attribute: 'Catalog_WatchPrimaryDialPrimaryColor', values: ['Blue'] },
    });

    const band = await updateShoppingState(
      base(),
      watchInput(
        'watch_band_type',
        {
          kind: 'facet',
          attribute: 'Catalog_WatchBandType',
          values: ['Bracelet'],
          operator: 'any',
        },
        'metal bracelet',
        'watch-band',
      ),
      { id: message.id, text: 'metal bracelet' },
    );
    expect(band.result.status).toBe('applied');
    expect(band.state.brief.facts[0]).toMatchObject({
      field: 'watch_band_type',
      value: { kind: 'facet', attribute: 'Catalog_WatchBandType', values: ['Bracelet'] },
    });

    const material = await updateShoppingState(
      base(),
      watchInput(
        'watch_band_material',
        { kind: 'watch_band_family', family: 'metal' },
        'metal bracelet',
        'watch-metal',
      ),
      { id: message.id, text: 'metal bracelet' },
    );
    expect(material.result.status).toBe('applied');
    expect(material.state.brief.facts[0]).toMatchObject({
      field: 'watch_band_material',
      value: { kind: 'watch_band_family', family: 'metal' },
    });
  });
  it('rejects watch features encoded as gemstone or jewellery material facts', async () => {
    const gemstoneOnWatchField = {
      ...add('watch-as-gemstone'),
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'blue dial',
          fact: {
            id: 'watch-as-gemstone',
            field: 'watch_dial_color',
            value: {
              kind: 'facet',
              attribute: 'Catalog_GemstoneInformation.GemstoneColorGroup',
              values: ['Blue'],
              operator: 'any',
            },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    };
    expect(
      (
        await updateShoppingState(base(), gemstoneOnWatchField, {
          id: message.id,
          text: 'blue dial',
        })
      ).result.failure?.code,
    ).toBe('UNSUPPORTED_FACT_ENCODING');
    const invalidMaterial = {
      ...add('watch-material-facet'),
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'metal bracelet',
          fact: {
            id: 'watch-material-facet',
            field: 'watch_band_material',
            value: {
              kind: 'facet',
              attribute: 'Catalog_JewelryMaterialNavigationName',
              values: ['Steel'],
              operator: 'any',
            },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    };
    expect(
      (
        await updateShoppingState(base(), invalidMaterial, {
          id: message.id,
          text: 'metal bracelet',
        })
      ).result.failure?.code,
    ).toBe('UNSUPPORTED_FACT_ENCODING');
  });
  it('rejects product type text and accepts exact bounded catalogue types', async () => {
    const text = {
      ...add('text-type'),
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'facet',
          fact: {
            id: 'text-type',
            field: 'product_type',
            value: { kind: 'text', text: 'necklace' },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    };
    expect(
      (await updateShoppingState(base(), text, { id: message.id, text: 'facet' })).result.failure
        ?.code,
    ).toBe('UNSUPPORTED_FACT_ENCODING');
    for (const value of ['Necklace', 'Earrings', 'Bracelet', 'Ring', 'Pendant', 'Wrist Watch']) {
      const input = {
        ...add(`type-${value}`),
        operations: [
          {
            action: 'add',
            factIds: [],
            sourceQuote: 'facet',
            fact: {
              id: `type-${value}`,
              field: 'product_type',
              value: {
                kind: 'facet',
                attribute: 'Catalog_ProductType',
                values: [value],
                operator: 'any',
              },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
        ],
      };
      expect(
        (await updateShoppingState(base(), input, { id: message.id, text: 'facet' })).result.status,
      ).toBe('applied');
    }
    const orInput = {
      ...add('type-or'),
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'facet',
          fact: {
            id: 'or',
            field: 'product_type',
            value: {
              kind: 'facet',
              attribute: 'Catalog_ProductType',
              values: ['Necklace', 'Earrings'],
              operator: 'any',
            },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    };
    expect(
      (await updateShoppingState(base(), orInput, { id: message.id, text: 'facet' })).result.status,
    ).toBe('applied');
  });
  it('accepts exact no-ring and no-heart exclusions and rejects hard text exclusions', async () => {
    const make = (id: string, attribute: string, values: string[]) => ({
      ...add(id),
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'exclude',
          fact: {
            id,
            field: 'exclusion',
            value: { kind: 'facet', attribute, values, operator: 'none' },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    });
    const ring = await updateShoppingState(
      base(),
      make('no-ring', 'Catalog_ProductType', ['Ring']),
      { id: message.id, text: 'exclude' },
    );
    expect(ring.result.status).toBe('applied');
    const heart = await updateShoppingState(
      ring.state,
      { ...make('no-heart', 'Catalog_Motif', ['Heart']), expectedRevision: 1 },
      { id: message.id, text: 'exclude' },
    );
    expect(heart.result.status).toBe('applied');
    expect(heart.state.brief.facts).toHaveLength(2);
    const text = {
      ...add('text-exclusion'),
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'exclude',
          fact: {
            id: 'text-exclusion',
            field: 'exclusion',
            value: { kind: 'text', text: 'Skip rings' },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    };
    expect(
      (await updateShoppingState(base(), text, { id: message.id, text: 'exclude' })).result.failure
        ?.code,
    ).toBe('UNSUPPORTED_FACT_ENCODING');
  });
  it('accepts a material-colour exclusion facet and rejects unsupported colour values', async () => {
    const make = (id: string, values: string[], operator: 'none' | 'any' = 'none') => ({
      missionId: 'mission-1',
      expectedRevision: 0,
      operationId: id,
      sourceMessageId: message.id,
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'exclude colour',
          fact: {
            id,
            field: 'exclusion',
            value: {
              kind: 'facet',
              attribute: 'Catalog_MaterialInformation.MaterialColor',
              values,
              operator,
            },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    });
    const applied = await updateShoppingState(base(), make('no-yellow', ['Yellow']), {
      id: message.id,
      text: 'exclude colour',
    });
    expect(applied.result.status).toBe('applied');
    const twoTone = await updateShoppingState(
      applied.state,
      { ...make('no-two-tone', ['Two-tone']), expectedRevision: 1 },
      { id: message.id, text: 'exclude colour' },
    );
    expect(twoTone.result.status).toBe('applied');
    const unknownColour = await updateShoppingState(base(), make('no-chartreuse', ['Chartreuse']), {
      id: message.id,
      text: 'exclude colour',
    });
    // Chartreuse does not exist in the live colour vocabulary — rejected with
    // the specific live-vocabulary code rather than the generic encoding one.
    expect(unknownColour.result.failure?.code).toBe('VALUE_NOT_IN_LIVE_VOCABULARY');
    const wrongOperator = await updateShoppingState(base(), make('yellow-any', ['Yellow'], 'any'), {
      id: message.id,
      text: 'exclude colour',
    });
    expect(wrongOperator.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });
  it('accepts a gemstone-colour exclusion facet, validates values against the live vocabulary and requires operator none', async () => {
    const make = (id: string, values: string[], operator: 'none' | 'any' = 'none') => ({
      missionId: 'mission-1',
      expectedRevision: 0,
      operationId: id,
      sourceMessageId: message.id,
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'exclude colour',
          fact: {
            id,
            field: 'exclusion',
            value: {
              kind: 'facet',
              attribute: 'Catalog_GemstoneInformation.GemstoneColorGroup',
              values,
              operator,
            },
            scope: { kind: 'mission', key: null },
            strength: 'requirement',
            certainty: 'explicit',
          },
        },
      ],
    });
    const applied = await updateShoppingState(base(), make('no-blue-red', ['Blue', 'Red']), {
      id: message.id,
      text: 'exclude colour',
    });
    expect(applied.result.status).toBe('applied');
    const unknown = await updateShoppingState(base(), make('no-chartreuse', ['Chartreuse']), {
      id: message.id,
      text: 'exclude colour',
    });
    expect(unknown.result.failure?.code).toBe('VALUE_NOT_IN_LIVE_VOCABULARY');
    const wrongOperator = await updateShoppingState(base(), make('blue-any', ['Blue'], 'any'), {
      id: message.id,
      text: 'exclude colour',
    });
    expect(wrongOperator.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });
  it('accepts an empty structural operation list but returns a retryable no-op failure', async () => {
    const empty = {
      missionId: 'mission-1',
      expectedRevision: 0,
      operationId: 'retry-me',
      sourceMessageId: message.id,
      operations: [],
    };
    const original = base();
    const first = await updateShoppingState(original, empty, message);
    expect(first.result.failure?.code).toBe('NO_OPERATIONS');
    expect(first.state).toBe(original);
    expect(first.state.receipts).toHaveLength(0);
    const corrected = await updateShoppingState(first.state, { ...add('retry-me') }, message);
    expect(corrected.result.status).toBe('applied');
  });
  it('enforces strict action and scope shapes before mutation', async () => {
    const malformed = [
      { ...add('bad-add'), operations: [{ ...add().operations[0], factIds: ['unexpected'] }] },
      {
        ...add('bad-retract'),
        operations: [
          { action: 'retract', factIds: [], fact: null, sourceQuote: 'up to $200 total' },
        ],
      },
      {
        ...add('bad-scope'),
        operations: [
          {
            ...add().operations[0],
            fact: { ...add().operations[0].fact!, scope: { kind: 'mission', key: 'wrong' } },
          },
        ],
      },
    ];
    for (const input of malformed) {
      const result = await updateShoppingState(base(), input, message);
      expect(result.result.status).toBe('invalid_input');
      expect(result.state.brief.revision).toBe(0);
    }
  });
  it('preserves an exact material alternatives union and strength', async () => {
    const input = {
      missionId: 'mission-1',
      expectedRevision: 0,
      operationId: 'materials',
      sourceMessageId: 'materials',
      operations: [
        {
          action: 'add',
          factIds: [],
          sourceQuote: 'silver or white gold',
          fact: {
            id: 'materials',
            field: 'material',
            value: {
              kind: 'material_alternatives',
              alternatives: [
                {
                  type: 'Silver',
                  color: null,
                  purity: 'Sterling',
                  plating: { presence: 'forbidden', purity: null },
                },
                { type: 'Gold', color: 'White', purity: null, plating: null },
              ],
            },
            scope: { kind: 'mission', key: null },
            strength: 'preference',
            certainty: 'explicit',
          },
        },
      ],
    };
    const result = await updateShoppingState(base(), input, {
      id: 'materials',
      text: 'silver or white gold',
    });
    expect(result.result.status).toBe('applied');
    expect(result.state.brief.facts[0].value).toMatchObject({ kind: 'material_alternatives' });
    expect(result.state.brief.facts[0].strength).toBe('preference');
  });
  it('rejects empty, duplicate, and invalid forbidden-plating alternatives', async () => {
    const cases = [
      [{ type: null, color: null, purity: null, plating: null }],
      [
        { type: 'Silver', color: null, purity: null, plating: null },
        { type: 'Silver', color: null, purity: null, plating: null },
      ],
      [
        {
          type: 'Silver',
          color: null,
          purity: null,
          plating: { presence: 'forbidden', purity: '925' },
        },
      ],
    ];
    for (const alternatives of cases) {
      const input = {
        missionId: 'mission-1',
        expectedRevision: 0,
        operationId: crypto.randomUUID(),
        sourceMessageId: 'm',
        operations: [
          {
            action: 'add',
            factIds: [],
            sourceQuote: 'materials',
            fact: {
              id: crypto.randomUUID(),
              field: 'material',
              value: { kind: 'material_alternatives', alternatives },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
        ],
      };
      const result = await updateShoppingState(base(), input, { id: 'm', text: 'materials' });
      expect(result.result.status).toBe('invalid_input');
    }
  });
});

describe('update_shopping_state with live vocabulary', () => {
  const materialAdd = (id: string, alternatives: unknown[], text: string) => ({
    missionId: 'mission-1',
    expectedRevision: 0,
    operationId: id,
    sourceMessageId: 'probe',
    operations: [
      {
        action: 'add',
        factIds: [],
        fact: {
          id,
          field: 'material',
          value: { kind: 'material_alternatives', alternatives },
          scope: { kind: 'mission', key: null },
          strength: 'requirement',
          certainty: 'explicit',
        },
        sourceQuote: text,
      },
    ],
  });

  it('accepts platinum — a value the frozen enum rejected but the index carries', async () => {
    const result = await updateShoppingState(
      base(),
      materialAdd(
        'plat-1',
        [{ type: 'Platinum', color: null, purity: '950', plating: null }],
        'platinum',
      ),
      { id: 'probe', text: 'platinum' },
    );
    expect(result.result.status).toBe('applied');
  });

  it('rejects a value absent from the live vocabulary with the specific code', async () => {
    const result = await updateShoppingState(
      base(),
      materialAdd(
        'bogus-1',
        [{ type: 'Unobtanium', color: null, purity: null, plating: null }],
        'unobtanium',
      ),
      { id: 'probe', text: 'unobtanium' },
    );
    expect(result.result.status).toBe('invalid_input');
    expect(result.result.failure?.code).toBe('VALUE_NOT_IN_LIVE_VOCABULARY');
  });

  it('refuses vocabulary-dependent facts when no vocabulary is supplied (fail closed)', async () => {
    const result = await updateShoppingStateBase(
      base(),
      materialAdd(
        'novocab-1',
        [{ type: 'Gold', color: null, purity: null, plating: null }],
        'gold',
      ),
      { id: 'probe', text: 'gold' },
      undefined,
    );
    expect(result.result.status).toBe('invalid_input');
    expect(result.result.failure?.code).toBe('VOCABULARY_UNAVAILABLE');
  });

  it('still applies money and text facts without vocabulary (fail-open for non-catalogue facts)', async () => {
    const result = await updateShoppingStateBase(base(), add(), message, undefined);
    expect(result.result.status).toBe('applied');
  });
});

/* Craig-feedback Task 01 (pearl evidence repair), red-first. The verified
 * failure: the agent expressed "pearl" as a required gemstone TEXT fact, which
 * no compiler can turn into a catalogue filter, and the shopper was told pearls
 * could not be verified although the live index carries explicit pearl facets.
 * Target behavior: a dedicated pearl field whose ONLY accepted encoding is a
 * facet on an exact pearl attribute with live-vocabulary values, plus a
 * necklace_type field for the classic-strand correction. */
const livePearlNames = fixtureVocabulary.values['Catalog_PearlInformationPrimary.PearlFullName'];
const pearlFact = (
  id: string,
  attribute: string,
  values: string[],
  overrides: Record<string, unknown> = {},
) => ({
  missionId: 'mission-1',
  expectedRevision: 0,
  operationId: id,
  sourceMessageId: message.id,
  operations: [
    {
      action: 'add',
      factIds: [],
      sourceQuote: 'pearl',
      fact: {
        id,
        field: 'pearl',
        value: { kind: 'facet', attribute, values, operator: 'any' },
        scope: { kind: 'mission', key: null },
        strength: 'requirement',
        certainty: 'explicit',
        ...overrides,
      },
    },
  ],
});
const necklaceTypeFact = (id: string, values: string[]) => ({
  missionId: 'mission-1',
  expectedRevision: 0,
  operationId: id,
  sourceMessageId: message.id,
  operations: [
    {
      action: 'add',
      factIds: [],
      sourceQuote: 'classic strands',
      fact: {
        id,
        field: 'necklace_type',
        value: { kind: 'facet', attribute: 'Catalog_NecklaceType', values, operator: 'any' },
        scope: { kind: 'mission', key: null },
        strength: 'requirement',
        certainty: 'explicit',
      },
    },
  ],
});

describe('pearl evidence facts (Craig Task 01)', () => {
  it('accepts a named primary pearl facet with the exact live value', async () => {
    const result = await updateShoppingState(
      base(),
      pearlFact('pearl-1', 'Catalog_PearlInformationPrimary.PearlFullName', ['Freshwater Pearl']),
      { id: message.id, text: 'pearl strand' },
    );
    expect(result.result.status).toBe('applied');
  });

  it('accepts a generic primary pearl expressed as every live pearl value', async () => {
    const result = await updateShoppingState(
      base(),
      pearlFact('pearl-2', 'Catalog_PearlInformationPrimary.PearlFullName', livePearlNames),
      { id: message.id, text: 'pearl necklace' },
    );
    expect(result.result.status).toBe('applied');
  });

  it('accepts a pearl accent on the component-level pearl attribute', async () => {
    const result = await updateShoppingState(
      base(),
      pearlFact('pearl-3', 'Catalog_PearlInformation.PearlFullName', ['Tahitian Pearl']),
      { id: message.id, text: 'necklace with tahitian pearl accents' },
    );
    expect(result.result.status).toBe('applied');
  });

  it('rejects a pearl requirement expressed as free text', async () => {
    const result = await updateShoppingState(
      base(),
      pearlFact('pearl-4', 'Catalog_PearlInformationPrimary.PearlFullName', ['Freshwater Pearl'], {
        value: { kind: 'text', text: 'Pearl' },
      }),
      { id: message.id, text: 'pearl strand' },
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('never forces pearls into a gemstone name attribute', async () => {
    const result = await updateShoppingState(
      base(),
      pearlFact('pearl-5', 'Catalog_GemstoneInformationPrimary.GemstoneName', ['Pearl']),
      { id: message.id, text: 'pearl strand' },
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('rejects a pearl value absent from the live vocabulary with the specific code', async () => {
    const result = await updateShoppingState(
      base(),
      pearlFact('pearl-6', 'Catalog_PearlInformationPrimary.PearlFullName', ['Imitation Pearl']),
      { id: message.id, text: 'pearl strand' },
    );
    expect(result.result.failure?.code).toBe('VALUE_NOT_IN_LIVE_VOCABULARY');
  });

  it('rejects pearl facet operators other than any', async () => {
    const result = await updateShoppingState(
      base(),
      pearlFact('pearl-7', 'Catalog_PearlInformationPrimary.PearlFullName', ['Freshwater Pearl'], {
        value: {
          kind: 'facet',
          attribute: 'Catalog_PearlInformationPrimary.PearlFullName',
          values: ['Freshwater Pearl'],
          operator: 'none',
        },
      }),
      { id: message.id, text: 'pearl strand' },
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('refuses pearl facts without a live vocabulary (fail closed)', async () => {
    const result = await updateShoppingStateBase(
      base(),
      pearlFact('pearl-8', 'Catalog_PearlInformationPrimary.PearlFullName', ['Freshwater Pearl']),
      { id: message.id, text: 'pearl strand' },
      undefined,
    );
    expect(result.result.status).toBe('invalid_input');
    expect(result.result.failure?.code).toBe('VOCABULARY_UNAVAILABLE');
  });

  it('keeps a ceiling budget as a ceiling: no invented target, minimum or substitution', async () => {
    const result = await updateShoppingState(
      base(),
      {
        missionId: 'mission-1',
        expectedRevision: 0,
        operationId: 'budget-ceiling-1',
        sourceMessageId: message.id,
        operations: [
          {
            action: 'add',
            factIds: [],
            sourceQuote: 'under $1,000',
            fact: {
              id: 'budget-1',
              field: 'budget',
              value: {
                kind: 'money',
                cents: 100000,
                currency: 'USD',
                operator: 'lt',
                basis: 'per_item',
              },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
        ],
      },
      { id: message.id, text: 'under $1,000' },
    );
    expect(result.result.status).toBe('applied');
    const brief = result.state.brief as { facts: Array<{ field: string; value: unknown }> };
    const budget = brief.facts.find((f) => f.field === 'budget') as {
      value: { operator: string; cents: number };
    };
    expect(budget.value.operator).toBe('lt');
    expect(budget.value.cents).toBe(100000);
  });
});

describe('necklace_type facts (Craig Task 01)', () => {
  it('accepts the classic-strand correction as a necklace_type facet', async () => {
    const result = await updateShoppingState(base(), necklaceTypeFact('strand-1', ['Strand']), {
      id: message.id,
      text: 'classic strands',
    });
    expect(result.result.status).toBe('applied');
  });

  it('rejects a necklace_type value absent from the live vocabulary', async () => {
    const result = await updateShoppingState(base(), necklaceTypeFact('strand-2', ['Rosary']), {
      id: message.id,
      text: 'classic strands',
    });
    expect(result.result.failure?.code).toBe('VALUE_NOT_IN_LIVE_VOCABULARY');
  });

  it('rejects necklace_type facets on any other catalogue attribute', async () => {
    const result = await updateShoppingState(
      base(),
      {
        ...necklaceTypeFact('strand-3', ['Strand']),
        operations: [
          {
            action: 'add',
            factIds: [],
            sourceQuote: 'classic strands',
            fact: {
              id: 'strand-3',
              field: 'necklace_type',
              value: {
                kind: 'facet',
                attribute: 'Catalog_ProductType',
                values: ['Strand'],
                operator: 'any',
              },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
        ],
      },
      { id: message.id, text: 'classic strands' },
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });
});

/* Craig-feedback Task 02 (men's product audience), red-first. The verified
 * failure: "I'm shopping for a men's watch under $1,000" staged JRJ802A,
 * PPR7845 and IRE616 — every one Catalog_Gender Female, Catalog_TargetConsumer
 * Women (captured exactly in
 * .checkpoint/runs/craig-feedback-verification-2026-10-12/watch/). The
 * accepted brief had no audience field at all, and PRODUCT_PROJECTION never
 * retrieved the audience attributes. Target behavior: a dedicated
 * product_audience field whose ONLY accepted encoding is a facet on the
 * authoritative Catalog_Gender attribute with live-vocabulary values. The
 * men's meaning (Male plus Unisex, never Female) is the agent's stated value
 * choice; the writer validates the values against the live vocabulary and the
 * compiler and record-level checks enforce the rest. "Men's" is product
 * audience scope on the record, never a guess about the shopper. */
const audienceMessage = { id: 'm-audience', text: "I'm shopping for a men's watch under $1,000." };
const audienceFact = (id: string, values: string[], overrides: Record<string, unknown> = {}) => ({
  missionId: 'mission-1',
  expectedRevision: 0,
  operationId: id,
  sourceMessageId: audienceMessage.id,
  operations: [
    {
      action: 'add',
      factIds: [],
      sourceQuote: "men's watch",
      fact: {
        id,
        field: 'product_audience',
        value: { kind: 'facet', attribute: 'Catalog_Gender', values, operator: 'any' },
        scope: { kind: 'mission', key: null },
        strength: 'requirement',
        certainty: 'explicit',
        ...overrides,
      },
    },
  ],
});

describe('product_audience facts (Craig Task 02)', () => {
  it("accepts an explicit men's scope as exact live Catalog_Gender values", async () => {
    const result = await updateShoppingState(
      base(),
      audienceFact('audience-1', ['Male', 'Unisex']),
      audienceMessage,
    );
    expect(result.result.status).toBe('applied');
    const brief = result.state.brief as { facts: Array<{ field: string; value: unknown }> };
    const audience = brief.facts.find((f) => f.field === 'product_audience') as {
      value: { kind: string; attribute: string; values: string[]; operator: string };
    };
    expect(audience.value).toMatchObject({
      kind: 'facet',
      attribute: 'Catalog_Gender',
      values: ['Male', 'Unisex'],
      operator: 'any',
    });
  });

  it("accepts a women's scope through the same field", async () => {
    const result = await updateShoppingState(
      base(),
      audienceFact('audience-2', ['Female', 'Unisex']),
      audienceMessage,
    );
    expect(result.result.status).toBe('applied');
  });

  it('accepts a single-value audience scope', async () => {
    const result = await updateShoppingState(
      base(),
      audienceFact('audience-3', ['Male']),
      audienceMessage,
    );
    expect(result.result.status).toBe('applied');
  });

  it('refuses an audience expressed as free text: text can never be an eligibility gate', async () => {
    const result = await updateShoppingState(
      base(),
      audienceFact('audience-4', ['Male'], { value: { kind: 'text', text: "men's" } }),
      audienceMessage,
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('refuses Catalog_TargetConsumer as the audience fact attribute', async () => {
    // Catalog_TargetConsumer is the record-level cross-check field, not the
    // accepted brief attribute: the writer keeps one authoritative encoding.
    const result = await updateShoppingState(
      base(),
      audienceFact('audience-5', ['Men'], {
        value: {
          kind: 'facet',
          attribute: 'Catalog_TargetConsumer',
          values: ['Men'],
          operator: 'any',
        },
      }),
      audienceMessage,
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('rejects an audience value absent from the live vocabulary with the specific code', async () => {
    // A plausible-but-wrong value ('Mens') must never silently match: the
    // vocabulary is the index's, live, not a frozen guess list.
    const result = await updateShoppingState(
      base(),
      audienceFact('audience-6', ['Mens']),
      audienceMessage,
    );
    expect(result.result.failure?.code).toBe('VALUE_NOT_IN_LIVE_VOCABULARY');
  });

  it('rejects audience facets on any other catalogue attribute', async () => {
    const result = await updateShoppingState(
      base(),
      audienceFact('audience-7', ['Male'], {
        value: {
          kind: 'facet',
          attribute: 'Catalog_ProductType',
          values: ['Male'],
          operator: 'any',
        },
      }),
      audienceMessage,
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('rejects audience operators other than any', async () => {
    const result = await updateShoppingState(
      base(),
      audienceFact('audience-8', ['Male'], {
        value: { kind: 'facet', attribute: 'Catalog_Gender', values: ['Male'], operator: 'none' },
      }),
      audienceMessage,
    );
    expect(result.result.failure?.code).toBe('UNSUPPORTED_FACT_ENCODING');
  });

  it('refuses audience facts without a live vocabulary (fail closed)', async () => {
    const result = await updateShoppingStateBase(
      base(),
      audienceFact('audience-9', ['Male', 'Unisex']),
      audienceMessage,
      undefined,
    );
    expect(result.result.status).toBe('invalid_input');
    expect(result.result.failure?.code).toBe('VOCABULARY_UNAVAILABLE');
  });

  it('carries the accepted budget basis untouched beside the audience fact', async () => {
    // Craig's captured input recorded basis 'total'. The writer preserves the
    // accepted basis exactly; it never silently re-encodes a total-look budget
    // or a per-item ceiling. What the bound means downstream is the compiler's
    // contract, asserted in the retrieval tests.
    const result = await updateShoppingState(
      base(),
      {
        missionId: 'mission-1',
        expectedRevision: 0,
        operationId: 'audience-budget-1',
        sourceMessageId: audienceMessage.id,
        operations: [
          {
            action: 'add',
            factIds: [],
            sourceQuote: "men's watch",
            fact: {
              id: 'audience-budget',
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
              id: 'budget-total',
              field: 'budget',
              value: {
                kind: 'money',
                cents: 100000,
                currency: 'USD',
                operator: 'lte',
                basis: 'total',
              },
              scope: { kind: 'mission', key: null },
              strength: 'requirement',
              certainty: 'explicit',
            },
          },
        ],
      },
      audienceMessage,
    );
    expect(result.result.status).toBe('applied');
    const brief = result.state.brief as { facts: Array<{ field: string; value: unknown }> };
    const budget = brief.facts.find((f) => f.field === 'budget') as {
      value: { basis: string; operator: string; cents: number };
    };
    expect(budget.value).toMatchObject({ basis: 'total', operator: 'lte', cents: 100000 });
    expect(brief.facts.filter((f) => f.field === 'product_audience')).toHaveLength(1);
  });
});

/* WRITER-GATE lane 2026-10-14 (sister-fix-retrieval), red-first. Proven failure
 * (.checkpoint/runs/sister-fix-retrieval-2026-10-14/DIAGNOSIS.md): the P4
 * unpierced-ears correction was written as an active requirement+explicit
 * wearability TEXT fact. compile() has no branch for that encoding, so every
 * later prod_catalog search returned unsupported_constraint with zero records
 * until the fact was retracted. Target behavior: the writer refuses the whole
 * class up front with a structured, agent-actionable code naming the supported
 * alternatives, while preference strength, context strength and tentative
 * certainty stay accepted (the compiler skips them by design). */
const gateMessage = {
  id: 'm-gate',
  text: 'her ears are not pierced and clip-ons hurt',
};
const gateInput = (operationId: string, fact: Record<string, unknown>) => ({
  missionId: 'mission-1',
  expectedRevision: 0,
  operationId,
  sourceMessageId: gateMessage.id,
  operations: [
    {
      action: 'add',
      factIds: [],
      sourceQuote: gateMessage.text,
      fact,
    },
  ],
});
const gateFact = (overrides: Record<string, unknown> = {}) => ({
  id: 'gate-fact',
  field: 'wearability',
  value: { kind: 'text', text: 'ears not pierced; clip-on earrings hurt' },
  scope: { kind: 'mission', key: null },
  strength: 'requirement',
  certainty: 'explicit',
  ...overrides,
});
const gateValue = (value: Record<string, unknown>, overrides: Record<string, unknown> = {}) =>
  gateFact({ value, ...overrides });

describe('requirement encoding classification gate (sister-fix 2026-10-14)', () => {
  it('refuses an explicit wearability requirement as text with a structured, actionable code', async () => {
    const original = base();
    const result = await updateShoppingState(
      original,
      gateInput('gate-1', gateFact()),
      gateMessage,
    );
    expect(result.result.status).toBe('invalid_input');
    expect(result.result.failure?.code).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    expect(result.result.failure?.message).toContain('wearability');
    expect(result.result.failure?.message).toContain('preference');
    expect(result.result.failure?.message).toContain('tentative');
    // Structured outcome, never an uncaught error: the original state object is
    // returned untouched so the agent can re-encode and retry.
    expect(result.state).toBe(original);
    expect(result.state.brief.revision).toBe(0);
  });

  it('accepts the same wearability meaning as preference strength', async () => {
    const result = await updateShoppingState(
      base(),
      gateInput('gate-2', gateFact({ strength: 'preference' })),
      gateMessage,
    );
    expect(result.result.status).toBe('applied');
  });

  it('accepts the same wearability meaning as a tentative requirement', async () => {
    const result = await updateShoppingState(
      base(),
      gateInput('gate-3', gateFact({ certainty: 'tentative' })),
      gateMessage,
    );
    expect(result.result.status).toBe('applied');
  });

  it('refuses explicit text requirements on fields the compiler can never resolve', async () => {
    for (const field of ['condition', 'budget', 'fit', 'material']) {
      const result = await updateShoppingState(
        base(),
        gateInput(`gate-text-${field}`, gateFact({ id: `gate-${field}`, field })),
        gateMessage,
      );
      expect(result.result.failure?.code, field).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    }
  });

  it('refuses explicit measurement and product_ref requirements on un-compilable fields', async () => {
    const measurement = await updateShoppingState(
      base(),
      gateInput(
        'gate-measurement',
        gateValue(
          { kind: 'measurement', value: 7, unit: 'mm', component: null },
          { id: 'gate-measurement', field: 'material' },
        ),
      ),
      gateMessage,
    );
    expect(measurement.result.failure?.code).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    const productRef = await updateShoppingState(
      base(),
      gateInput(
        'gate-ref',
        gateValue(
          {
            kind: 'product_ref',
            objectID: 'p1',
            sourceIndex: 'prod_catalog',
            relationship: 'saved',
          },
          { id: 'gate-ref', field: 'wearability' },
        ),
      ),
      gateMessage,
    );
    expect(productRef.result.failure?.code).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
  });

  it('still accepts supported facet, exact USD money and context-field requirements', async () => {
    const facet = await updateShoppingState(
      base(),
      gateInput(
        'gate-facet-ok',
        gateValue(
          {
            kind: 'facet',
            attribute: 'Catalog_GemstoneInformation.GemstoneColorGroup',
            values: ['Blue'],
            operator: 'any',
          },
          { id: 'gate-facet-ok', field: 'gemstone' },
        ),
      ),
      gateMessage,
    );
    expect(facet.result.status).toBe('applied');
    const money = await updateShoppingState(
      base(),
      gateInput(
        'gate-money-ok',
        gateValue(
          { kind: 'money', cents: 20000, currency: 'USD', operator: 'lte', basis: 'total' },
          { id: 'gate-money-ok', field: 'budget' },
        ),
      ),
      gateMessage,
    );
    expect(money.result.status).toBe('applied');
    // design is a compiler-skipped context field: its text requirement never
    // reaches a compile branch, so the gate must not refuse it.
    const design = await updateShoppingState(
      base(),
      gateInput(
        'gate-design-ok',
        gateValue(
          { kind: 'text', text: 'layered chains' },
          { id: 'gate-design-ok', field: 'design' },
        ),
      ),
      gateMessage,
    );
    expect(design.result.status).toBe('applied');
    // selection is the explicit single-focus carrier for the presentation
    // contract. Like design, it is compiler-skipped context, never a search
    // filter, so the writer accepts its text requirement.
    const selection = await updateShoppingState(
      base(),
      gateInput(
        'gate-selection-ok',
        gateValue(
          { kind: 'text', text: 'the shopper wants to see only solitaire rings' },
          { id: 'gate-selection-ok', field: 'selection' },
        ),
      ),
      gateMessage,
    );
    expect(selection.result.status).toBe('applied');
  });

  it('refuses explicit money requirements the compiler cannot use and accepts the defused encodings', async () => {
    const around = await updateShoppingState(
      base(),
      gateInput(
        'gate-around',
        gateValue(
          { kind: 'money', cents: 20000, currency: 'USD', operator: 'around', basis: 'total' },
          { id: 'gate-around', field: 'budget' },
        ),
      ),
      gateMessage,
    );
    expect(around.result.failure?.code).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    const foreign = await updateShoppingState(
      base(),
      gateInput(
        'gate-gbp',
        gateValue(
          { kind: 'money', cents: 15000, currency: 'GBP', operator: 'lte', basis: 'total' },
          { id: 'gate-gbp', field: 'budget' },
        ),
      ),
      gateMessage,
    );
    expect(foreign.result.failure?.code).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    const preference = await updateShoppingState(
      base(),
      gateInput(
        'gate-around-pref',
        gateValue(
          { kind: 'money', cents: 20000, currency: 'USD', operator: 'around', basis: 'total' },
          { id: 'gate-around-pref', field: 'budget', strength: 'preference' },
        ),
      ),
      gateMessage,
    );
    expect(preference.result.status).toBe('applied');
  });

  it('refuses a multi-value necklace_type facet requirement: the OR tail is pearl and gemstone only', async () => {
    const multi = await updateShoppingState(
      base(),
      gateInput(
        'gate-strand-multi',
        gateValue(
          {
            kind: 'facet',
            attribute: 'Catalog_NecklaceType',
            values: ['Strand', 'Chain'],
            operator: 'any',
          },
          { id: 'gate-strand-multi', field: 'necklace_type' },
        ),
      ),
      gateMessage,
    );
    expect(multi.result.failure?.code).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    const single = await updateShoppingState(
      base(),
      gateInput(
        'gate-strand-single',
        gateValue(
          { kind: 'facet', attribute: 'Catalog_NecklaceType', values: ['Strand'], operator: 'any' },
          { id: 'gate-strand-single', field: 'necklace_type' },
        ),
      ),
      gateMessage,
    );
    expect(single.result.status).toBe('applied');
  });

  it('refuses fit measurements outside the size mapping and accepts the supported units', async () => {
    for (const unit of ['ring_uk', 'unknown']) {
      const result = await updateShoppingState(
        base(),
        gateInput(
          `gate-fit-${unit}`,
          gateValue(
            { kind: 'measurement', value: 7, unit, component: null },
            { id: `gate-fit-${unit}`, field: 'fit' },
          ),
        ),
        gateMessage,
      );
      expect(result.result.failure?.code, unit).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    }
    const ring = await updateShoppingState(
      base(),
      gateInput(
        'gate-fit-ring',
        gateValue(
          { kind: 'measurement', value: 7, unit: 'ring_us', component: null },
          { id: 'gate-fit-ring', field: 'fit' },
        ),
      ),
      gateMessage,
    );
    expect(ring.result.status).toBe('applied');
  });

  it('refuses multi-value watch facets and gemstone all-operator requirements', async () => {
    const multiDial = await updateShoppingState(
      base(),
      gateInput(
        'gate-dial-multi',
        gateValue(
          {
            kind: 'facet',
            attribute: 'Catalog_WatchPrimaryDialPrimaryColor',
            values: ['Blue', 'White'],
            operator: 'any',
          },
          { id: 'gate-dial-multi', field: 'watch_dial_color' },
        ),
      ),
      gateMessage,
    );
    expect(multiDial.result.failure?.code).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    const allGem = await updateShoppingState(
      base(),
      gateInput(
        'gate-gem-all',
        gateValue(
          {
            kind: 'facet',
            attribute: 'Catalog_GemstoneInformation.GemstoneColorGroup',
            values: ['Blue', 'White'],
            operator: 'all',
          },
          { id: 'gate-gem-all', field: 'gemstone' },
        ),
      ),
      gateMessage,
    );
    expect(allGem.result.failure?.code).toBe('UNSUPPORTED_REQUIREMENT_ENCODING');
    // Controls: single-value watch facets and gemstone none-operator exclusions
    // compile today and must keep compiling.
    const singleDial = await updateShoppingState(
      base(),
      gateInput(
        'gate-dial-single',
        gateValue(
          {
            kind: 'facet',
            attribute: 'Catalog_WatchPrimaryDialPrimaryColor',
            values: ['Blue'],
            operator: 'any',
          },
          { id: 'gate-dial-single', field: 'watch_dial_color' },
        ),
      ),
      gateMessage,
    );
    expect(singleDial.result.status).toBe('applied');
    const noneGem = await updateShoppingState(
      base(),
      gateInput(
        'gate-gem-none',
        gateValue(
          {
            kind: 'facet',
            attribute: 'Catalog_GemstoneInformation.GemstoneColorGroup',
            values: ['Blue'],
            operator: 'none',
          },
          { id: 'gate-gem-none', field: 'gemstone' },
        ),
      ),
      gateMessage,
    );
    expect(noneGem.result.status).toBe('applied');
  });
});
