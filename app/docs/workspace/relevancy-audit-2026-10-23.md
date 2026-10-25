# Core search relevancy audit — first pass, 2026-10-23

Trigger: Arijit, 2026-10-23 — "the core search has to be much better, and the presentation of
the product assortments and the product choices have to be better."

Method: the eight representative shopper queries below, run through the local API proxy
against `prod_catalog` (the same path production traffic takes), top-3 recorded. Measured data;
no speculation. Boundary: ranking and searchable attributes are index configuration, which is
strictly read-only for us — index-side items are recommendations for JTV/Algolia, not changes.

## Measured findings

### F1. Numbers in the query hijack the match — worst finding
Query: `sapphire ring under 500` → **1 result**: "Gold & Silver Tone Heart Shape Jump Rings
in Assorted Sizes **Set of 500**". No sapphire ring anywhere.
The number 500 matched a literal "500" in one record and the real intent (sapphire rings
priced under $500) was lost. Shoppers type prices constantly.

### F2. Brand queries return non-brand products
Query: `Bella Luce` → 3,883 results, top-3 are Platineve charms with no Bella Luce connection.
The brand name lives in the `Catalog_Brand` facet, which is not in the searchable-attributes
set, so keyword search cannot see it. Same shape for every brand query.

### F3. Head-noun queries under-weight the material
Query: `pearl necklace` → top-3 are turquoise, opal and amethyst necklaces. Zero pearls in
the top three. "Necklace" alone outranks the shopper's actual subject.

### F4. Product-type bleed on cross queries
Query: `cross necklace` → top hit is a Hearts & Cross **charm**, then a rosary. Charms,
pendants and necklaces interleave; the head noun is only partially honored.

### Healthy controls (for contrast)
`tanzanite ring`, `gold hoop earrings`, `moissanite`, `gemstone bracelets` all return
correctly-led result sets. The problems are systematic, not universal.

## Recommendations, by owner

### A. Agent-side (our lane, actionable now)
- Price-in-query handling: the agent's search tool cannot send numericFilters (platform
  rejects them), but it CAN use the `facet_Pricing_PriceRange` bands. Teach the agent (one
  rule + worked example): "when the shopper names a price ceiling, add the matching price
  band to the search instead of putting the number in the query." F1's shopper would then
  get sapphire rings in the "$200 - $500" band.
- This is the same instruction-method as rounds 1-7: one rule, worked example, fresh-literal
  verification.

### B. App-side (our lane, small and deterministic)
- Consider mapping a leading brand name to the `Catalog_Brand` filter when the brand exists
  in the facet (the shell brand links already do exactly this via `/search?brand=`). A
  shopper typing the brand in the search box gets the same treatment. Edges to decide:
  brand-name detection (facet value list is small and known), and what happens when the
  brand term is combined with product words.

### C. Index-side (JTV/Algolia decision, read-only for us — recommendation only)
- Add `Catalog_Brand` (or `Catalog_BrandNavigationName`) to the searchable-attributes set, or
  as an attributeForDistinct-adjacent ranking signal, so brand queries rank brand products.
- Check customRanking/attribute weighting so the head noun (necklace/bracelet/ring from
  `Catalog_ProductType`) outranks generic matches — this addresses F3 and F4.
- These are the customer's index; any change goes through JTV with our data attached.

## Related, already fixed today
- Same-design variants filling two tiles: fixed deterministically in the display validator
  (design-variant dedup, PR #44) and live on production.
- Directions presented as text with no product tiles: fixed by the canvas-mandatory rule
  (round 7), live on production, verified.

## Next steps
1. A (agent price-band rule) — smallest loop, directly fixes the worst measured failure.
2. C — package this audit for JTV/Algolia with the query/result evidence.
3. B — design decision on brand-detection edges before implementing.
