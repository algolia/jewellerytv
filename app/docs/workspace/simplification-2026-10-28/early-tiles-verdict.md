# Can we show the pieces before the display tool finishes?

**No.** The display tool curates, so the pieces the search returns are not the
pieces the agent intends to show, and rendering the search output early would
make tiles appear and then vanish.

## Why it was worth asking

The panel shows nothing until `algolia_grouped_results` has finished writing its
input, and that tool stalls for four seconds between its intro and its first
group (platform questions, item 2). Every piece is already in the record store
when the search output lands, several seconds earlier.

Measured across eight questions with caching off
(`compare-search-vs-grouped.mjs`, 2026-10-29):

| Question | index | searched | named | wait |
|---|---|---|---|---|
| Show me opal jewelry | prod_catalog | 12 @ 3614ms | 12 in 3 groups @ 11223ms | 7609ms |
| I need a gift for my mom under $200 | prod_catalog | 12 @ 4257ms | **10** @ 10908ms | 6651ms |
| What was shown on Jewel School this week? | on_air_products | 5 @ 3262ms | 5 @ 7523ms | 4261ms |
| What did Misty feature this week? | on_air_products | 7 @ 3520ms | 7 @ 8272ms | 4752ms |
| Show me engagement rings | prod_catalog | 12 @ 3962ms | 12 @ 11330ms | 7368ms |
| Something bold in sterling silver | prod_catalog | 12 @ 3218ms | **11** @ 10162ms | 6944ms |
| Compare tanzanite and amethyst rings | prod_catalog | 22 @ 6158ms | **13** @ 13862ms | 7704ms |
| Show me clearance | prod_catalog | 12 @ 3142ms | 12 @ 10084ms | 6942ms |

Median wait between the two: **6,944ms**. Max 7,704ms. That is the prize, and
it is large.

## What killed it

**The display tool named fewer pieces than the search returned on 3 of 8
turns** — 2 of 12, 1 of 12, and 9 of 22. It is not a pure regrouping; it is a
selection step that happens to be lossless on easy questions.

The two where the curation is clearly correct are the two we must not undo:

- *"gift for my mom under $200"* left out two pieces. Price filtering is the
  one thing the agent cannot express in a search (platform questions, item 4),
  so this selection is the only place a budget is enforced at all. Showing the
  search output early would put the over-budget pieces back on screen.
- *"Compare tanzanite and amethyst rings"* left out nine of twenty-two. A
  comparison asks for a handful of comparable pieces, not everything matching
  two gemstones.

Rendering early and then removing is worse than rendering late: a tile that
disappears reads as a bug, and on the comparison question nine of them would.
Rendering early and *keeping* them is worse still — it would show exactly the
pieces the agent decided to exclude.

## What held up

Nothing was ever named that had not been searched — "named but never searched:
none" on all eight turns. So the record store always holds what the display
tool asks for, and the hydration path has no gap in it. That was the other
thing this run was checking.

## Where that leaves the wait

Client-side, nowhere: there is no correct thing to draw during those seven
seconds beyond the placeholder shelf already in place. The wait is a
server-side stall plus a genuine second model step, and both belong with the
platform team.

Re-run `compare-search-vs-grouped.mjs` after the step-cap and numeric-filter
questions are settled. If a comparison parameter ever reaches the search tool,
the budget selection moves into the search itself, the display tool's job
shrinks toward pure regrouping, and this verdict is worth revisiting.
