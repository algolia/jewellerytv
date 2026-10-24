# Light-path note: mobile anchored product cards

Date: 2026-10-23. Owner: Claude (Prompter worktree). Approved by Arijit in session ("i like option 2 as well. Lets build that") after reviewing both mockups.

## Scope classification (light path)

- UI-only client change in `storefront/src`. No schema, API, or external-surface change.
- No new dependency. No security-sensitive surface: card links pass through the existing
  `parseVerifiedProductLink` guard and product hydration reuses the existing read-only
  exact-product proxy.
- Not full path. Reason recorded per development-loop scope gate.

## What ships

On mobile (≤767px) the Conversation/Products tabs go away and product cards render
inline under each agent answer that produced them (mockup option 2):

1. `nativeResults.ts`: pure `extractMessageAnchors(messages)` — per assistant message,
   arranged-groups output wins, grouped-call input is fallback, mirroring
   `extractNativePresentation`'s precedence.
2. `ConciergeWorkspaceProvider`: `stageMessageAnchors(messages)` — hydrates each anchor's
   objectIDs through the existing fetch + objectID-identity-verification path, registers
   verified records in the session store, returns messageId → groups.
3. `ConnectedConcierge`: stages anchors for revealed assistant messages; renders
   `InlineProductCards` under those messages; adds their product ids to the link guard.
4. Mobile CSS: tabs hidden, shopping column hidden, inline cards visible. Desktop
   (≥768px) unchanged: side-by-side layout and the existing tabbed products column stay.
5. Auto-scroll: while streaming, follow the bottom; when a turn completes, land on the
   last assistant message (the mockup's shared decision), not past the cards.

## Rollback answer

Single worktree commit on `worktree-Prompter`. Rollback = `git revert` of the feature
commit; no data migration, no config change, no agent prompt change, no deploy step
(app releases remain explicit-only via `release-app.sh`, which this change does not
trigger). The desktop path is untouched by construction (new code paths, CSS media
queries only), so a revert restores the tabbed mobile view exactly.

## Tests

- `native-results.test.ts`: per-message extraction (arranged wins, grouped fallback,
  records from earlier messages usable, two turns → two anchors).
- `workspace-provider.test.ts`: `stageMessageAnchors` hydration + store registration.
- New `inline-cards` component test: renders group headings + PDP links.
