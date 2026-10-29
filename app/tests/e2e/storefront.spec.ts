import { test, expect, type Page } from '@playwright/test';
import fixtures from '../../src/shared/catalog/fixtures.json' with { type: 'json' };
import { installManualAgentStream, stubAgentTurn } from './fixtures/agentStream';

/* The retired `/api/search` proxy is gone: `src/shared/client.ts` queries
 * Algolia straight from the browser, so the fixture intercepts the multi-query
 * endpoint the lite client posts to. */
const QUERIES = '/1/indexes/*/queries';

const record = fixtures.records.find((item) => item.objectID === 'MFP256C')!;
const size = record.Inventory_AvailableSkuSizes![0];
const sizes = record.Inventory_AvailableSkuSizes!;
const noResults = 'zzzz-no-jewelry-fixture-49381';
async function fixtureApi(page: Page) {
  await page.route((url) => url.pathname === QUERIES, async (route) => {
    const body = route.request().postDataJSON();
    const results = body.requests.map((request: Record<string, unknown>) => {
      /* The lite client flattens `params` into the request; older callers
       * still nest it. Read whichever arrived. */
      const params = (request.params as Record<string, unknown>) || request;
      const empty = String(params.query || '').includes(noResults);
      return {
        hits: empty ? [] : [record],
        nbHits: empty ? 0 : 1,
        page: 0,
        nbPages: empty ? 0 : 1,
        hitsPerPage: 24,
        processingTimeMS: 1,
        query: String(params.query || ''),
        exhaustiveNbHits: true,
        facets: {
          Pricing_PriceRange: { '$50 - $100': 1 },
          Inventory_AvailableSkuSizes: Object.fromEntries(sizes.map((s) => [s, 1])),
          Catalog_BrandNavigationName: { 'Moissanite Fire': 1 },
        },
        facets_stats: { Pricing_ActivePrice: { min: 94.99, max: 94.99, avg: 94.99, sum: 94.99 } },
        renderingContent: {},
      };
    });
    await route.fulfill({ json: { results } });
  });
  /* The single-record read is a direct Algolia getObject now, not the retired
   * /api/products/:id. Mocking the dead route is what let a broken product
   * page pass this suite: the route 404s into the SPA shell, which answers
   * 200 with index.html, so the page failed on JSON parsing instead. */
  await page.route(/\/1\/indexes\/prod_catalog\/[^/?]+$/, (route) =>
    route.fulfill({ json: record }),
  );
  // Any accidental turn fails visibly and never reaches the live agent. The
  // panel posts straight to Agent Studio now, so that is what we intercept.
  await stubAgentTurn(page, { errorText: 'Live model calls disabled in fixture browser tests' });
}
async function openFacet(page: Page, name: string) {
  if (await page.getByRole('button', { name: 'Filter & Sort', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Filter & Sort', exact: true }).click();
  const facet = page
    .locator('details.facet')
    .filter({ has: page.locator('summary', { hasText: new RegExp(`^${name}$`) }) });
  if ((await facet.getAttribute('open')) === null) await facet.locator('summary').click();
  return facet;
}
async function assertNoOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
}

test.beforeEach(async ({ page }) => fixtureApi(page));

test('demo diagnostics stay hidden unless explicitly requested', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Demo diagnostics', { exact: true })).toHaveCount(0);
  await page.goto('/?debug=1');
  await expect(page.getByText('Demo diagnostics', { exact: true })).toBeVisible();
});

test('price and available size survive refresh and exact product return', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    if (request.url().includes(QUERIES)) requests.push(request.postDataJSON());
  });
  await page.goto('/category/rings');
  await expect(page.locator('.results .product-card')).toHaveCount(1);
  const price = await openFacet(page, 'Price');
  await price.getByRole('checkbox', { name: /\$50 - \$100/ }).check();
  const ringSize = await openFacet(page, 'Ring Size');
  await ringSize
    .locator('label')
    .filter({ has: page.locator('span', { hasText: new RegExp(`^${size}$`) }) })
    .getByRole('checkbox')
    .check();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('f'))
    .toContain('Inventory_AvailableSkuSizes');
  const listingUrl = page.url();
  const refinements = JSON.parse(new URL(listingUrl).searchParams.get('f')!);
  expect(refinements.Pricing_PriceRange).toEqual(['$50 - $100']);
  expect(refinements.Inventory_AvailableSkuSizes).toEqual([size]);
  await page.reload();
  await expect(page.locator('.results .product-card')).toHaveCount(1);
  const priceAfter = await openFacet(page, 'Price');
  await expect(priceAfter.getByRole('checkbox', { name: /\$50 - \$100/ })).toBeChecked();
  const sizeAfter = await openFacet(page, 'Ring Size');
  await expect(
    sizeAfter
      .locator('label')
      .filter({ has: page.locator('span', { hasText: new RegExp(`^${size}$`) }) })
      .getByRole('checkbox'),
  ).toBeChecked();
  await page.locator('.results .product-link').first().click();
  await expect(page).toHaveURL(/\/product\/MFP256C/);
  await expect(page.locator('.product-info h1')).toContainText('DEW');
  const productUrl = page.url();
  await page.goto(productUrl); // Direct load has no router return state.
  await page.getByRole('link', { name: 'Back to results', exact: true }).click();
  await expect(page).toHaveURL(listingUrl);
  await page.locator('.results .product-link').first().click();
  await page.goBack();
  await expect(page).toHaveURL(listingUrl);
  expect(JSON.stringify(requests)).toContain('Pricing_PriceRange');
  expect(JSON.stringify(requests)).toContain('Inventory_AvailableSkuSizes');
  await assertNoOverflow(page);
});

test('exact style shows its family and only captured available sizes', async ({ page }) => {
  await page.goto('/product/MFP256C');
  await expect(page.getByText('Item MFP256C · Family MFP256', { exact: true })).toBeVisible();
  await expect(page.locator('.size-options button')).toHaveText(
    record.Inventory_AvailableSkuSizeNames!,
  );
  await page.locator('.size-options button').first().click();
  await expect(page.locator('.size-options button').first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.product-facts').first()).toContainText(
    'Actual moissanite weight is 1.50ctw.',
  );
  await assertNoOverflow(page);
});

test('no results is explicit and search can recover', async ({ page }) => {
  await page.goto(`/search?q=${noResults}`);
  await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search jewelry' }).fill('moissanite');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.results .product-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'No products found' })).toHaveCount(0);
  await assertNoOverflow(page);
});

test('concierge opens without making a live model call', async ({ page }) => {
  let calls = 0;
  page.on('request', (request) => {
    if (request.url().includes('/agent-studio/')) calls++;
  });
  await page.goto('/category/rings');
  await expect(page.locator('.results .product-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  const panel = page.locator('div.jtv-concierge');
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(panel.locator('.ais-ChatPrompt-textarea')).toBeVisible();
  // Closing keeps the conversation mounted, so reopening resumes it rather
  // than restarting a stream (src/concierge/Concierge.tsx).
  await panel.getByRole('button', { name: 'Close the jewelry concierge' }).click();
  await expect(panel).toHaveAttribute('data-open', 'false');
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  await expect(panel).toHaveAttribute('data-open', 'true');
  expect(calls).toBe(0);
  await assertNoOverflow(page);
});

test('a pending turn shows the widget loader until the reply arrives', async ({ page }) => {
  // Replaces the old `.connected-progress-*` assertions: the custom pending
  // strip was deleted with the old panel, and the widget reports a turn in
  // flight with its own loader and the composer's submit status.
  const stream = await installManualAgentStream(page);
  await page.goto('/category/rings');
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  const panel = page.locator('div.jtv-concierge');
  const composer = panel.locator('.ais-ChatPrompt-textarea');
  await composer.fill('Find a simple necklace');
  await composer.press('Enter');

  await expect(panel.locator('.ais-ChatMessageLoader')).toBeVisible();
  /* `submitted` is a single frame before the connection opens, so asserting it
   * exactly is a race. What matters to the shopper is that the turn reads as
   * in flight and the submit button offers to stop it. */
  await expect(panel.locator('.ais-ChatPrompt-submit')).toHaveAttribute(
    'data-status',
    /submitted|streaming/,
  );
  await expect(panel.locator('.ais-ChatPrompt-submit')).toHaveAttribute(
    'aria-label',
    'Stop response',
  );

  await stream.emit(
    { type: 'start', messageId: 'alg_msg_pending' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text_pending' },
    { type: 'text-delta', id: 'text_pending', delta: 'A useful thought.' },
  );
  await expect(panel.locator('.ais-ChatMessages-content')).toContainText('A useful thought.');

  await stream.emit(
    { type: 'text-end', id: 'text_pending' },
    { type: 'finish-step' },
    { type: 'finish' },
  );
  await stream.close();
  await expect(panel.locator('.ais-ChatMessageLoader')).toHaveCount(0);
  await expect(panel.locator('.ais-ChatPrompt-submit')).toHaveAttribute('data-status', 'ready');
});
