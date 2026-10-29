import { expect, test, type Page } from '@playwright/test';
import {
  EARRINGS,
  RING,
  UNPHOTOGRAPHED,
  stubAgentNetworkFailure,
  stubAgentTurn,
} from './fixtures/agentStream';

/*
 * The rebuilt Concierge panel (`src/concierge/Concierge.tsx` wrapping
 * `react-instantsearch`'s Chat widget via `src/concierge/chat/JtvChat.tsx`).
 *
 * Every turn here is scripted by `fixtures/agentStream`: no live agent is
 * called and no tokens are spent. What the specs assert is what the widget's
 * own components render — the class names come from
 * `instantsearch-ui-components/dist/es/components/chat/*` and the tile markup
 * from `src/concierge/chat/ProductCard.tsx`.
 */

const PANEL = 'div.jtv-concierge';
const COMPOSER = '.ais-ChatPrompt-textarea';
const TRANSCRIPT = '.ais-ChatMessages-content';
const CARD = 'a.jtv-chat-card';

/** Opens the panel the way a shopper does: the Ask JTV chip in the header. */
async function openPanel(page: Page, draft = '') {
  await page.goto('/');
  if (draft) await page.locator('#site-search').fill(draft);
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  const panel = page.locator(PANEL);
  await expect(panel).toHaveAttribute('data-open', 'true');
  return panel;
}

/** Sends one question and waits for the turn to settle. */
async function ask(page: Page, question: string) {
  const composer = page.locator(COMPOSER);
  await composer.fill(question);
  await composer.press('Enter');
}

test('the Ask JTV chip opens the panel with the search text as a draft', async ({ page }) => {
  // Nothing is sent here, but an accidental request must not reach the agent.
  await stubAgentTurn(page, { text: 'Unused.' });
  const panel = await openPanel(page, 'tanzanite ring');
  await expect(panel).toBeVisible();

  const composer = panel.locator(COMPOSER);
  await expect(composer).toBeVisible();
  await expect(composer).toBeEnabled();
  // The chip pre-fills rather than sends: the question is still the shopper's.
  await expect(composer).toHaveValue('tanzanite ring');
  await expect(panel.locator('.ais-ChatMessage')).toHaveCount(0);

  // The composer is live, not a disabled placeholder.
  await composer.fill('tanzanite ring under 18 inches');
  await expect(composer).toHaveValue('tanzanite ring under 18 inches');
});

test('the panel starts closed and the chip is the only way in', async ({ page }) => {
  await stubAgentTurn(page, { text: 'Unused.' });
  await page.goto('/');
  const panel = page.locator(PANEL);
  await expect(panel).toHaveAttribute('data-open', 'false');
  await expect(panel).toBeHidden();
  await expect(page.locator('.concierge-launcher')).toHaveCount(0);
});

test('a scripted reply renders, markdown emphasis included', async ({ page }) => {
  await stubAgentTurn(page, {
    text: 'These hoops are **gold vermeil** and _feather light_ on the ear.',
  });
  const panel = await openPanel(page);
  await ask(page, 'Tell me about the hoops');

  const transcript = panel.locator(TRANSCRIPT);
  await expect(transcript).toContainText('gold vermeil');
  // Markdown is the library's (markdown-to-jsx inside ChatMessage): emphasis
  // must reach the shopper as emphasis, not as literal asterisks.
  await expect(transcript.locator('strong')).toHaveText('gold vermeil');
  await expect(transcript.locator('em')).toHaveText('feather light');
  await expect(transcript).not.toContainText('**');
});

test('a grouped-results call renders one tile per piece, imaged, titled and linked', async ({
  page,
}) => {
  await stubAgentTurn(page, {
    text: 'Two directions worth a look.',
    hits: [RING, EARRINGS],
    intro: 'Here is what fits the brief.',
    groups: [
      { title: 'Halo rings', objectIDs: [RING.objectID] },
      { title: 'Everyday hoops', objectIDs: [EARRINGS.objectID] },
    ],
  });
  const panel = await openPanel(page);
  await ask(page, 'Show me something for a gift');

  const cards = panel.locator(CARD);
  await expect(cards).toHaveCount(2);
  /* The tool's intro is deliberately dropped by the display gate: the model
   * writes its reply in the message and then says the same thing again above
   * the shelves. The message is the only voice the shopper reads. */
  await expect(panel.locator('.ais-ChatToolGroupedResults-intro')).toHaveCount(0);

  const ring = panel.locator(`${CARD}[href="/product/${RING.objectID}"]`);
  await expect(ring).toHaveCount(1);
  await expect(ring.locator('.jtv-chat-card-image img')).toHaveCount(1);
  await expect(ring.locator('.jtv-chat-card-title')).toHaveText(RING.Catalog_TitleDescription);

  const earrings = panel.locator(`${CARD}[href="/product/${EARRINGS.objectID}"]`);
  await expect(earrings).toHaveCount(1);
  await expect(earrings.locator('.jtv-chat-card-image img')).toHaveCount(1);
  await expect(earrings.locator('.jtv-chat-card-title')).toHaveText(
    EARRINGS.Catalog_TitleDescription,
  );
});

test('no price reaches the panel even though the records carry one', async ({ page }) => {
  await stubAgentTurn(page, {
    text: 'Both are in stock.',
    hits: [RING, EARRINGS],
    groups: [{ title: 'In stock now', objectIDs: [RING.objectID, EARRINGS.objectID] }],
  });
  const panel = await openPanel(page);
  await ask(page, 'What do you have in stock?');
  await expect(panel.locator(CARD)).toHaveCount(2);

  // The agent answers about fit and style; a stale price next to an answer
  // reads as a quote (`src/concierge/chat/ProductCard.tsx`).
  const text = (await panel.innerText()).replace(/\s+/g, ' ');
  expect(text).not.toContain(String(RING.Pricing_ActivePrice));
  expect(text).not.toContain(String(EARRINGS.Pricing_ActivePrice));
  expect(text).not.toMatch(/[$£€]\s?\d/);
  expect(text).not.toMatch(/\d+\.\d{2}/);
});

test('the new-conversation control clears the turn and keeps the panel open', async ({ page }) => {
  await stubAgentTurn(page, { text: 'A short reply.' });
  const panel = await openPanel(page);

  /* The control lives in the widget's header slot, not the shell: only the
   * widget can reach `clearMessages`. It is dead until there is something to
   * clear, which is the library's `canClear`. */
  const newConversation = panel.getByRole('button', { name: 'Start a new conversation' });
  await expect(newConversation).toBeDisabled();

  const composer = panel.locator(COMPOSER);
  await composer.fill('hello');
  await composer.press('Enter');
  await expect(panel.locator('.ais-ChatMessage')).toHaveCount(2);
  await expect(newConversation).toBeEnabled();

  await newConversation.click();
  await expect(panel.locator('.ais-ChatMessage')).toHaveCount(0);
  // Clearing is not closing: the shopper is still in the conversation.
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(newConversation).toBeDisabled();
});

test('the display gate refuses a repeat and an unphotographed piece', async ({ page }) => {
  await stubAgentTurn(page, {
    text: 'A few to compare.',
    hits: [RING, EARRINGS, UNPHOTOGRAPHED],
    groups: [
      // The same objectID named twice, and a record with no imagery at all.
      { title: 'Closest match', objectIDs: [RING.objectID, UNPHOTOGRAPHED.objectID] },
      { title: 'Also consider', objectIDs: [RING.objectID, EARRINGS.objectID] },
    ],
  });
  const panel = await openPanel(page);
  await ask(page, 'Compare these for me');

  const cards = panel.locator(CARD);
  await expect(cards).toHaveCount(2);
  await expect(panel.locator(`${CARD}[href="/product/${RING.objectID}"]`)).toHaveCount(1);
  await expect(panel.locator(`${CARD}[href="/product/${EARRINGS.objectID}"]`)).toHaveCount(1);
  await expect(panel.locator(`${CARD}[href="/product/${UNPHOTOGRAPHED.objectID}"]`)).toHaveCount(0);
  await expect(panel).not.toContainText(UNPHOTOGRAPHED.Catalog_TitleDescription);
  // A tile is never drawn without its picture.
  await expect(panel.locator('.jtv-chat-card-image img')).toHaveCount(2);
  await expect(panel).not.toContainText('Image unavailable');
});

/* What the widget actually does on a failed turn, read from
 * `ChatMessages` (`status === 'error'` renders `ChatMessageError`) and from
 * `ChatMessageError` itself: a subtle left-hand message carrying the default
 * copy, plus a "Start a new conversation" button, because `Chat` always
 * passes `onNewConversation`. The raw error text is deliberately withheld. */
const ERROR_COPY =
  'Sorry, we are not able to generate a response at the moment. Please contact support.';

test('a stream that ends in an error leaves the shopper a visible failure', async ({ page }) => {
  await stubAgentTurn(page, {
    text: 'Looking at the catalogue…',
    errorText: 'upstream agent failed',
  });
  const panel = await openPanel(page);
  await ask(page, 'Find me a pendant');

  const failure = panel.locator('.ais-ChatMessageError');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText(ERROR_COPY);
  await expect(failure.getByRole('button', { name: 'Start a new conversation' })).toBeVisible();
  // The service's own wording is not leaked to the shopper.
  await expect(panel).not.toContainText('upstream agent failed');
});

test('an aborted request leaves the shopper a visible failure', async ({ page }) => {
  await stubAgentNetworkFailure(page);
  const panel = await openPanel(page);
  await ask(page, 'Find me a pendant');

  const failure = panel.locator('.ais-ChatMessageError');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText(ERROR_COPY);
  await expect(failure.getByRole('button', { name: 'Start a new conversation' })).toBeVisible();
  // The shopper's own question is still on screen: the panel is not blanked.
  await expect(panel.locator(TRANSCRIPT)).toContainText('Find me a pendant');
});
