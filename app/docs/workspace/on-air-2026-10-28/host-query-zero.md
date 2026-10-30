# Why a host or series question costs an extra step

`on_air_products` has:

```
searchableAttributes:   ['name', 'brand', 'sku']
attributesForFaceting:  [... 'searchable(hosts)', 'searchable(seriesName)',
                         'searchable(showId)', 'searchable(brand)']
```

`searchable()` inside `attributesForFaceting` makes a facet's **values**
searchable — it is what powers a "find a host" box in a refinement list. It
does **not** put the attribute into the query index. `hosts` and `seriesName`
are therefore not matchable by a text query, and the two settings read as if
they are.

The agent writes the belt-and-braces form, which is the natural one:

| Search | Hits |
|---|---|
| `query: "Misty"` alone | 1 |
| `facetFilters: [["hosts:Misty"]]` alone | 304 |
| **both together** | **0** |

The single hit for the bare query is a product whose *name* contains the word;
intersecting that with the host filter leaves nothing. Deterministic — six
identical direct queries, zero every time.

## What it costs

Traced on "What did Misty feature this week?" after the `allOptional` change:

```
step 1  query "Misty" + facet hosts:Misty   ->  0 hits
step 2  same facet, no query text           -> 12 hits
step 3  query "" + facet_showId (12 ids)
step 4  query "" + facet_showId (9 ids)     -> 12 hits
step 5  MaxStepsPerCompletionError
```

Step 1 is spent on this. Steps 3 and 4 are a second problem — the agent fanning
out over `showId` after it already had products, which the one-search rewrite
of the on-air section was meant to stop.

## Fix

**Index, preferred.** Add `hosts`, `seriesName` and `showTitle` to
`searchableAttributes`. The agent's instinct becomes correct instead of empty,
and a shopper typing a host name into the storefront search finds their shows
too. Nothing else depends on the current list.

**Prompt, as a stopgap.** Add to the `# On-air shows` section:

```
- Do: when filtering by host, series or show, filter only — leave the query
  text empty. Host and series names are filter values, not words in a piece's
  name, so putting the name in the query as well returns nothing.
- Don't: look up shows and then search their ids. The pieces already carry
  their show, so one search answers it; a second pass over show ids spends the
  turn's budget and can end it early.
```

Worth noting the prompt also still carries, at line 71 of `instructions.md`:
*"When a first shelf comes back empty or thin, search again with different
facet values"* — correct advice written when the empties were unavoidable, and
now an amplifier. Each genuinely-empty search becomes two steps of five.
