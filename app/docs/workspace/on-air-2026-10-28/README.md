# On-air content, 2026-10-28

Bringing JTV's broadcast content (https://www.jtv.com/show) into the Concierge
as two indices: `on_air_shows` and `on_air_products`. Both are already declared
on the dev agent's `algolia_search_index` tool.

Two use cases in scope. Shopping a recent show ("what was on Jewel School this
week?") produces tiles. Following a host or series ("show me Misty's shows")
answers in prose with the replay link. "What's on right now" is deliberately out
of scope and the agent must refuse it.

No application code changes. The agent's search tool runs server-side at
Algolia, so the app's `INDICES` allowlist (`server/api.ts:13-20`) is not
involved, and the tool-sheet guard keys on tool names, which do not change.
Every on-air `objectID` is also a `prod_catalog` objectID, so on-air items reach
the shopper through the existing `present_products` tile path with no new client
tool. The work is agent configuration plus index records, which keeps it
portable into JTV's own environment.

## Contents

| File | What it is |
| --- | --- |
| `on_air_shows-description.md` | Paste block A: replacement index description |
| `on_air_products-description.md` | Paste block B: corrected index description |
| `instructions-on-air-section.md` | Paste block C: new instructions section |
| `verify-on-air.mjs` | Three connected turns, one per failure mode |

## Observed data, sampled read-only on 2026-10-28

`on_air_shows`, 111 records. Fields: `showId`, `title`, `seriesName`, `hosts[]`,
`date`, `startTimeLocal`, `endTimeLocal`, `startMinutes`, `status`,
`onDemandUrl`, `itemsUrl`, `showKey`. Facetable: `date`, `hosts`, `seriesName`,
`status`. Dates span 2026-10-21 to 2026-10-28. Status split: 109 aired, 1 live,
1 upcoming.

`on_air_products`, 1,821 records. Fields: `objectID` (= SKU), `showId`,
`positionInShow`, `name`, `brand`, `url`, `image`, `imageLarge`, `percentOff`,
`promoLabel`, `rating`, `stretchPayInstallments`, `stretchPayAmount`. Facetable:
`brand`, `showId`. No price and no stock field. 12 of 12 sampled objectIDs
resolve in `prod_catalog` with `Pricing_ActivePrice` and `Inventory_InStock`.

## Index record changes requested

In priority order. Items 1 and 2 are what make the use cases work.

1. **Relative recency on `on_air_shows`**, recomputed at each daily refresh:
   `recencyDays` (integer, 0 = today) as `filterOnly`, and `relativeDay` (string
   facet: `today`, `yesterday`, `2 days ago`). The agent has no clock: `today`,
   `current date` and `timezone` appear nowhere in its instructions, systemPrompt
   or config, so it cannot turn "yesterday" into a `date` filter. Without this,
   every relative ask either fails or invents a date.
2. **Denormalize show metadata onto `on_air_products`**: `showTitle`,
   `seriesName`, `hosts[]`, `showDate`, `recencyDays`, `relativeDay`,
   `onDemandUrl`, with `seriesName`, `hosts` and `relativeDay` facetable. Turns
   every host and series ask into one search instead of a two-step join.
3. **Populate or drop `onAirNow`, `estimatedPrice`, and `positionInShow: -1`.**
   The live tool description promises all three; none appear in a 1,000-record
   sample. Paste block B strips the claims.
4. **Make `promoLabel` and `percentOff` facetable.** Both exist as attributes but
   neither is in `attributesForFaceting`, so the "percentOff > 40" filter in the
   current description cannot execute. Only needed for a deals use case.
5. **`productCount` on `on_air_shows`**, so the agent can avoid opening a show
   with nothing shoppable behind it.
6. **Crawl the Program Guide** for real upcoming shows. Forward coverage is one
   record today, which is why the schedule use case can only look backwards.

`prod_catalog` is unchanged and stays read-only.

## Verify

Start the configured local stack, apply blocks A, B and C to the development
agent, then:

```sh
JTV_APP_URL=http://localhost:5173/ node docs/workspace/on-air-2026-10-28/verify-on-air.mjs
```

It prints the reply prose, the tile count, the links, and the
`present_products` receipt (requested vs shown objectIDs, with drop reasons) for
each of the three turns, and writes screenshots plus `turns.json` to a fresh run
directory. Consumes three agent completions.

Pass looks like: tiles present and a receipt on turn 1, zero tiles and a replay
link on turn 2, zero tiles and no airtime claim on turn 3.
