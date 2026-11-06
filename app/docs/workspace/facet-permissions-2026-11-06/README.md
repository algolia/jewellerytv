# The agent is not allowed to use the facets the prompt tells it to use

`searchControls.facets` on an index entry is a permission list. Algolia's
documentation for the search tool: *"Facets the AI can use to filter results.
Default: All available facets."* Set it, and the AI can only filter on what
is in it.

On `prod_catalog`, both agents, it is set to seven:

```
Pricing_PriceRange
Catalog_JewelryMaterialNavigationColor
Catalog_TargetConsumer
Pricing_DiscountPercentRange
Catalog_BasicMaterialInformationPrimary.BasicMaterialColor
Catalog_BagTypes
Catalog_Condition
```

Every facet the prompt instructs the agent to filter on is missing from it.

| The prompt says to filter | Allowed? |
| --- | --- |
| `Catalog_JewelryMaterialNavigationPurity` — sterling, 10K, 14K | **no** |
| `Catalog_JewelryMaterialNavigationName` — solid gold, not plated | **no** |
| `Catalog_GemstoneAndPearlNavigationName` — the stone | **no** |
| `Catalog_BrandNavigationName` — "Gems En Vogue" | **no** |
| `Catalog_TargetConsumer` — the recipient | yes |
| `Pricing_PriceRange` — the budget bands | yes |

So the three worked examples in the prompt, which exist because each one is a
measured failure, are instructions the agent cannot carry out. Nothing about
the wording fixes that.

## What it looks like from outside

Measured 2026-11-06 against both dev and production:

- "Show me sterling silver pendants" → `facetFilters: []`. The twelve pieces
  returned are **twelve of twelve gold-over-silver or plated**. With
  `Purity:Sterling` applied by hand the same query matches 2,812 pieces and
  none of the first twelve are plated.
- "She loves rubies" → `facetFilters: []`. The perfume trap the prompt warns
  about has nothing stopping it.
- "Show me gold jewelry" → the agent reached for
  `facet_Catalog_JewelryMaterialNavigationColor: ["Yellow"]`, which is the
  nearest *allowed* facet and the wrong one: yellow is a colour, so every
  gold-plated and yellow-toned piece stays in.

That last one is the tell. The model is not failing to filter; it is
substituting a permitted facet for the correct one.

## The confusing part, worth knowing before you debug this again

`enhancedDescription` advertises **116 facets** to the model, including all
four it is not allowed to use, with their values. So the model is shown
`Catalog_JewelryMaterialNavigationPurity: [Sterling, 10K, 14K, …]` and then
cannot filter on it. Whatever the generator reads, it is not the permission
list.

## The change

On the `prod_catalog` index entry, set `facets` to:

```
Pricing_PriceRange
Pricing_DiscountPercentRange
Catalog_JewelryMaterialNavigationColor
Catalog_JewelryMaterialNavigationPurity
Catalog_JewelryMaterialNavigationName
Catalog_GemstoneAndPearlNavigationName
Catalog_BrandNavigationName
Catalog_GemstoneInformationPrimary.GemstoneShape
Catalog_TargetConsumer
```

Four added because the prompt depends on them. `GemstoneShape` added because
it measures as a good narrowing axis (20 to 23 values on every query tried).
`TargetConsumer` kept: the chips exclude it by Arijit's ruling, but the
prompt's gift example filters on it.

Three dropped, all dead weight measured over three queries:

| Dropped | Values returned on "opal jewelry" / "gold hoop earrings" / "engagement ring" |
| --- | --- |
| `Catalog_BagTypes` | 0 / 0 / 0 |
| `Catalog_BasicMaterialInformationPrimary.BasicMaterialColor` | 0 / 0 / 0 |
| `Catalog_Condition` | 1 / 1 / 1 — the entry already hard-filters First Quality |

## Checking it

```sh
node probe-filters.mjs "Show me sterling silver pendants"
node probe-filters.mjs "She loves rubies, show me something"
node probe-filters.mjs "Show me gold jewelry"
```

Each prints what the model asked for and what Algolia ran. Pass is a
`Purity:Sterling`, a gemstone-name and a material-name filter respectively,
surviving into `facetFilters` rather than coming back empty. Run each a few
times: facet filtering is as bimodal as everything else here, and one clean
trace proves nothing.

The chips get better as a side effect — purity and gemstone shape are two new
narrowing axes, taking the funnel from three rows to five.
