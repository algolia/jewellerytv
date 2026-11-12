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

/* The shopper's one size choice (2026-11-12): collapse the panel to its title
 * bar and open it again. The bar has to stay where the panel was, or it is a
 * disappearing act rather than a minimise. Replaced the full-height rail,
 * which JTV did not ask to keep. */
test('the panel collapses to its title bar and stays docked there', async ({ page }) => {
  const panel = await openPanel(page);
  const card = (await panel.boundingBox())!;
  expect(card.height).toBeGreaterThan(200);

  await page.getByRole('button', { name: 'Minimize the panel to its title bar' }).click();
  await expect(panel).toHaveAttribute('data-size', 'minimized');

  const bar = (await panel.boundingBox())!;
  expect(bar.height).toBeLessThan(80);
  /* "In place" is the claim being tested: the bottom edge must not move, so
   * the bar is where the shopper's eye and cursor already are. */
  expect(Math.round(bar.y + bar.height)).toBe(Math.round(card.y + card.height));
  await expect(page.locator(COMPOSER)).toBeHidden();

  /* The whole bar is a target, not just the chevron. */
  await panel.locator('.jtv-concierge-header').click();
  await expect(panel).toHaveAttribute('data-size', 'normal');
  await expect(page.locator(COMPOSER)).toBeVisible();
});

test('collapsing keeps the conversation, and the chevrons bound at each end', async ({ page }) => {
  const panel = await openPanel(page);
  await page.locator(COMPOSER).fill('Do you have opal rings?');
  await page.locator(COMPOSER).press('Enter');
  await expect(page.locator(TRANSCRIPT)).toContainText('opal');

  const restore = page.getByRole('button', { name: 'Restore the panel' });
  const minimize = page.getByRole('button', { name: 'Minimize the panel to its title bar' });
  await expect(restore).toBeDisabled();
  await expect(minimize).toBeEnabled();

  await minimize.click();
  await expect(restore).toBeEnabled();
  await expect(minimize).toBeDisabled();

  await restore.click();
  await expect(page.locator(TRANSCRIPT)).toContainText('opal');
});

/* Closing the tab is not the same as wanting the panel back at full size, so
 * the choice outlives a reload. The conversation does not — the chat instance
 * is a `useMemo` — which is exactly why `open` is not stored with it. */
test('the collapsed choice survives a reload, and the panel does not reopen itself', async ({
  page,
}) => {
  const panel = await openPanel(page);
  await page.getByRole('button', { name: 'Minimize the panel to its title bar' }).click();
  await expect(panel).toHaveAttribute('data-size', 'minimized');

  await page.reload();
  const reloaded = page.locator(PANEL);
  await expect(reloaded).toHaveAttribute('data-open', 'false');
  await expect(reloaded).toHaveAttribute('data-size', 'minimized');

  /* A question handed to a collapsed bar has to land on a composer. */
  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  await expect(reloaded).toHaveAttribute('data-size', 'normal');
  await expect(page.locator(COMPOSER)).toBeVisible();
});

/* Closing is not clearing. `storefront.spec.ts` proves reopening fires no
 * model call; this proves there was something to come back to, which is the
 * half a request count cannot see. */
test('closing keeps the conversation, and reopens at the normal size', async ({ page }) => {
  await stubAgentTurn(page, { text: 'Opals suit an October birthday.' });
  const panel = await openPanel(page);
  await ask(page, 'Show me opal rings');
  await expect(page.locator(TRANSCRIPT)).toContainText('October');

  await page.getByRole('button', { name: 'Minimize the panel to its title bar' }).click();
  await page.getByRole('button', { name: 'Close the jewelry concierge' }).click();
  await expect(panel).toHaveAttribute('data-open', 'false');

  await page.getByRole('button', { name: 'Ask JTV', exact: true }).click();
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(page.locator(TRANSCRIPT)).toContainText('October');
  /* Closing normalises the size, so reopening is never a bar with nothing in
   * it and no obvious way back. */
  await expect(panel).toHaveAttribute('data-size', 'normal');
});

test('the panel starts closed and the chip is the only way in', async ({ page }) => {
  await stubAgentTurn(page, { text: 'Unused.' });
  await page.goto('/');
  const panel = page.locator(PANEL);
  await expect(panel).toHaveAttribute('data-open', 'false');
  await expect(panel).toHaveAttribute('data-size', 'normal');
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

test('a grouped-results call renders one tile per piece, imaged and linked', async ({ page }) => {
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
  /* The tile is the photograph and nothing else (2026-11-06, JTV's call): no
   * price under it and no name. The piece is still named for anyone who
   * cannot see the picture, through the alt text and the link's own label. */
  await expect(ring.locator('.jtv-chat-card-title')).toHaveCount(0);
  await expect(ring.locator('img')).toHaveAttribute('alt', RING.Catalog_TitleDescription);
  await expect(ring).toHaveAttribute('aria-label', RING.Catalog_TitleDescription);

  const earrings = panel.locator(`${CARD}[href="/product/${EARRINGS.objectID}"]`);
  await expect(earrings).toHaveCount(1);
  await expect(earrings.locator('.jtv-chat-card-image img')).toHaveCount(1);
  await expect(earrings.locator('img')).toHaveAttribute(
    'alt',
    EARRINGS.Catalog_TitleDescription,
  );
});

/* With the display tool's settings tightened the agent stopped writing any
 * message text and put its opening line in the tool's own intro instead.
 * Stripping that unconditionally left the panel showing tiles and silence. */
test('the tool intro is shown when the reply carries no text of its own', async ({ page }) => {
  await stubAgentTurn(page, {
    hits: [RING, EARRINGS],
    intro: 'A varied first look at opal jewelry.',
    groups: [{ title: 'Opal rings', objectIDs: [RING.objectID, EARRINGS.objectID] }],
  });
  const panel = await openPanel(page);
  await ask(page, 'Show me opal jewelry');

  await expect(panel.locator(CARD)).toHaveCount(2);
  await expect(panel.getByText('A varied first look at opal jewelry.')).toBeVisible();
});

/* Arijit's 2026-11-04 order reverses the 2026-11-02 settlement: a chip is a
 * filter, not a question. The tap refines the shelf in place and puts nothing
 * in the transcript — no shopper message, no agent turn. The full funnel
 * contract (turn constraints carried, Back restore, deepened axes, failure
 * behavior) is pinned in `concierge-funnel.spec.ts`. */
test('a narrowing chip refines the shelf without a new turn', async ({ page }) => {
  await stubAgentTurn(page, {
    text: 'Opal runs deep here.',
    hits: [RING, EARRINGS],
    query: 'opal jewelry',
    groups: [{ title: 'Opal rings', objectIDs: [RING.objectID, EARRINGS.objectID] }],
    facets: {
      Catalog_JewelryMaterialNavigationColor: { White: 400, Yellow: 300, Rose: 120 },
    },
  });
  await page.route(/indexes\/\*\/queries/, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ results: [{ hits: [RING], nbHits: 1, facets: {} }] }),
    }),
  );
  const panel = await openPanel(page);
  await ask(page, 'Show me opal jewelry');
  await expect(panel.locator(CARD)).toHaveCount(2);

  const chip = panel.getByRole('button', { name: 'White', exact: true });
  await expect(chip).toBeVisible();
  await chip.click();

  // The chip's whole job is to filter what is on screen.
  const messages = panel.locator('.ais-ChatMessage');
  await expect(messages).toHaveCount(2);
  await expect(panel.locator('a.jtv-chat-card')).toHaveCount(1);
});

/* The tile label is the price now, so the old guard — no currency anywhere in
 * the panel — would fail on the thing we intend to show. What it was really
 * protecting against survives: a price must never appear in the agent's
 * prose, where it reads as a quote and goes stale between the search and the
 * glance. */
/* No price reaches the shopper from the panel at all. It used to sit under
 * each tile; JTV asked for the photograph alone (2026-11-06), and the reply
 * was never allowed to quote a figure because the text goes stale against the
 * record the moment the price moves. */
test('no price appears on the tiles or in the reply', async ({ page }) => {
  await stubAgentTurn(page, {
    text: 'Both are in stock.',
    hits: [RING, EARRINGS],
    groups: [{ title: 'In stock now', objectIDs: [RING.objectID, EARRINGS.objectID] }],
  });
  const panel = await openPanel(page);
  await ask(page, 'What do you have in stock?');
  await expect(panel.locator(CARD)).toHaveCount(2);

  const tiles = (await panel.locator(CARD).allInnerTexts()).join(' ');
  expect(tiles).not.toMatch(/[$£€]\s?\d/);

  const prose = (await panel.locator('.ais-ChatMessage-text').allInnerTexts()).join(' ');
  expect(prose).not.toMatch(/[$£€]\s?\d/);
  expect(prose).not.toContain(String(RING.Pricing_ActivePrice));
  expect(prose).not.toContain(String(EARRINGS.Pricing_ActivePrice));
});

test('the empty panel offers curated starters that send on click', async ({ page }) => {
  await stubAgentTurn(page, { text: 'Here you go.' });
  const panel = await openPanel(page);

  /* Nine, per the pool's standing rule. These are the curated,
   * analytics-grounded labels, not model-generated openers: the follow-up
   * suggestions after a turn are the generated surface. */
  const starters = panel.locator('.jtv-chat-starter');
  await expect(starters).toHaveCount(9);

  const first = await starters.first().innerText();
  await starters.first().click();

  // The chip is the shopper's question, sent verbatim.
  await expect(panel.locator('.ais-ChatMessage').first()).toContainText(first);
  await expect(panel.locator('.ais-ChatMessages-content')).toContainText('Here you go.');
  // The empty state is gone once there is a conversation to show.
  await expect(starters).toHaveCount(0);
});

test('the new-search control clears the turn and keeps the panel open', async ({ page }) => {
  await stubAgentTurn(page, { text: 'A short reply.' });
  const panel = await openPanel(page);

  /* The control lives in the widget's header slot, not the shell: only the
   * widget can reach `clearMessages`.
   *
   * It is never disabled, which is deliberate and was asserted the other way
   * round until 2026-11-12. On an empty panel there is nothing to clear, but
   * the click still deals a fresh set of starter questions, so the control
   * always does something. Its accessible name is now the visible "New
   * search", which also stops this locator matching the identically named
   * button on the error card below. */
  const newSearch = panel.getByRole('button', { name: 'New search' });
  await expect(newSearch).toBeEnabled();

  const starters = panel.locator('.jtv-chat-starter');
  const firstDeal = await starters.allInnerTexts();
  expect(firstDeal.length).toBeGreaterThan(0);

  const composer = panel.locator(COMPOSER);
  await composer.fill('hello');
  await composer.press('Enter');
  await expect(panel.locator('.ais-ChatMessage')).toHaveCount(2);
  await expect(newSearch).toBeEnabled();

  await newSearch.click();
  await expect(panel.locator('.ais-ChatMessage')).toHaveCount(0);
  // Clearing is not closing: the shopper is still in the conversation.
  await expect(panel).toHaveAttribute('data-open', 'true');
  await expect(newSearch).toBeEnabled();

  // And on the now-empty panel it re-deals rather than sitting dead.
  await expect(starters.first()).toBeVisible();
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
