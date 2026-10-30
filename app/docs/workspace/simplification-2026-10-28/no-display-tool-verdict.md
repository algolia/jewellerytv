# Removing the display tool: measured, and worse

`algolia_grouped_results` was taken off the agent on 2026-10-29 to see whether
the four-second stall inside it was worth paying. It is. Put it back.

## What improved

The stall is gone, because the tool that stalls is gone, and the easy
questions got quicker. "Show me opal jewelry" went from 17.6s to 14.0s.

## What broke

Eight questions, caching off (`measure-turn-shape.mjs`):

| Question | total | steps | searches | unique hits |
|---|---|---|---|---|
| Show me opal jewelry | 13958ms | 3 | 2 | 12 of 24 |
| I need a gift for my mom under $200 | 24033ms | 5 | 5 | **MaxStepsPerCompletionError** |
| What was shown on Jewel School this week? | 7656ms | 2 | 1 | 5 |
| What did Misty feature this week? | 20130ms | 4 | 3 | 16 |
| Show me engagement rings | 18636ms | 5 | 3 | **MaxStepsPerCompletionError** |
| Something bold in sterling silver | 9136ms | 2 | 1 | 12 |
| Compare tanzanite and amethyst rings | 16871ms | 3 | 3 | 22 of 36 |
| Show me clearance | 24147ms | 4 | 3 | 12 of 36 |

Median total 18,636ms, spread 7.6s to 24.1s.

**Two of eight turns now fail outright.** Both are ordinary shopping questions
— a budget gift and engagement rings — not the awkward on-air case that
produced the earlier capture. The step cap has not changed; what changed is
that the agent spends its steps differently.

**Six of eight turns ran more than one search, three of them repeating
themselves** — 24 hits for 12 unique pieces on the opal question, 36 for 12 on
clearance. With no display call to end on, the agent has no action that means
"now show these", so it searches again.

## What the panel looks like

Worse in four ways, all visible in one screenshot of a live turn:

1. **The carousel is back.** Our grid lives in the gate on the grouped tool;
   with that tool gone the search tool draws its own horizontal carousel, which
   is what the grid replaced — at this rail width about two and a half tiles
   are visible and the rest is behind arrows.
2. **Internal reasoning reaches the shopper.** "I have what I need from the
   search above, no need to call it again."
3. **The grouping moved into prose as SKU codes.** "Ethiopian opal in gold over
   silver — WPD623 earring & pendant set, WPD954 pendant, WPD953 ring, WPD952
   ring, WPD917 ring…". The model still wants to group; without a tool to carry
   the grouping it recites part numbers.
4. **The reply repeats itself** — the opening paragraph and the penultimate one
   say the same thing about opal running deep in the catalogue.

The display gate also stops running, so nothing drops an unphotographed piece
or a duplicate.

## Verdict

The four-second stall buys a terminal action, a shelf layout, a curation step
that is currently the only place a budget is enforced, and a gate. Removing it
trades 3.6s on the easy questions for a 25% hard-failure rate on ordinary ones.

The stall stays a platform question (platform questions, item 2).
