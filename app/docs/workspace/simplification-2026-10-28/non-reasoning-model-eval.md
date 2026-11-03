# Eval on the non-reasoning model

Two full runs of the eight questions, caching off, plus shape probes.

## Timing: no story

| | run 1 | run 2 |
|---|---|---|
| median turn | 7,721ms | 6,547ms |

Both sit inside the 5.7–9.0s band the same eight questions have produced
across five runs on three configurations. Nothing to conclude from the median.

**One timing signal is real**, because it is tight rather than large: time to
first hits was 1,442–2,934ms across all sixteen turns, median ~2.0s, against
3.3–3.9s on the previous model. Sixteen of sixteen under three seconds is a
distribution, not a coin flip.

## The search tool is a different tool

This is the thing worth knowing, and it was not a configuration change.

| | previous model | this model |
|---|---|---|
| name | `algolia_search_index_prod_catalog` (one per index) | `algolia_search_index` (one, generic) |
| input | `{queries: [{query, facet_<attribute>: [...]}], attributesToRetrieve, …}` | `{index, query, number_of_results, facet_filters}` |
| filters | `facet_Catalog_TargetConsumer: ["Men"]` | `facet_filters: ["hosts:Misty"]` |
| page size | implicit | `number_of_results: 40`–`60` |

An earlier note claimed the tool had "drifted" to per-index, then retracted it
when the owner confirmed nothing was changed on their side. Both halves were
partly wrong: the sighting was real, the configuration genuinely did not
change, and **the tool surface tracks the model**. Worth asking Agent Studio
why — a prompt written against one shape is wrong against the other.

### Two consequences, both immediate

**The system prompt's facet examples are now wrong.** The rewrite teaches
`facet_Catalog_JewelryMaterialNavigationName: ["Gold"]`. This tool takes
`facet_filters: ["Catalog_JewelryMaterialNavigationName:Gold"]` — which is the
syntax the *old* prompt used and the rewrite "corrected". The old syntax was
right for this tool shape.

**The retrieve trim is gone.** No `attributesToRetrieve` in the input, so the
full record comes back:

| | after the trim | now |
|---|---|---|
| hits per search | 7–12 | **40–60** |
| chars per hit | 421 | **9,753** |
| tool output per search | 3,902 | **390,138** |

A hundredfold increase in the largest thing the model reads each turn, undoing
the single biggest win of the facet-and-retrieve work. The usual offenders are
back at the top: `SearchKeywordDescriptions`,
`ConsumerProductCategoryHierarchyDisplayNames`, and both spellings of
`HierarchialCategories` and `HierarchicalCategories`.

## Quality

**Good.** A budget ask returned 8 pieces, none over $150 — better than the
1-in-7 leak measured on the previous model. Shopping turns call the display
tool, groups come back 4/4, and the intro is a sentence again.

**One regression.** "Compare tanzanite and amethyst rings" ran three searches,
never called the display tool, and answered in prose with no pieces at all.
Both eval runs show that question returning 2 and 3 hits where it previously
returned 22. A comparison is one of the use cases the team raised by name, so
it is worth a look before the model choice is settled.

## What to do

1. Re-apply `attributesToRetrieve` on this tool shape, or confirm it cannot
   take one. The payload is the finding here.
2. Fix the facet syntax in the system prompt to match whichever tool shape the
   chosen model gets — and note in the prompt that it is shape-specific.
3. Investigate why a comparison returns three hits and no shelf.
