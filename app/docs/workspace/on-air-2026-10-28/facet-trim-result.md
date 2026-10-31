# After the facet shortlist and the retrieve trim

Measured 2026-10-30, caching off, same eight questions as every other batch
tonight (`../simplification-2026-10-28/measure-turn-shape.mjs`).

## Faster, by a third

| | before | after |
|---|---|---|
| median turn | 14,920ms | **10,060ms** |
| median time to first hits | 4,097ms | 3,669ms |
| turns at 3 steps / 1 search | 7 of 8 | **8 of 8** |
| turns with more than one search | 1 of 8 | 0 of 8 |
| failures | 0 of 8 | 0 of 8 |

Tool output per search fell from 131,869 characters for 7 hits — the whole
record, 75 attributes, 18,838 per hit — to 3,902, of which 2,220 is hits, 1,604
is facet counts and the rest is the envelope. That is a **97% cut** in the
largest single input the model reads each turn, and it is where the third of
the latency went.

The eight facets come back with workable counts: 43 gemstone values on an opal
query, 11 materials, 8 product types, 7 price bands, 6 colours, 3 target
consumers, 8 discount ranges, 1 condition.

## The new facets are being used, and they close two feedback items

Both appear unprompted in real searches:

- *"I want a gift for my husband"* → three queries, every one carrying
  `facet_Catalog_TargetConsumer: ["Men"]`. This is the item where a men's ask
  came back with a women's bracelet.
- Every catalogue search now carries `facet_Catalog_Condition:
  ["First Quality"]`, which is the item about pre-owned pieces appearing
  unexpectedly.

## Two things to watch

**Shelves are thinner.** Seven pieces on six of the eight questions, where
every earlier batch returned twelve. Worth confirming whether `hitsPerPage`
changed with the rest of the search controls, because a seven-piece shelf is
noticeably emptier than a twelve-piece one in a two-column grid.

**The agent can no longer see a price.** The retrieved attributes are
`objectID`, `Catalog_TitleDescription` and `Media_Images` — enough to draw a
tile, not enough to apply the rules the instructions give it. The instructions
say "the search result lists each piece's name, material and price" and
require dropping a piece "whose material or gemstone fields contradict what the
shopper named". Neither field is present now.

Measured consequence, on a cap that falls inside a price band:

| Ask | displayed | over budget |
|---|---|---|
| gift for my mom under $200 | 9 | 0 of 9 |
| necklaces under $150 | 7 | **1 of 7** — $158.99 |

The $200 ask is clean because the bands align with it. The $150 ask leaks for
the same reason it always did — `$100 - $200` straddles the cap — but it is
now structurally unfixable rather than merely unfixed: before the trim the
agent at least received `Pricing_ActivePrice` and could have dropped the
over-budget piece after the search. It cannot now.

## Suggested addition

Six attributes, measured at 414 characters across 7 hits — about 59 per hit,
or 14% on top of the current 421:

| Attribute | chars / 7 hits | Restores |
|---|---|---|
| `Pricing_ActivePrice` | 38 | Post-search budget filtering |
| `Inventory_InStock` | 29 | The stock rule |
| `Catalog_JewelryMaterialNavigationName` | 95 | "Gold over sterling silver is not a sterling silver piece" |
| `Catalog_GemstoneAndPearlNavigationName` | 84 | The same rule for stones |
| `Catalog_Condition` | 105 | Naming a pre-owned piece as pre-owned |
| `Catalog_TargetConsumer` | 63 | Confirming a men's ask stayed men's |

That is 97% saved rather than 98%, and the prompt's post-search rules become
executable again.
