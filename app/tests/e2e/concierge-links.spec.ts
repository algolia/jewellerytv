import { expect, test } from '@playwright/test';
import { installManualAgentStream } from './fixtures/agentStream';

/*
 * The agent cannot see the live schedule: `on_air_shows` is a rolling window
 * of what has aired, refreshed daily, with local clock strings and no
 * timezone. For "what's on now" and "where do I watch" it is supposed to say
 * so and hand the shopper a link to jtv.com instead.
 *
 * Two things have to hold for that to be worth anything. The link has to be a
 * real anchor, which depends on the widget parsing markdown in reply text.
 * And clicking it must not navigate the storefront away, because the
 * transcript lives in component state and would go with it.
 */
test('a link in a reply opens jtv.com in a new tab, not in the panel', async ({ page }) => {
  const stream = await installManualAgentStream(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  const panel = page.locator('div.jtv-concierge');
  await expect(panel).toHaveAttribute('data-open', 'true');

  const composer = panel.locator('.ais-ChatPrompt-textarea');
  await composer.fill("What's on right now?");
  await composer.press('Enter');

  await stream.emit(
    { type: 'start', messageId: 'alg_msg_link' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text_link' },
    {
      type: 'text-delta',
      id: 'text_link',
      delta:
        "I can't see what's airing at this moment. You can watch the live broadcast at " +
        '[JTV Live](https://www.jtv.com/live).',
    },
    { type: 'text-end', id: 'text_link' },
    { type: 'finish-step' },
    { type: 'finish' },
  );
  await stream.close();

  const link = panel.getByRole('link', { name: 'JTV Live' });
  await expect(link).toHaveAttribute('href', 'https://www.jtv.com/live');

  /* The handler calls window.open; stub it so the assertion is about our
   * interception rather than about a real navigation. */
  await page.evaluate(() => {
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url: string) => {
      (window as unknown as { __opened: string[] }).__opened.push(url);
      return null;
    }) as typeof window.open;
  });

  await link.click();

  expect(await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened)).toEqual(
    ['https://www.jtv.com/live'],
  );
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(link).toBeVisible();
});
