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

### The stall does not scale with what the tool is asked to produce

Six turns across three questions, caching off
(`../simplification-2026-10-28/measure-display-stall.mjs`), separating the
stall from the time spent writing the payload:

| Question | groups / items | payload | stall | writing |
|---|---|---|---|---|
| Show me opal jewelry | 3 / 12 | 1157 | 4730ms | 672ms |
| Show me opal jewelry | 3 / 12 | 1154 | 4393ms | 645ms |
| Show me engagement rings | 3 / 12 | 1145 | 4511ms | 524ms |
| Show me engagement rings | 3 / 11 | 1191 | 4061ms | 961ms |
| Compare tanzanite and amethyst | 2 / 10 | 1036 | 4031ms | 582ms |
| Compare tanzanite and amethyst | 2 / 12 | 1188 | 4381ms | 994ms |

Median stall 4,393ms; the whole spread is 4,031–4,730ms. Group count, item
count and payload size all vary across these turns and the stall does not
follow them: the three-group turns average 4,424ms and the two-group turns
4,206ms, a difference well inside the run-to-run noise. The stall also lands
at a median of 124 characters written, which is the end of `intro` every time.

Whatever happens there appears to be fixed-cost and to precede the work of
choosing and arranging results — which is the opposite of what we assumed when
we considered capping group and result counts to shorten it.

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

### Measured 2026-10-29: the cap is only reached after an empty search

Three batches of the same eight questions
(`../simplification-2026-10-28/measure-turn-shape.mjs`):

| Configuration | median total | steps | failures |
|---|---|---|---|
| display tool, caching off | 14,967ms | 3 on 8 of 8 | 0 of 8 |
| display tool, caching on | 15,682ms | 3 on 7 of 8 | 0 of 8 |
| display tool removed, caching off | 18,636ms | 2 to 5 | **2 of 8** |

Two things fall out. Caching is not what makes a turn quick — 15.0s against
15.7s is noise, and both are fresh generations rather than the 0.2 to 0.4s a
replay takes. And with the display tool in place a normal question costs
exactly three steps of the five available: search, display, closing text.

So the cap is not a general condition; it needs something to force extra
steps, and an empty search is what does it. Reproduced directly:

| Question | first search | steps |
|---|---|---|
| "Show me finished jewelry from this week" | `prod_catalog`, `"jewelry"` | 3 |
| "Show me rings necklaces and earrings from this week" | `on_air_products`, `"rings necklaces earrings"` → 0 hits, retried as `"ring necklace pendant"` | **4** |

One step from the cap, on a question a shopper would plausibly ask. Which
means the word-matching settings below are not a tidiness issue — they are
what puts ordinary on-air questions within reach of the ceiling.

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

## 4. The agent can only express equality, which is why budgets leak

This replaces an earlier version of this item, which said enforcing a budget
needed `Pricing_ActivePrice` promoted out of `filterOnly` in
`attributesForFaceting` — a change `app/docs/BASELINE.md` rule 6 forbids.
That was wrong, and the distinction matters because it moves the fix off the
index settings entirely.

`filterOnly` does not block numeric comparison. Against `prod_catalog` today,
with the same search key:

| Form | `necklace` hits |
|---|---|
| no price filter | 19,481 |
| `numericFilters: ["Pricing_ActivePrice<=150"]` | 6,869 |
| `filters: "Pricing_ActivePrice <= 150"` | 6,869 |
| `facetFilters: [["Pricing_ActivePrice:<=150"]]` | **0** |

Only the last form fails, and it fails because `facetFilters` is an equality
match against a literal facet value — `<=150` is read as the name of a value,
which no record carries. The same holds on `on_air_products`, where
`recencyDays` is a plain counting facet: `recencyDays:5` matches 256 records,
`recencyDays:<7` matches none, and `numericFilters: ["recencyDays<7"]` matches
1,615.

This is also how InstantSearch has always done ranges: `connectRange` calls
`addNumericRefinement(attribute, '>=', min)` and `algoliasearch-helper`
translates numeric refinements into `numericFilters`, never into
`facetFilters`. A numeric attribute still belongs in `attributesForFaceting`
so the widget can read the min, max and counts it needs to draw bounds — but
drawing the range and applying it are two different parameters.

So the gap is in what the agent is allowed to express. Its
`algolia_search_index` tool offers `facet_<attribute>` parameters, which land
in `facetFilters`, and the captured stream shows it reaching for
`facet_recencyDays: ["<7"]` because that is the only shape available to it. No
amount of prompting fixes a budget ceiling it has no parameter for.

### Probed 2026-10-29: the model reports it has no such parameter

A Slack thread suggests `numericFilters` was enabled for the search tool. If it
was, it is not reaching this agent's tool schema. Asked plainly for a budget,
the agent reaches for bands and says so in its own `userIntent`:

```
"queries":[{"query":"necklace","facet_Pricing_PriceRange":
  ["Under $25","$25 - $50","$50 - $100","$100 - $200"]}]
"userIntent":"... searching necklace category across price bands that cover
  the ceiling, will filter individual prices after."
```

Returned 12 hits at 28.79, 126, **158.99**, 99.99, 64.99, 137.5, 149.99,
118.08, 124.99, 63.18, 74.99, **155.6** — two over the ceiling, and the
"filter individual prices after" it promises is not something it can do, since
the display tool takes objectIDs only.

Instructed explicitly to use the parameter — *"Use numericFilters, not price
bands"* — it emitted the identical band query and reported why:

```
"userIntent":"... using price-band facets since raw numericFilters isn't
  supported, then will filter exact prices below $150 myself."
```

That is the model reading its own tool schema, which is evidence about the
schema rather than about the server. The two are worth separating:

| Level | Who sets it | Can it express "under $150"? |
|---|---|---|
| Index entry `searchParameters` / `searchControls` | the agent author, fixed | No — a budget is per shopper, a fixed value cannot vary |
| Tool input schema, per query | the model, per turn | Yes — this is the one that is missing |

So even if the Slack thread is accurate at the index-entry level, it does not
reach the problem: a ceiling that changes every turn has to be expressible per
query.

**What we would like to know:** whether a per-query comparison parameter can be
surfaced in the `algolia_search_index` input schema — and if `numericFilters`
is already meant to be there, what makes it absent for this agent (a version
that predates it, an entry that needs re-saving, a per-index gate). Closing
this closes the budget ceiling and the on-air recency filter together, with no
index settings change.
