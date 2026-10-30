# Agent Studio platform questions

Three items for the Agent Studio team, found while measuring turn latency on
2026-10-29. Each one is recorded with what we measured rather than what we
assume.

## 1. Response caching is on by default, and it caches the whole response

`completions?cache=true` is a no-op: caching is the platform default.
`cache=false` bypasses it at full cost.

Measured against the dev agent, same question twice:

| | uncached | cached |
|---|---|---|
| turn latency | 13.4 s | 0.2 – 0.4 s |
| reply text | — | byte-identical |
| product objectIDs | — | identical |

So this is not prompt-prefix caching, it is a full response cache keyed on the
request. Two consequences:

- **Any latency measurement is invalid unless caching is accounted for.** Our
  first attempt at an A/B on static-prompt size produced three "turns" at
  ~135 ms, all cache hits, and had to be thrown away.
- **Freshness.** The on-air indices refresh daily and stock moves continuously.
  A cached answer can outlive the thing it describes: a sold-out item or a show
  that has rolled out of the eight-day window will still be returned, with the
  same objectIDs, for as long as the entry lives.

We are leaving it on for now because the latency win is large and the demo
re-asks the same questions. **What we would like to know:** the TTL, the exact
cache key (does it include the agent version and the index contents, or only
the message?), and whether a per-index or per-tool opt-out exists so that
stock- and schedule-sensitive answers can bypass while the rest stays cached.

## 2. A four-second stall between the display tool's intro and its first group

This is the pause shoppers report as "it hangs after the text, then everything
appears at once". Timestamping the SSE stream on a real turn ("Show me opal
jewelry", `cache=false`) puts it in one place:

```
 6720ms  tool-input-start (algolia_grouped_results)
         ... streams 86 chars: {"intro": "Here's a first look at opal jewelry..."
 6744ms  STALL 4003ms
10747ms  ... remaining 996 chars: 3 groups, 12 objectIDs, in 360ms
11107ms  tool-input-available
```

The whole tool input is 1,082 characters across 158 deltas with a median
inter-delta gap of 0ms, so this is not generation throughput. One stall of
4,003ms accounts for 91% of the phase, and it lands at exactly the boundary
between the intro string and the `groups` array. A second run put the same
stall at 5,785ms, in the same position.

Our side of it is handled: progressive rendering is on, so groups render as
they stream, and the panel now shows a placeholder shelf during the stall
rather than an empty block. But the four seconds are real and they are the
largest single component of a 17.6s turn.

**What we would like to know:** what runs between the intro and the first
group — a re-rank, a validation pass, a second retrieval — and whether it can
start before the intro is written rather than after. A related ask: `intro` is
a field we discard (the model has already said the same thing in the message),
so if it could be omitted the stall would at least not be preceded by output
nobody reads.

## 3. Something caps a completion at 5 steps regardless of `max_iterations`

Corrects an earlier note in this file that put the ceiling at 3. Counting
`start-step` events in a captured failing stream
(`../simplification-2026-10-28/max-call-error.txt`, message
`alg_msg_9n5BDJFXQ6UX13kH`) gives 5:

| Step | What it did | Result |
|---|---|---|
| 1 | `on_air_products`, `facet_recencyDays: ["<7"]`, 4-word query | `nbHits: 0` |
| 2 | `on_air_products`, same 4 words singular, no filter | `nbHits: 0` |
| 3 | `on_air_products`, `"gold ring"` | 345 hits |
| 4 | `algolia_grouped_results` | `{"status": "success"}` |
| 5 | closing text | `MaxStepsPerCompletionError`, 400 |

Four steps complete; the error fires as the fifth begins, and the closing text
block is itself a step. `config.max_iterations` was 10 for this capture and
raising it to 15 did not move the ceiling, which is the part that needs
explaining: if the cap were config-driven, 15 would have let this turn finish.

## 3a. Two silently-empty searches, which is what actually spent the budget

Worth separating from the cap, because the turn only needed three steps. Both
empty searches are reproducible against the index directly:

**Multi-word queries return nothing on `on_air_products`.** It carries
`removeWordsIfNoResults: "none"` and no `optionalWords`, so every term must
match. `prod_catalog` has `removeWordsIfNoResults: "firstWords"` plus an
`optionalWords` list and degrades instead:

| Query | `on_air_products` | `prod_catalog` |
|---|---|---|
| `rings necklaces earrings bracelets` | 0 | 1 |
| `ring necklace earring bracelet` | 0 | — |
| `gold ring` | 345 | 10,442 |

**An operator in a facet filter returns nothing, without erroring.**
`facetFilters: [["recencyDays:<7"]]` is read as a literal facet value `<7`,
which no record carries, so it comes back `nbHits: 0` rather than as an error.
The numeric form returns the records:

| Form | Result |
|---|---|
| `facetFilters: [["recencyDays:<7"]]` | 0 |
| `filters: "recencyDays < 7"` | 1,615 |
| no filter | 1,948 |

`recencyDays` is a plain counting facet in `attributesForFaceting`, so this is
not the `filterOnly` problem in item 4 — it is that the operator syntax does
not apply to facet filters at all, and the failure is silent.

Both are fixable on our side: align `on_air_products` word-matching with
`prod_catalog`, and have the agent reach for `filters` rather than
`facet_recencyDays` for a numeric comparison.

## 4. `Pricing_ActivePrice` is `filterOnly`, so budgets cannot be enforced

Numeric comparison on a `filterOnly` attribute is rejected with
`invalid_facet_filter`, so the agent cannot write `Pricing_ActivePrice <= 150`.
It falls back to the `priceBand` string facet, and the bands straddle budgets:
for a $150 ask the `$100 - $200` band returned 2 of 12 items over budget while
the reply asserted compliance. 44% of that band is over $150; dropping the band
entirely would hide 2,214 affordable necklaces, so neither branch is correct.

The fix is an `attributesForFaceting` change on `prod_catalog`, which
`app/docs/BASELINE.md` rule 6 forbids us from making. Raised with the index
owners separately.
