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

## 2. `max_iterations: 10` behaves as 3

`config.max_iterations` is set to 10 on the dev agent. Turns still fail with
`MaxStepsPerCompletionError` after three steps. We worked around it in the
prompt (ban second searches and retries), which is the wrong layer for it.

## 3. `Pricing_ActivePrice` is `filterOnly`, so budgets cannot be enforced

Numeric comparison on a `filterOnly` attribute is rejected with
`invalid_facet_filter`, so the agent cannot write `Pricing_ActivePrice <= 150`.
It falls back to the `priceBand` string facet, and the bands straddle budgets:
for a $150 ask the `$100 - $200` band returned 2 of 12 items over budget while
the reply asserted compliance. 44% of that band is over $150; dropping the band
entirely would hide 2,214 affordable necklaces, so neither branch is correct.

The fix is an `attributesForFaceting` change on `prod_catalog`, which
`app/docs/BASELINE.md` rule 6 forbids us from making. Raised with the index
owners separately.
