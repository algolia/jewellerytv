# Paste block B: `on_air_products` index description

Replace the description for the `on_air_products` entry in the agent's
`algolia_search_index` tool. The existing text is well written; this keeps its
shape and fixes the claims that do not match the indexed data.

What changed and why:

- Removed `onAirNow`. Absent from all 1,000 records sampled. The model would
  filter on it and get nothing.
- Removed `estimatedPrice` and the StretchPay price math. Also absent. And the
  price is available for real: every on-air `objectID` is a `prod_catalog`
  objectID, so the product tiles carry the exact price and stock already.
- Removed `positionInShow: -1` for the on-air item. Sampled values start at 0;
  no record carries -1.
- Removed "filter by promoLabel, or percentOff > 40". Neither attribute is in
  `attributesForFaceting`, so those filters cannot execute. Put the sentence
  back if you make them facetable.

---8<--- paste from here ---8<---

Products featured on JTV's live shopping TV programs (jewelry, watches,
gemstones, jewelry-making supplies, beauty), covering roughly the last eight
days. One record is one product shown during one broadcast. Use this index when
a shopper asks what was sold on air: items from a particular show or host's
segment, or recently featured items by brand, name or SKU. Do not use it as the
full JTV catalog. It holds only items that aired recently, so it cannot answer
questions about the whole store or about anything that has not aired lately.

Every record carries its own show, so one search here answers a host, series or
recency question. Never look a show up first and then search its `showId`: the
show fields are on the product.

Show fields on every record: `seriesName` (filterable and searchable),
`hosts` (filterable, searchable, multi-valued), `showTitle` (searchable),
`showId` (filterable), `showDate`, `relativeDay` (filterable), `recencyDays`
(filterable), `onDemandUrl`.

Product fields: `name`, `brand` (filterable, searchable), `sku`, `url`
(product page), `image` and `imageLarge`, `promoLabel` (filterable, for example
"New Arrival", "Power Buy"), `percentOff`, `rating` (0-5, unrated items have
none), `outOfStock` (filterable), `positionInShow` (order within the show).

Filter examples: `hosts:Misty`, `seriesName:"Jewel School"`,
`relativeDay:yesterday`, `brand:Bella Luce`, `outOfStock:false`. Copy facet
values verbatim from the facet counts; do not compose them from the shopper's
phrasing. Filters match a value exactly and cannot carry a comparison, so
`recencyDays` is usable as `relativeDay:yesterday` or an exact
`recencyDays:2`, never as a range.

Every `objectID` here is also a `prod_catalog` objectID. Pass the objectIDs
straight to the display tool: it reads the live catalog record, so the tiles
carry the exact current price and stock. This index has no price field of its
own, so never quote a price, a discount or an installment figure from it.

The same product appears once per show it aired on, so expect repeat SKUs
across shows.

---8<--- paste to here ---8<---

## Revision 2026-10-30

The block above replaces the 2026-10-28 draft, whose two "once the data lands"
appendices have both landed and whose main text was costing steps.

- **The join instruction is gone.** It said "To find the show first, search
  `on_air_shows` by series, host or date and use its `showId` here." The
  denormalisation has since landed, and a trace of "What did Misty feature this
  week?" showed the agent doing exactly what the description told it — two
  searches over `facet_showId` after it already had the products, finishing at
  the step cap. The replacement states the opposite rule explicitly.
- **The denormalised show fields are now listed** rather than held back in an
  appendix.
- **`outOfStock` added.** It is in `attributesForFaceting` and 15 of one host's
  305 items are sold out, so without it they take slots before the display
  gate sees them.
- **`promoLabel` added as filterable** — it is in `attributesForFaceting` now.
  `percentOff` is `filterOnly`, so it filters by exact value only; the old
  "percentOff > 40" sentence stays out until a comparison parameter exists.
- **An explicit note that filters cannot carry a comparison.** A captured
  failure began with `facet_recencyDays: ["<7"]`, which returns zero without
  erroring because `<7` is read as a literal facet value.
- `hosts`, `seriesName` and `showTitle` were added to `searchableAttributes`
  on 2026-10-29, so they are marked searchable as well as filterable.
