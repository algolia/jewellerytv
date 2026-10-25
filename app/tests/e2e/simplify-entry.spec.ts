import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/* Simplification acceptance (D3 to D6, 2026-10-22): one discovery surface,
 * the Ask JTV chip in the search bar, no bottom launcher. Run against a
 * served app; receipts land in the run folder. */

const receiptDir =
  '../../../.development-loop/run-2026-10-22-simplification/receipts';

test.describe('simplified entry and canvas', () => {
  test('header search carries the Ask JTV chip and no bottom launcher exists', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const chip = page.getByRole('button', { name: 'Ask JTV', exact: true });
    await expect(chip).toBeVisible();
    await expect(page.locator('.concierge-launcher')).toHaveCount(0);
    await expect(page.locator('.header-search input#site-search')).toBeVisible();
    mkdirSync(receiptDir, { recursive: true });
    await page.screenshot({ path: `${receiptDir}/${testInfo.project.name}-header.png` });
  });

  test('the chip opens the Concierge with the search text as a draft', async ({ page }) => {
    await page.goto('/');
    await page.locator('#site-search').fill('tanzanite ring');
    await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
    const composer = page.locator('#connected-concierge-input');
    await expect(composer).toBeVisible();
    await expect(composer).toHaveValue('tanzanite ring');
    // The draft is not sent: no assistant turn appears.
    await expect(page.locator('.connected-conversation [data-role]')).toHaveCount(0);
  });

  test('keyword search still navigates to results on submit', async ({ page }) => {
    await page.goto('/');
    await page.locator('#site-search').fill('gold hoops');
    await page.locator('.header-search button[aria-label="Search"]').click();
    await expect(page).toHaveURL(/\/search\?q=gold(\+|%20)hoops/);
  });

  test('a product tile navigates to the product detail page (D4)', async ({ page }) => {
    await page.goto('/search?q=rings');
    const tile = page.locator('a.product-link, .product-card a').first();
    await expect(tile).toBeVisible();
    const href = (await tile.getAttribute('href')) ?? '';
    expect(href).toMatch(/^\/product\//);
    await tile.click();
    await expect(page).toHaveURL(new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});
