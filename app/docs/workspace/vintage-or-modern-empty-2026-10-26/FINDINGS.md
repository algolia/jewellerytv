# Incident: "Vintage or modern?" first-run snag — empty shelf from a negated requirement

**Date:** 2026-10-26 · **Reported by:** tester via Arijit · **Status:** root-caused, fixed on dev, verified; deploy pending Arijit's go

## What the tester saw

Following a default prompt ("Vintage or modern?"), then "How about a ring?" and
"no specific stone, but my budget is $200", the concierge replied that it was
"hitting a snag getting rings to display right now" and showed no products.
The tester's words: "I don't feel like I was being specific at all, but didn't
get results."

## Root cause (verified from prod agent conversation `mission-5b148c11`, agent 0bdf59fe, 18:57 UTC)

1. `present_products` enforces the shopper's stated requirement against every
   candidate. The requirement matcher tokenizes only words of 4+ characters.
2. The shopper's message was "no specific stone, but my budget is $200". The
   negators "no" (2 chars) and "not" (3 chars) fall below the token floor and
   never reach the matcher — the matcher cannot see negation at all.
3. The surviving token "stone" matched the real vocabulary value
   "Multi-Stone" (`Catalog_GemstoneAndPearlNavigationName`), so the tool
   enforced gemstone = "Multi-Stone" on the whole shelf.
4. Both `present_products` calls (12 + 10 candidates) returned
   `status: "empty"` — every piece dropped as `requirement_mismatch`. The
   shelf-floor backfill admits through the same check, so it could not rescue;
   the layer-2 follow-up search never runs when zero pieces verified (gate
   `verified.length > 0`), which this time prevented showing wrong products.
5. The agent searched correctly both times (product type + price bands only,
   no material filter — the model did its job) and reported the empty shelf
   honestly. The defect is entirely in the app-side requirement matcher.

The tester's exact complaint — being told their non-specific message was the
problem — is the bug: their negation *became* the requirement.

## Fix (app-side, `app/src/concierge/tools/presentProducts.ts`)

One repeatable rule, no special-cased words: split the shopper message into
clauses on punctuation and contrast conjunctions (but/though/however/except);
a clause containing a negation word (no, not, none, never, nothing, without,
don't, can't, won't, isn't, aren't, cannot, nor) contributes no requirement
tokens. Exclusions ("not gold") stay the model's job through its own search
filters; this check only enforces what the shopper positively asked for.

Consequence for the measured turn: "no specific stone, but my budget is $200"
enforces nothing → the 12 candidates verify on stock/price/image/design →
the shelf renders (floor six tiles).

## Verification (three layers)

- Unit: 4 new negation tests in `tests/concierge/search-presentation.test.ts`
  (written RED first, including the exact measured literal); full suite
  47 files / 378 tests green.
- Browser: real headless journey on the dev app (5173) + dev agent replaying
  the tester's exact three turns — turn 3 renders 8 tiles, no snag text.
  Screenshots + receipts: `run-2026-10-26T22-50-17/`.
- Agent ground truth: dev conversation `mission-f6c8cfe1` turn 3 shows
  `present_products` → `status: "ok"`, no `enforced` block.

## Not part of this defect

- Turns 1–2 were clarifies by design (style-preference question, not a broad
  category browse), on both the live and dev agents.
- The tester's screenshot (dark header, "Save to wishlist" button, "Your
  results are ready — let me know if anything catches your eye.") matches no
  surface that can be verified: the string "wishlist" appears nowhere in this
  repository (code, all reachable history, dangling objects), none of the 53
  conversations across all three agents in the 36h window, or the jtv.com
  homepage. Surface of the screenshot unresolved — pending Arijit's answer on
  where the tester ran it. The verbal report matches the verified failure
  above, including echoing the agent's own phrase "hitting a snag".

## Pending

- [ ] Arijit: commit + deploy approval (explicit-only; battery 35×3×3 per standing rule before any promotion claim)
- [ ] Arijit: where did the tester run it (URL/surface) — to trace the screenshot
