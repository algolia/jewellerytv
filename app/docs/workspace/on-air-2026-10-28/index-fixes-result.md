# Two index settings, measured before and after

Same eight questions, caching off, display tool present throughout
(`../simplification-2026-10-28/measure-turn-shape.mjs`). Totals are noisy
run to run; step count, search count and failures are the signal.

| Configuration | median total | >1 search | failures |
|---|---|---|---|
| Before either change | 14,967ms | 1 of 8 | 0 of 8 |
| `removeWordsIfNoResults: allOptional` | 15,710ms | 2 of 8 | **1 of 8** |
| … plus `hosts`/`seriesName`/`showTitle` searchable | **14,920ms** | 1 of 8 | **0 of 8** |

Seven of eight turns now run in exactly three steps with one search — search,
display, closing text — against a cap of five. The remaining turn, "Compare
tanzanite and amethyst rings", takes four steps and two searches, which is
what a comparison across two gemstones should cost.

`allOptional` alone looked like a regression, and in the step counts it was:
it fixed the multi-word empties but left the host query returning nothing, and
"What did Misty feature this week?" failed at five steps. The two settings
needed each other.

## The on-air answers also got better, not just faster

| Question | before | after |
|---|---|---|
| What was shown on Jewel School this week? | 5 hits, 11,447ms | **12 hits**, 12,958ms |
| What did Misty feature this week? | 7 hits, 10,302ms | **12 hits**, 12,881ms |
| | 5 steps / 3 searches at worst | 3 steps / 1 search |

The host and series questions were previously answered from whatever survived
a query that fought its own filter. They now return a full shelf on the first
search.

## What is left

The four-second stall inside the display tool is untouched by any of this; it
is fixed-cost and server-side (platform questions, item 2). A normal turn is
now roughly: 3 to 4s to first hits, ~4.4s of stall, then the shelves.

Two prompt items remain worth doing, neither urgent now that nothing fails:

- `instructions.md` line 71 still says to search again when a first shelf comes
  back empty or thin. Written when empties were unavoidable; each one now costs
  two of five steps.
- The `showId` fan-out seen in the pre-fix Misty trace — looking shows up and
  then searching their ids — is what the one-search rewrite was meant to stop.
  It did not appear in this run, so it may have been a symptom of the empty
  first search rather than a rule that needs restating.
