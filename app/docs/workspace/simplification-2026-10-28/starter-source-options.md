# Where the starter prompts should come from

## What exists today, checked rather than assumed

**Agent Studio's suggestions are post-turn and contextual.** After "Show me
opal jewelry" it emits:

```
"Show me opal rings", "What are opal jewelry prices?", "How to care for opal jewelry?"
```

They already render in the panel, under each reply. They are generated *from
the turn that just happened*, so they cannot fill the empty state — before the
first message there is no turn to generate from.

**There is no suggestions index.** Probed `agent_suggestions`, `suggestions`,
`jtv_suggestions`, `prod_catalog_suggestions`, `starter_suggestions` and
`query_suggestions` — all 404.

**But an automated, self-refreshing, demand-grounded source does exist.**
`prod_catalog_query_suggestions`: 14,330 entries built by Algolia's Query
Suggestions from real search analytics, each with a popularity score and an
exact hit count.

```
moissanite (7,204)   moissanite ring   gems en vogue   prazana
strontium titanate   bracelet          judith ripka
```

Zero maintenance by construction — it rebuilds from analytics, so it cannot
go out of date.

## The catch

They are *queries*, not openers. "moissanite", "bracelet", "judith ripka" as
chips read like a search box, which is the thing the panel exists not to be.
And the metadata that might drive phrasing is not there: the `prod_catalog`
block on each suggestion carries `exact_nb_hits` but its facet maps are empty,
so there is nothing to tell "moissanite" (a stone) from "judith ripka" (a
brand) and phrase them differently.

Ordering is also by popularity alone, which gives a set of near-duplicates —
"moissanite", "moissanite ring", "moissanite fire" are the top three. The
variety rule in `selectStarterSet` exists precisely because a set must not
read as one sentence with the nouns swapped, and no automated source knows
that.

## The maintenance worry is smaller than it feels

Of 31 curated labels, **two** are time-bound:

- "Show me Christmas gift ideas" — seasonal
- "What was on Jewel School this week?" — the one already flagged in
  `starterQuestions.ts` as the only label without demand evidence

The other 29 are category and service themes — opal, returns, ring stacks,
birthstones. Those do not expire.

And the part that genuinely perishes, what is on air, **is already
automated**: two chips are derived from `on_air_shows` facet counts, so they
name a series or a host only when the index says it aired. They cannot go
stale by construction.

## Recommendation

A hybrid, but rebalanced rather than replaced.

1. **Delete the two time-bound labels now.** That is the real staleness, and
   it is five minutes of work.
2. **Keep the evergreen curated set as the fallback.** An index query can fail
   or return nothing, and the panel must never open blank — the current code
   already resolves to the curated set on any failure.
3. **Add query suggestions as a source** if more automation is wanted, behind
   a phrasing template ("Show me {query}") and filtered to multi-word
   suggestions, which read less like keywords.
4. **Keep the variety rule whatever the source.** It is the only thing
   stopping a set of three moissanite chips.
5. **Keep the live on-air chips.** They are the automation the worry is about,
   and they already work.

## The argument that actually favours automation

Not staleness — **deployability**. Thirty-one labels in the repository are
thirty-one things JTV inherits and has to own. A source they already operate
is one less artefact in the handover. That is a better reason than staleness,
and it is worth weighing on its own.

If Agent Studio does ship a suggestions index, swapping the source is a
one-function change provided the shape stays as it is: `readStarterSignals`
is already an async function returning labels, with the curated pool behind
it.
