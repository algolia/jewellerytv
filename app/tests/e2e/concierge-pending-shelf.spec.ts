import { expect, test } from '@playwright/test';
import { installManualAgentStream } from './fixtures/agentStream';

/*
 * The gap between the reply text and the shelves.
 *
 * Measured against the dev agent on 2026-10-29: the model writes the display
 * tool's `intro`, stalls for four seconds, then emits all three groups and
 * twelve pieces in under 400ms. Progressive rendering is already on, so there
 * is nothing to render during the stall — and the intro, the one thing
 * generated before it, is dropped by the display gate on purpose.
 *
 * This reproduces that shape: the tool input opens and streams only the intro,
 * and the panel has to show a pending shelf rather than an empty block. When
 * the groups land, the real cards take their place.
 */
const RING = {
  objectID: 'JTV-RING-1',
  Catalog_TitleDescription: 'Halo ring in sterling silver',
  Media_Images: ['https://example.test/ring.jpg'],
};

test('the shelf shows placeholders while the display tool is still streaming', async ({ page }) => {
  const stream = await installManualAgentStream(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  const panel = page.locator('div.jtv-concierge');
  await expect(panel).toHaveAttribute('data-open', 'true');

  const composer = panel.locator('.ais-ChatPrompt-textarea');
  await composer.fill('Show me opal jewelry');
  await composer.press('Enter');

  await stream.emit(
    /* `groupedResultsEnabled` stops the search tool drawing its own carousel
     * of the same records beside the grouped shelves. */
    { type: 'start', messageId: 'alg_msg_pending', messageMetadata: { groupedResultsEnabled: true } },
    { type: 'start-step' },
    {
      type: 'tool-input-start',
      toolCallId: 'call_search',
      toolName: 'algolia_search_index_prod_catalog',
    },
    {
      type: 'tool-input-available',
      toolCallId: 'call_search',
      toolName: 'algolia_search_index_prod_catalog',
      input: { queries: [{ query: 'opal jewelry' }] },
    },
    /* The record store the grouped tool hydrates from is built from tool
     * outputs carrying `hits`; a piece never searched up renders as nothing. */
    { type: 'tool-output-available', toolCallId: 'call_search', output: { hits: [RING], nbHits: 1 } },
    { type: 'finish-step' },
    { type: 'start-step' },
    { type: 'text-start', id: 'text_pending' },
    { type: 'text-delta', id: 'text_pending', delta: 'Opals run deep in our catalogue.' },
    { type: 'text-end', id: 'text_pending' },
    /* The tool opens and gets as far as the intro. This is where the agent
     * stalls, so the panel sits in this state for seconds. */
    { type: 'tool-input-start', toolCallId: 'call_display', toolName: 'algolia_grouped_results' },
    {
      type: 'tool-input-delta',
      toolCallId: 'call_display',
      inputTextDelta: '{"intro": "Here is a first look at opal jewelry.",',
    },
  );

  const pending = panel.locator('.jtv-chat-card--pending');
  await expect(pending).toHaveCount(4);
  await expect(panel.locator('.jtv-chat-card:not(.jtv-chat-card--pending)')).toHaveCount(0);

  await stream.emit({
    type: 'tool-input-available',
    toolCallId: 'call_display',
    toolName: 'algolia_grouped_results',
    input: {
      intro: 'Here is a first look at opal jewelry.',
      groups: [{ title: 'Opal rings', results: [{ objectID: RING.objectID }] }],
    },
  });
  await stream.emit({ type: 'finish-step' }, { type: 'finish' });
  await stream.close();

  await expect(panel.locator(`.jtv-chat-card[href="/product/${RING.objectID}"]`)).toHaveCount(1);
  await expect(panel.locator('.jtv-chat-card--pending')).toHaveCount(0);
});
