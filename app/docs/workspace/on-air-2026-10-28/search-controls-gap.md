# Paste block D: search controls for the on-air indices

## What was observed

Verification run `run-2026-10-28T19-24-15`, dev agent, three turns:

| Turn | Result |
| --- | --- |
| "What's on right now?" | **PASS.** Refuses the live claim, names the eight-day window, points at the Program Guide. |
| "What was on Jewel School this week?" | **FAIL.** Zero tiles. Reply: "I wasn't able to pull up the Jewel School schedule just now due to a technical hiccup on my end." |
| "Show me Misty's shows" | **FAIL.** Zero tiles. Reply: "I'm having trouble reaching the show schedule tool right now." |

The app server logged no error and returned no non-200, so `/api/chat` itself
succeeded. The failure is inside the agent run, at a tool step.

Every filter the agent needs works when issued directly against Algolia with the
same search key, so the index settings are not the cause:
`relativeDay:yesterday` 13 shows, `seriesName:"Jewel School"` 12 shows / 222
products, `hosts:Misty` 16 shows / 305 products, `recencyDays < 3` 38 shows,
`showId:283134` 8 products, `outOfStock:false` 2,847 products.

## Prime suspect

Both on-air entries in the agent's `algolia_search_index` tool have:

```
on_air_shows    | searchParameters: null | searchControls: null
on_air_products | searchParameters: null | searchControls: null
```

All four working indices have a fully populated `searchControls` object
(`query`, `hitsPerPage`, `page`, `attributesToRetrieve`, `responseFields`,
`distinct`, `facets`, `custom`). `blog` and `help_content` also have
`searchParameters: null`, so the null search *parameters* are fine; the null
search *controls* are the one thing unique to the two failing indices.

This is a suspicion, not a proof. The definitive answer is in the Agent Studio
transcript, which `scripts/conversation-reader` can print, but it requires
`BLOG_INDEX_API_KEY` in the root `.env.local` and only the search key is present.

## Fix to apply

Open each on-air index entry in the tool configuration and save its search
controls so the object materializes. Suggested values, mirroring the shape the
working indices use.

**`on_air_shows`**
- `hitsPerPage`: default 6, min 1, max 12, not exposed
- `page`: default 0, min 0, max 1, not exposed
- `attributesToRetrieve` default: `objectID`, `showId`, `title`, `seriesName`,
  `hosts`, `date`, `relativeDay`, `recencyDays`, `startTimeLocal`,
  `endTimeLocal`, `status`, `onDemandUrl`, `itemsUrl`
- `responseFields` default: `hits`, `nbHits`, `page`, `nbPages`, `hitsPerPage`,
  `facets`, `queryID`
- `distinct`: false. `custom`: analytics, clickAnalytics and enableABTest all off.

**`on_air_products`**
- `hitsPerPage`: default 12, min 1, max 24, not exposed. The display tool accepts
  at most 24 objectIDs and shows at most 9, so 12 gives it room to choose.
- `page`: default 0, min 0, max 2, not exposed
- `attributesToRetrieve` default: `objectID`, `sku`, `name`, `brand`, `image`,
  `imageLarge`, `url`, `promoLabel`, `percentOff`, `rating`, `showId`,
  `seriesName`, `hosts`, `relativeDay`, `recencyDays`, `outOfStock`
- `responseFields` and `custom`: same as above. `distinct`: false.

**Also worth setting:** `searchParameters.filters = "outOfStock:false"` on
`on_air_products`, exactly as `prod_catalog` carries
`filters: "Inventory_InStock:true"`. Measured on the first 24 hits per ask, 3 to
6 items were dropped as `out_of_stock` at display time; this filters them before
the model ever sees them.

## After the fix

```sh
JTV_APP_URL=http://localhost:5175/ node docs/workspace/on-air-2026-10-28/verify-on-air.mjs
```

Expected: turn 1 shows tiles with a `present_products` receipt, turn 2 shows
prose with the replay link and no tiles, turn 3 keeps refusing. Shelf depth is
not a risk: resolving the first 24 SKUs of each ask against `prod_catalog` gave
18, 24 and 21 admissible items, all clear of the six-tile shelf floor, with zero
`not_found`, zero `unpriced` and zero `no_image`.
