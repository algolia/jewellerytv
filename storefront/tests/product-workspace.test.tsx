/*
 * Scenarios for the Compare facts display:
 * - Hide fields missing from every compared product.
 * - Keep a shared row when one product has a value and mark only the other as unrecorded.
 * - Use normalized catalogue fields rather than a fixed attribute checklist.
 */
// Distinct view contracts: comparison isn't a basket; images are real records.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { it, expect, vi } from 'vitest';
import { normalizeProduct } from '../src/catalog';
import { createBriefState, applyBriefOperations } from '../shared/briefState';
import type { BriefFactInput } from '../shared/briefSchema';
const mock = vi.hoisted(() => ({ state: {} as any }));
vi.mock('../src/ShoppingProvider', () => ({ useShopping: () => mock.state }));
import { ProductWorkspace } from '../src/ProductWorkspace';
import { VIEW_GUIDANCE } from '../src/concierge/EntryGuidance';
const pieces = [
  normalizeProduct({
    objectID: 'a',
    Catalog_TitleDescription: 'Necklace',
    Pricing_ActivePrice: 54.99,
    Media_Images: ['https://example.com/a.jpg'],
  }),
  normalizeProduct({
    objectID: 'b',
    Catalog_TitleDescription: 'Ring',
    Pricing_ActivePrice: 94.99,
    Media_Images: ['https://example.com/b.jpg'],
  }),
];
function budgetBrief(
  cents = 15000,
  operator: 'lt' | 'lte' = 'lte',
  basis: 'total' | 'per-item' = 'total',
  extra: BriefFactInput[] = [],
) {
  const brief = createBriefState('workspace-budget');
  const fact: BriefFactInput = {
    id: 'budget',
    field: 'budget',
    value: { kind: 'money', cents, currency: 'USD', operator, basis },
    scope: { kind: 'mission' },
    strength: 'requirement',
    status: 'active',
    origin: 'ui',
    evidence: { messageId: 'manual', quote: 'Manual budget', explicit: true, verified: true },
  };
  return applyBriefOperations(brief, {
    missionId: brief.missionId,
    expectedRevision: 0,
    turnId: 'manual',
    operations: [fact, ...extra].map((fact) => ({ type: 'add', fact })),
  });
}
function state(view: string) {
  return {
    brief: budgetBrief(),
    products: pieces.map((product) => ({ product, quantity: 1 })),
    selectionRecords: pieces,
    discoveries: [],
    displayIntro: '',
    activeView: view,
    compareIds: ['a', 'b'],
    refreshing: false,
    refreshError: '',
    setView: vi.fn(),
    refreshProducts: vi.fn(),
    toggleCompare: vi.fn(),
    pin: vi.fn(),
    remove: vi.fn(),
  };
}
it('omits comparison fields that are missing from every selected product', () => {
  mock.state = state('compare');
  const html = renderToStaticMarkup(<ProductWorkspace />);
  expect(html).toContain('a.jpg');
  expect(html).toContain('b.jpg');
  expect(html).not.toContain('Not recorded');
  expect(html).not.toContain('Brand');
  expect(html).not.toContain('Gemstone shape');
  expect(html).not.toContain('Gemstone dimensions');
  expect(html).not.toContain('Item subtotal');
  expect(html).not.toContain('Help me compare');
});
it('shows a missing value only when another compared product supplies that field', () => {
  const brand = normalizeProduct({
    objectID: 'brand',
    Catalog_TitleDescription: 'White gold necklace',
    Catalog_ProductType: 'Necklace',
    Catalog_Brand: 'JTV Collection',
    Catalog_JewelryMaterialNavigationName: ['Gold'],
    Catalog_JewelryMaterialNavigationPurity: ['14K'],
    Pricing_ActivePrice: 100,
  });
  const noBrand = normalizeProduct({
    objectID: 'no-brand',
    Catalog_TitleDescription: 'White gold chain',
    Catalog_ProductType: 'Necklace',
    Catalog_JewelryMaterialNavigationName: ['Gold'],
    Catalog_JewelryMaterialNavigationPurity: ['14K'],
    Pricing_ActivePrice: 120,
  });
  mock.state = {
    ...state('compare'),
    products: [
      { product: brand, quantity: 1 },
      { product: noBrand, quantity: 1 },
    ],
    selectionRecords: [brand, noBrand],
    compareIds: ['brand', 'no-brand'],
  };
  const html = renderToStaticMarkup(<ProductWorkspace />);
  expect(html.match(/<dt>Brand<\/dt>/g)).toHaveLength(2);
  expect(html).toContain('<dd>JTV Collection</dd>');
  expect(html).toContain('<dd>Not recorded</dd>');
  expect(html).not.toContain('Gemstone shape');
  expect(html).not.toContain('Gemstone dimensions');
});
it('keeps category-level conversation prose out of compact Discover product tiles', () => {
  mock.state = {
    ...state('discover'),
    displayIntro: 'Choose **blue** <script>bad</script>',
    discoveries: [{ title: 'Options', items: [{ product: pieces[0], why: '**Small** stone' }] }],
  };
  const html = renderToStaticMarkup(<ProductWorkspace />);
  expect(html).not.toContain('Choose');
  expect(html).not.toContain('Small');
  expect(html).not.toContain('**Small**');
  expect(html).not.toContain('<script>');
});

it('shows foreign-budget uncertainty without turning an inclusive USD boundary into a violation', () => {
  const foreign: BriefFactInput = {
    id: 'foreign',
    field: 'budget',
    value: { kind: 'money', cents: 10000, currency: 'GBP', operator: 'lt', basis: 'total' },
    scope: { kind: 'mission' },
    strength: 'requirement',
    status: 'active',
    origin: 'ui',
    evidence: { messageId: 'foreign', quote: 'GBP budget', explicit: true, verified: true },
  };
  mock.state = {
    ...state('compare'),
    brief: budgetBrief(14998, 'lte', 'total', [foreign]),
  };
  const html = renderToStaticMarkup(<ProductWorkspace />);
  expect(html).toContain('Under GBP 100.00 total: evidence or scope unavailable');
  expect(html).toContain('Needs verification');
  expect(html).not.toContain('Check against your brief');
  expect(html).not.toContain('Above your saved limit');
  expect(html).not.toContain('remains before other charges');
});
it('keeps the Discover, Compare and Save tab labels in the accepted order', () => {
  mock.state = state('discover');
  const html = renderToStaticMarkup(<ProductWorkspace />);
  const nav = html.match(/<nav class="pw-views"[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? '';
  expect(nav).toContain('>Discover</button>');
  expect(nav).toContain('>Compare</button>');
  expect(nav).toContain('>Save</button>');
});

it('explains the actual role of the active tab in one guidance line under the tab list', () => {
  const views = ['discover', 'compare', 'saved'] as const;
  for (const view of views) {
    mock.state = state(view);
    const html = renderToStaticMarkup(<ProductWorkspace />);
    const guidance = html.match(
      /<p class="pw-view-guidance" data-view="[a-z]+">([^<]*)<\/p>/,
    )?.[1];
    expect(guidance).toBe(VIEW_GUIDANCE[view]);
    expect(guidance).not.toMatch(/[—–]/);
    expect(html.indexOf('class="pw-view-guidance"')).toBeGreaterThan(
      html.indexOf('class="pw-views"'),
    );
  }
});

it('renders tab guidance in normal flow before cards, never covering them', () => {
  mock.state = {
    ...state('discover'),
    discoveries: [{ title: 'Options', items: [{ product: pieces[0] }] }],
  };
  const html = renderToStaticMarkup(<ProductWorkspace />);
  expect(html.indexOf('class="pw-view-guidance"')).toBeLessThan(
    html.indexOf('class="pw-discovery-groups"'),
  );
});

it('warns about a saved record conflicting with the only verified tentative budget', () => {
  const initial = createBriefState('tentative-only');
  const brief = applyBriefOperations(initial, {
    missionId: initial.missionId,
    expectedRevision: 0,
    turnId: 'spoken-limit',
    operations: [
      {
        type: 'add',
        fact: {
          id: 'tentative-budget',
          field: 'budget',
          value: {
            kind: 'money',
            cents: 5000,
            currency: 'USD',
            operator: 'lt',
            basis: 'unresolved',
          },
          scope: { kind: 'mission' },
          strength: 'requirement',
          status: 'tentative',
          origin: 'spoken',
          evidence: {
            messageId: 'spoken-limit',
            quote: 'under $50',
            explicit: true,
            verified: true,
          },
        },
      },
    ],
  });
  mock.state = { ...state('saved'), brief, budgetCents: null };
  const html = renderToStaticMarkup(<ProductWorkspace />);
  expect(html).toContain('Price conflicts with under $50.00');
  expect(html).toContain('Check against your brief');
});
