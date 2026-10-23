# Canvas restore after page reload (Option B)

Date: 2026-10-22. Session: UX. Worktree: Prompter. Branch: worktree-Prompter.

## Scope classification: LIGHT PATH

Client-side UI fix only. No schema change, no API change, no new dependency, no
security-sensitive surface, no index or agent change. Reasoning recorded per
development-loop scope gate.

## Problem

Canvas tiles (nativeGroups) are React state set only in the send path. PDP
navigation is a full page load (raw anchors, `navigation` type measured in dev),
so the component remounts with an empty canvas while the SDK restores the
transcript from sessionStorage. Reproduced in dev 2026-10-22: 6 tiles before
PDP click, 0 after return, conversation restored (2 messages). Stored
transcript verified to retain tool-arrange_groups / search outputs /
output-available after reload, so the canvas can be re-derived.

## Plan

1. Export a pure gate `canRestoreNativeCanvas` from ConnectedConcierge
   (not pending, not resetting, canvas empty, visible transcript has a user and
   an assistant message).
2. Add a restore effect: after transcript hydration, run the existing
   `stageNativePresentation` over the VISIBLE transcript (hidden prior ids
   excluded so a new conversation cannot resurrect the old canvas), stage when
   it returns groups. Attempt once per transcript identity (ref guard).
3. Memoize visibleMessages so the identity guard is stable.
4. Unit-test the gate; verify end to end in the dev browser (headless
   Playwright, screenshots, tile counts) per the JTV browser-validation rule.

## Fidelity constraints

No agent speech is authored; staging reuses the existing extract + identity
verification. No new model calls, no index changes, no deployment (explicit
only). Desktop two-column layout untouched.

## Rollback answer

Revert the single commit on worktree-Prompter; the feature is additive state
restore with no data migration, so revert fully restores prior behavior.
Nothing is deployed by this work; production ships only on Arijit's explicit
release order.
