import { expect, test } from '@playwright/test';
import { installManualAgentStream } from './fixtures/agentStream';

/*
 * A long reply arrives in pieces and the panel has to show all of it: the
 * transcript grows, later deltas join the same message, and the turn settles.
 *
 * Scroll-follow itself is deliberately not asserted. It belongs to the
 * library's `useStickToBottom`, not to this application, and driving it from a
 * test means either a programmatic scroll (which emits no user event, so the
 * lock never releases and the next delta yanks the view back down) or a
 * synthetic wheel (whose settling is animated and races the next delta). The
 * old panel hand-rolled that behaviour, which is why the original spec guarded
 * it; there is nothing of ours left to guard.
 */
test('a long streamed reply renders in full and the turn settles', async ({ page }) => {
  const stream = await installManualAgentStream(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  const panel = page.locator('div.jtv-concierge');
  await expect(panel).toHaveAttribute('data-open', 'true');

  const composer = panel.locator('.ais-ChatPrompt-textarea');
  await composer.fill('Tell me about necklaces');
  await composer.press('Enter');

  await stream.emit(
    { type: 'start', messageId: 'alg_msg_scroll' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text_scroll' },
    {
      type: 'text-delta',
      id: 'text_scroll',
      delta: Array.from({ length: 80 }, (_, index) => `Line ${index}: a useful thought.\n\n`).join(
        '',
      ),
    },
  );

  const transcript = panel.locator('.ais-ChatMessages-content');
  const scroller = panel.locator('.ais-ChatMessages-scroll');
  await expect(transcript).toContainText('Line 0');
  await expect(transcript).toContainText('Line 79');
  // A reply this long has to overflow, or the rest of this proves nothing.
  expect(await scroller.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(
    100,
  );

  // Text arriving after the first chunk joins the same message.
  await stream.emit({
    type: 'text-delta',
    id: 'text_scroll',
    delta: 'One more thought at the end.',
  });
  await expect(transcript).toContainText('One more thought at the end.');

  await stream.emit(
    { type: 'text-end', id: 'text_scroll' },
    { type: 'finish-step' },
    { type: 'finish' },
  );
  await stream.close();

  await expect(panel.locator('.ais-ChatMessageLoader')).toHaveCount(0);
  await expect(panel.locator('.ais-ChatPrompt-submit')).toHaveAttribute('data-status', 'ready');
});
