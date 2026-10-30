# Which facets to give the agent

Chosen from the 150 in `prod_catalog`'s `attributesForFaceting` by measuring
each candidate against the live index: how much of the catalogue it covers,
and how many distinct values it carries. Coverage over 100% means the
attribute is multi-valued. Catalogue total: 77,003 records.

Both numbers matter and they pull against each other. Coverage decides whether
a facet is usable on an arbitrary question; value count is the cost, because
the vocabulary is enumerated into the agent's context on every turn — facet
vocabulary was 52% of the static prompt when it was last measured.

## The nine

| # | Attribute | Values | Coverage | Why it earns a slot |
|---|---|---|---|---|
| 1 | `Catalog_ProductType` | 252 | 128.6% | The noun in almost every question — Ring, Earrings, Pendant, Necklace. Expensive in values and unavoidable. |
| 2 | `Catalog_GemstoneAndPearlNavigationName` | 161 | 90.1% | The most JTV attribute there is. Opal, tanzanite, pearl, moissanite asks all land here. |
| 3 | `Pricing_PriceRange` | 7 | 128.6% | Seven values, and until a comparison parameter reaches the search tool it is the **only** way to act on a budget at all. |
| 4 | `Catalog_JewelryMaterialNavigationName` | 64 | 111.9% | Gold, Silver, Gold Over Silver, Platineve. This is what the instructions' "gold over sterling silver is not a sterling silver piece" rule needs to enforce itself in the search rather than after it. |
| 5 | `Catalog_JewelryMaterialNavigationColor` | 16 | 113.5% | White, Yellow, Two-tone, Rose. "I only wear white gold" is one of our own starter chips. |
| 6 | `Catalog_GemstoneInformation.GemstoneCreationClassification` | 7 | 68.5% | Natural, Lab Created, Lab-Grown, Mined. Seven values, and it is the whole of the Bella vs moissanite vs lab-grown question the team keeps raising. |
| 7 | `Catalog_TargetConsumer` | 4 | 153.3% | Women, Men, Girls, Boys. The best ratio on the list, and it is the fix for "I asked for a gift for my husband and got a women's bracelet". |
| 8 | `Catalog_Condition` | 2 | 128.6% | First Quality, Pre-Owned. Two values. The feedback flagged being shown pre-owned pieces without expecting them. |
| 9 | `Pricing_DiscountPercentRange` | 10 | 60.9% | Ten values, and "show me clearance" is both a starter chip and a feedback item. |

Total vocabulary: about 523 values, against roughly 150 attributes today.

Six of the nine cost ten values or fewer. Two — `ProductType` and
`GemstoneAndPearlNavigationName` — account for 79% of the vocabulary and are
the two that cannot be dropped.

## If a tenth is wanted

`Catalog_RingType` (33 values, 37.1% — Band, Halo, Solitaire, Engagement) or
`Catalog_EarringType` (29, 31.3% — Hoop, Stud, Dangle, Drop). These are the
style words the feedback's diamond-hoop example turns on. The catch is that
the vocabulary is split across `RingType`, `NecklaceType`, `EarringType`,
`PendantType` and `BraceletType`, so covering style properly costs five slots
for five partial coverages. Pick one only if a specific category matters most.

## Deliberately excluded

| Attribute | Values | Coverage | Why not |
|---|---|---|---|
| `Catalog_Motif` | **606** | 35.8% | The single largest vocabulary in the index for a third of the catalogue. Heart, Cross, Flower are reachable through the query text instead. |
| `Catalog_BrandNavigationName` | **414** | 47.9% | Too large to enumerate. Brand is already `searchable(Catalog_Brand)` and brand names appear in product names, so "Bella Luce" works as query text. |
| `Catalog_GemstoneInformationPrimary.*` | 135, 39, 7 | ~59% | Near-duplicates of the `GemstoneInformation.*` and navigation attributes already chosen, at lower coverage. Duplicate vocabulary is what made the prompt large. |
| `Inventory_AvailableSkuSizeNames` | 123 | 102.9% | High coverage, but size is a decision made on the product page, not during discovery. |
| `Catalog_Occasion` | 15 | **5.5%** | Reads perfectly — Anniversary, Wedding, Christmas, Graduation — and covers one record in eighteen. A filter that silently discards 94% of the catalogue is worse than no filter. |
| `Catalog_Collection` | 33 | 8.1% | Same problem. |
| `Catalog_WatchStyle` | 4 | 4.0% | The feedback's watch-style example lives here, but at 4% coverage it only works once the shopper is already in watches. |
| Eyewear, fragrance, bead, wire, bag families | — | under 5% | Category-specific, and the catalogue is overwhelmingly jewelry. |

## Two data problems found while measuring

- `hierarchialCategories.lvl0` and `.lvl1` are declared `searchable()` in
  `attributesForFaceting` and return **zero facet values**. Either the records
  do not carry them or they are spelled differently in the data — note the
  declared spelling is "hierarchial", not "hierarchical".
- `Catalog_PrimaryColorGroup` is declared and also returns zero values.
- `Catalog_Designer` has 7 values at 0.0% coverage — effectively empty.

None of the three can do anything for the agent as they stand.
