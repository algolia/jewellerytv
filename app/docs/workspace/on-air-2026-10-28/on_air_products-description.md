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

Key fields: `name`, `brand` (filterable), `sku`, `url` (product page), `image`
and `imageLarge`, `promoLabel` (for example "New Arrival", "Power Buy"),
`percentOff`, `rating` (0-5, unrated items have none), `showId` (filterable, which
broadcast the item belongs to), `positionInShow` (order within the show).

Every `objectID` here is also a `prod_catalog` objectID. Pass the objectIDs
straight to the display tool: it reads the live catalogue record, so the tiles
carry the exact current price and stock. This index has no price field of its
own, so never quote a price, a discount or an installment figure from it.

The same product appears once per show it aired on, so expect repeat SKUs across
shows. Filter by `showId` to get one show's line-up, or by `brand`.

To find the show first, search `on_air_shows` by series, host or date and use its
`showId` here.

---8<--- paste to here ---8<---

## Add this paragraph once show metadata is denormalized

Today a product record carries only `showId` and `positionInShow`, so every
host or series question needs a two-step join. Once `showTitle`, `seriesName`,
`hosts`, `showDate`, `recencyDays` and `relativeDay` are on the product records
and the first three are facetable, append:

> Each record also carries its show's `showTitle`, `seriesName`, `hosts`,
> `showDate`, `recencyDays` and `relativeDay`. Prefer one search here over a
> join: `hosts:Misty`, `seriesName:"Jewel School"`, `relativeDay:yesterday`.
