import { expect, test, type Page, type Route } from '@playwright/test';
import { RING, stubAgentTurn, type CatalogRecord } from './fixtures/agentStream';

/*
 * The facet funnel: a narrowing chip refines the shelf in place.
 *
 * The behavior this pins is Arijit's 2026-11-04 call — a chip tap is a filter
 * application, not a question to the agent. The tap fires exactly one client
 * search carrying the turn's own constraints with the selection ANDed on
 * top, the refined shelf replaces the grouped one, Back restores it, and no
 * agent completion is spent.
 *
 * The agent turn is scripted by `fixtures/agentStream`; the refine's Algolia
 * query is routed here, so the whole spec is hermetic. Refined cards are
 * asserted by href, not by text: the tile's label is the price, and the name
 * rides the image alt, which text filters do not see.
 */

const PANEL = 'div.jtv-concierge';
const COMPOSER = '.ais-ChatPrompt-textarea';
const CHIP = '.jtv-chat-narrow-chip';
const GROUP_TITLE = '.ais-ChatToolGroupedResults-groupTitle';

const refinedCard = (panel: ReturnType<Page['locator']>) =>
  panel.locator(`a.jtv-chat-card[href="/product/${'WHT01'}"]`);

const REFINED: CatalogRecord = {
  objectID: 'WHT01',
  Catalog_TitleDescription: 'White Gold Two-Tone Ring',
  Media_Images: ['data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'],
  Inventory_InStock: true,
  Pricing_ActivePrice: 129.99,
  Pricing_PriceRange: '$100 - $200',
};

const REFINE_FACETS = {
  Catalog_JewelryMaterialNavigationPurity: { '14K': 6, Sterling: 4 },
};

/** Routes the refine's client search: one result, plus the counts for the
 * funnel's next level. Returns the captured request bodies for assertions —
 * refine calls only (query text set, facet filters present); the storefront
 * grid and the starter chips share the same client and the same route. */
async function stubRefineSearch(page: Page): Promise<string[]> {
  const bodies: string[] = [];
  await page.route(/-dsn\.algolia\.net\/1\/indexes\/\*\/queries/, (route: Route) => {
    const body = route.request().postData() ?? '';
    let isRefine = false;
    try {
      const request = JSON.parse(body)?.requests?.[0];
      isRefine =
        request?.indexName === 'prod_catalog' && !!request?.query && !!request?.facetFilters;
    } catch {
      isRefine = false;
    }
    if (isRefine) bodies.push(body);
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        results: [
          {
            hits: [REFINED],
            nbHits: 1,
            facets: REFINE_FACETS,
          },
        ],
      }),
    });
  });
  return bodies;
}

async function openPanelAndAsk(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  const panel = page.locator(PANEL);
  await expect(panel).toHaveAttribute('data-open', 'true');
  const composer = panel.locator(COMPOSER);
  await composer.fill('Show me the two-tone ones');
  await composer.press('Enter');
  await expect(panel.locator('.jtv-chat-narrow-lead')).toHaveText('Narrow it down');
  return panel;
}

test('a chip tap refines in place: one client search, no agent turn', async ({ page }) => {
  await stubAgentTurn(page, {
    text: 'Two-tone runs deep.',
    query: 'two-tone rings',
    hits: [RING, REFINED],
    facets: {
      Catalog_JewelryMaterialNavigationColor: { White: 40, Yellow: 25 },
      Pricing_PriceRange: { '$100 - $200': 30, '$200 - $500': 12 },
    },
    groups: [{ title: 'Bands', objectIDs: ['XTP21', 'WHT01'] }],
  });
  const refineBodies = await stubRefineSearch(page);
  const panel = await openPanelAndAsk(page);

  const userBubbles = await panel.locator('.ais-ChatMessage').count();
  await panel.locator(CHIP, { hasText: 'White' }).first().click();

  /* The refine fires exactly one client search; the agent is never asked. */
  await expect(refinedCard(panel)).toBeVisible();
  expect(refineBodies).toHaveLength(1);

  /* The refine re-issues the turn's own query with the selection ANDed on
   * top, and mirrors the agent's in-stock filter. */
  const params = JSON.parse(refineBodies[0]).requests[0];
  expect(params.query).toBe('two-tone rings');
  expect(params.facetFilters).toEqual(['Catalog_JewelryMaterialNavigationColor:"White"']);
  expect(params.filters).toBe('Inventory_InStock:true AND NOT Catalog_Condition:"Pre-Owned"');

  /* The tap itself adds no shopper message and no reply. */
  expect(await panel.locator('.ais-ChatMessage').count()).toBe(userBubbles);

  /* The grouped shelf is replaced, not appended to. */
  await expect(panel.locator(GROUP_TITLE, { hasText: 'Bands' })).toHaveCount(0);

  /* The funnel deepens from the refine's own counts. */
  await expect(panel.locator(CHIP, { hasText: '14K' })).toBeVisible();
});

test('Back restores the grouped shelf and its chips', async ({ page }) => {
  await stubAgentTurn(page, {
    text: 'Two-tone runs deep.',
    query: 'two-tone rings',
    hits: [RING, REFINED],
    facets: {
      Catalog_JewelryMaterialNavigationColor: { White: 40, Yellow: 25 },
    },
    groups: [{ title: 'Bands', objectIDs: ['XTP21', 'WHT01'] }],
  });
  await stubRefineSearch(page);
  const panel = await openPanelAndAsk(page);

  await panel.locator(CHIP, { hasText: 'White' }).first().click();
  await expect(refinedCard(panel)).toBeVisible();

  await panel.getByRole('button', { name: 'Back to all' }).click();
  await expect(panel.locator(GROUP_TITLE, { hasText: 'Bands' })).toBeVisible();
  /* The original axes return; the funnel is gone, not paused. */
  await expect(panel.locator(CHIP, { hasText: 'Yellow' })).toBeVisible();
  await expect(panel.locator(CHIP, { hasText: '14K' })).toHaveCount(0);
});

test('a failed refine leaves the shelf standing', async ({ page }) => {
  await stubAgentTurn(page, {
    text: 'Two-tone runs deep.',
    query: 'two-tone rings',
    hits: [RING, REFINED],
    facets: { Catalog_JewelryMaterialNavigationColor: { White: 40, Yellow: 25 } },
    groups: [{ title: 'Bands', objectIDs: ['XTP21', 'WHT01'] }],
  });
  /* Abort every search host: the lite client fails over from -dsn.algolia.net
   * to algolia.net and then algolianet.com mirrors, so killing only one turns
   * the "failure" into a real successful query against the live catalogue. */
  await page.route(/indexes\/\*\/queries/, (route) => route.abort('failed'));
  const panel = await openPanelAndAsk(page);

  await panel.locator(CHIP, { hasText: 'White' }).first().click();
  /* The search client retries an aborted query a few times before the refine
   * gives up, so the restore lands after the backoff, not at once. When it
   * does, the grouped shelf is back and no skeleton is stuck on screen. */
  await expect(panel.locator(GROUP_TITLE, { hasText: 'Bands' })).toBeVisible({ timeout: 15000 });
  await expect(panel.locator('.jtv-chat-skeleton')).toHaveCount(0);
});
