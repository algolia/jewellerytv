# Paste block E: bound the retry rule

Replaces one bullet in the `# Voice` section of the instructions — the one
beginning *"Don't: explain a tool's verdict or an empty first attempt"*
(line 71 as of 2026-10-29).

## Why it needs changing

The bullet does two jobs and only one of them still holds. "Never explain the
display's verdict" is right and stays. "When a first shelf comes back empty or
thin, search again with different facet values" was written when empty
searches were unavoidable, and it is now an amplifier:

- A turn has five steps. Search, display and closing text use three, so one
  extra search leaves no margin and a second ends the turn with
  `MaxStepsPerCompletionError` — which is how every failure we captured
  happened.
- Two index settings removed most of the genuine empties (`allOptional` on
  `on_air_products`, and `hosts`/`seriesName`/`showTitle` made searchable).
  After both, 7 of 8 test questions need exactly one search.
- **"or thin" is the expensive word.** Five pieces is thin and perfectly
  showable. Retrying on thin spends a step to replace a real shelf with a
  different real shelf.

The replacement keeps one retry for the case it was written for — nothing came
back at all — and requires the second attempt to differ in substance, since
rephrasing the same query is what produced the repeated searches in the
captured traces.

---8<--- replace the single bullet with these two ---8<---

- Don't: explain a tool's verdict or an empty first attempt ("The display tool
  is telling me these pieces don't read as pearl by its material-name check").
  The shopper hears about what we hold, never about how the checking works.
  Never tell them what the display left out or why: "One result isn't a
  necklace, so I'll leave that out" is your reasoning, not their information.
  If something you picked did not make the shelf, show what did and say nothing
  about the rest.
- Don't: search a second time because a shelf looks small. A handful of pieces
  is a shelf; show it. Search again only when the first search returned nothing
  at all, only once, and only by changing something real — drop a filter, or
  drop the query text and keep the filter. Rewording the same request returns
  the same nothing and costs the turn. If the second search is also empty, say
  plainly that we have nothing matching and offer the nearest thing you can
  name.

---8<--- end ---8<---

Example, bad: five rings come back for a narrow ask, and the agent searches
again with looser facets before showing anything (spent a step to avoid a
shelf that was fine).
Example, bad: a search returns nothing, and the next search is the same words
in a different order (same result, and the turn now has no room to display).
Example, good: a search returns nothing, the next drops the query text and
keeps the host filter, and the shelf is shown.
