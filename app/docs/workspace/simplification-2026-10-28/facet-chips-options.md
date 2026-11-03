# Bringing filter chips back, catalogue only

## Short answer

Yes, and the scoping is the easy part. The search tool is still one tool per
index, so the tool name on the call says which index answered:

```
algolia_search_index_prod_catalog     -> show chips
algolia_search_index_on_air_products  -> show none
```

The facet data is already in the conversation. Every catalogue search returns
counts for the nine facets:

```
Catalog_GemstoneAndPearlNavigationName, Catalog_JewelryMaterialNavigationColor,
Catalog_JewelryMaterialNavigationName, Catalog_ProductType,
Catalog_TargetConsumer, Catalog_Condition, Pricing_PriceRange,
Pricing_DiscountPercentRange, …
```

and every on-air search returns its own eight (`hosts`, `seriesName`,
`showId`, `relativeDay`, …) which we would ignore. **No agent change is
needed for the data** — this is a rendering question.

## Where they would live

Inside the display gate, under the shelf, as part of the message.

That matters because of the original complaint: *"the filter chips keep
popping up and disappearing on every message."* The old chips were a
persistent bar outside the transcript, so every turn rewrote them in place.
Anchored to the turn that produced them, they scroll away with it and nothing
flickers.

## What a click does — three options

### A. Re-ask the agent (recommended)

The chip sends a message: "Show me the white gold ones."

- **Pro:** honest. The agent re-searches with the refinement, so the prose,
  the grouping and the pieces all agree afterwards.
- **Pro:** nothing new to keep in sync. No client-side filter state, no second
  source of truth about what is on screen.
- **Con:** costs a turn, about 6 seconds. A chip that feels like a filter but
  behaves like a question.
- **Con:** no guarantee the agent honours it. Phrasing the message explicitly
  ("only white gold") helps; it is still a request, not a filter.
- **Work:** `sendMessage` is not on the tool context — it would be closed over
  from the chat instance in `JtvChat`, the way `onClose` already is for the
  header.

### B. Filter the tiles client-side

- **Pro:** instant, no turn.
- **Con:** it filters the twelve pieces on screen, not the result set. "White
  gold" on a shelf of twelve can leave two, which reads as a broken filter
  rather than a narrow one.
- **Con:** the reply above the shelf no longer describes the shelf.
- Not recommended. This is the version that makes chips feel untrustworthy.

### C. Hand off to the storefront search page

The library already does this — `applyFilters` is on the tool context and the
carousel tool's "View all" uses it to push the conversation's filters into the
index UI state.

- **Pro:** nearly free; it is wired already.
- **Pro:** the shopper gets the real result set with the real facet UI.
- **Con:** it ends the conversation, which is the thing the panel exists to
  avoid. Previously deferred for that reason.
- Worth having **as well** as A, on a "see all 1,240" affordance rather than
  on the chips themselves.

## Which facets to show

Not all nine. Two attributes, three or four values each, chosen by count,
skipping any attribute with one value and any the search already filtered on.
The strongest candidates are the cheap, high-coverage ones:
`Catalog_JewelryMaterialNavigationColor` (16 values), `Pricing_PriceRange`
(7), `Catalog_GemstoneInformation.GemstoneCreationClassification` (7).

**Do not show the counts.** They describe the whole result set, and next to
twelve tiles "White (1,240)" invites the question of where the other 1,228
are.

## Cost

Around 200 lines with tests, half a day:

| | |
|---|---|
| Read the sibling search part's facets from the message | ~30 lines |
| Pick attributes and values, skip what is already filtered | ~40 lines |
| Render, and send on click | ~40 lines |
| CSS | ~30 lines |
| Unit and e2e tests | ~80 lines |

## The argument against

It puts back a surface the simplification push removed, and the concierge has
to be deployable into JTV's own environment. Every component of ours is
something they inherit. The honest counterweight is that this is one small
read-only component reading data already on the wire — not the four-layer
pipeline that was deleted.

## One thing to fix either way

`instructions.md` line 103 tells the agent to pass "the one to three facet
attributes from the search's facet counts" to the display tool. The display
tool's input carries only `intro` and `groups` — there is no facet field, and
there has not been one. That instruction has been dead the whole time and
should come out whichever option is chosen.

## Noticed while checking

The agent config has drifted since the last measurement: the search tool is
per-index again rather than the single `algolia_search_index`, the full facet
list is back in the tool input as explicit nulls (about 120 parameters on a
catalogue search), and `algolia_search_for_facet_values` is being called
again. Worth confirming that is intended before taking any more timings.
