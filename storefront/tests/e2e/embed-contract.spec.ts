import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/*
 * Embed contract acceptance (simplification plan 5, 2026-10-22), run against
 * the dev server on 5295 per the risk artifact 03-risk-embed.md: a fake host
 * page on a foreign origin includes the one-line script tag; the chip opens
 * the panel with the host search text as a draft; a product click resolves
 * the PDP template on the host side and navigates the host page. Screenshots
 * land in the run folder receipts.
 */

const HOST = 'http://host.local';
const PANEL =
  process.env.JTV_EMBED_PANEL_URL ?? 'http://localhost:5295/src/embed/frame.html';
const LOADER = 'http://localhost:5295/concierge/loader.js';
// Real host pages load the loader with a plain no-cors script tag; Playwright
// interception re-issues it as a CORS request, so the test serves the loader
// from disk and adds the header to proxied panel assets itself.
const LOADER_JS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../public/concierge/loader.js'),
  'utf8',
);

const HOST_PAGE = `<!doctype html><html><head><title>Fake JTV host</title></head>
<body style="font-family:Arial">
  <form id="siteSearchForm" action="/search" method="get"
        style="display:flex;align-items:center;gap:8px;max-width:520px;margin:40px auto">
    <input type="search" name="q" placeholder="Search" style="flex:1;padding:10px 16px;border:1px solid #aaa;border-radius:22px"/>
    <button type="submit" style="background:#123;border:0;color:#fff;border-radius:22px;padding:10px 18px">SEARCH</button>
  </form>
  <script src="${LOADER}" data-jtv-target="#siteSearchForm" data-jtv-pdp-template="https://www.jtv.com/product/{id}" data-jtv-panel-url="${PANEL}" defer></script>
</body></html>`;

test.describe('Ask JTV embed contract', () => {
  test.beforeEach(async ({ context }) => {
    await context.route(/^http:\/\/host\.local\//, (route) =>
      route.fulfill({ contentType: 'text/html', body: HOST_PAGE }),
    );
    await context.route(/^https:\/\/www\.jtv\.com\//, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>PDP</title><h1>PDP</h1>' }),
    );
    // The loader is a plain no-cors script tag on a real page; serve it from
    // disk here because interception makes the browser CORS-check it.
    await context.route(/concierge\/loader\.js$/, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: LOADER_JS }),
    );
    // Panel assets proxy to the dev server with a CORS header added.
    await context.route(/^http:\/\/localhost:5295\//, async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'access-control-allow-origin': '*' },
      });
    });
  });

  test('the chip injects into the host search bar and the keyword search stays untouched', async ({
    page,
  }) => {
    await page.goto(HOST);
    const chip = page.locator('#siteSearchForm .jtv-ask-chip');
    await expect(chip).toHaveText('Ask JTV');
    await expect(page.locator('#siteSearchForm input[type=search]')).toBeVisible();
    await page.locator('#siteSearchForm input[type=search]').fill('gold hoops');
    await page.locator('#siteSearchForm button[type=submit]').click();
    await expect(page).toHaveURL(/host\.local\/search\?q=gold\+hoops/);
    await page.screenshot({ path: '../../../.development-loop/run-2026-10-22-simplification/receipts/embed-host-chip.png' });
  });

  test('the chip opens the panel with the host search text as a draft', async ({ page }) => {
    await page.goto(HOST);
    await page.locator('#siteSearchForm input[type=search]').fill('tanzanite ring');
    await page.locator('#siteSearchForm .jtv-ask-chip').click();
    const panel = page.frameLocator('.jtv-embed-frame');
    const composer = panel.locator('#connected-concierge-input');
    await expect(composer).toBeVisible();
    await expect(composer).toHaveValue('tanzanite ring');
    await expect(panel.locator('.connected-conversation [data-role]')).toHaveCount(0);
  });

  test('an empty host search opens the panel on the starter prompts', async ({ page }) => {
    await page.goto(HOST);
    await page.locator('#siteSearchForm .jtv-ask-chip').click();
    const panel = page.frameLocator('.jtv-embed-frame');
    await expect(panel.locator('#connected-concierge-input')).toHaveValue('');
    // Starter sets rotate daily; assert the group, not one question.
    await expect(panel.locator('.connected-starters-list .connected-starter-chip').first()).toBeVisible();
  });

  test('a product click in the panel resolves the PDP template and navigates the host', async ({
    page,
  }) => {
    await page.goto(HOST);
    await page.locator('#siteSearchForm .jtv-ask-chip').click();
    const panel = page.frameLocator('.jtv-embed-frame');
    await expect(panel.locator('#connected-concierge-input')).toBeVisible();
    // The panel posts the product identity; the loader owns template + navigation.
    const frame = page
      .frames()
      .find((candidate) => candidate.url().includes('frame.html'));
    expect(frame).toBeTruthy();
    await frame!.evaluate(() =>
      window.parent.postMessage(
        { source: 'jtv-concierge', type: 'product-click', productId: 'ABC123' },
        '*',
      ),
    );
    await expect(page).toHaveURL('https://www.jtv.com/product/ABC123');
    await expect(page.locator('h1')).toHaveText('PDP');
  });
});
