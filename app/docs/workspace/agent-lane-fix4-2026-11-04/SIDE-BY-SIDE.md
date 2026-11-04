# Side-by-side: fix-4 prompt vs the new compact prompt (dev agent)

Measured on the same branch build, same six intents, fresh literals per leg
(the completion cache is keyed by literal, so reusing phrases would fake the
comparison). Fix-4 leg: battery-2026-11-04T19-26-53. New-prompt leg: runs
2026-11-04 ~21:4xZ (battery-promptB-*).

Graded on the rendered screen. Caveat on the chip columns: the app-side chip
fixes (audience/hardware axes excluded, 3-value floor, band ordering) landed
between the two legs, so chip differences are app + prompt together; the
reply columns are prompt-driven.

(to be filled when leg B completes)
## Results (22 say-turns per leg, graded on the rendered screen)

| Metric | A: fix-4 (19:26 run) | B: new compact prompt (22:32 run) |
|---|---|---|
| Turns with tiles | 8 | 8 |
| Tiles total | 39 | 35 |
| Bold closing CTA | 2 | 2 |
| Narration leaks | 0 | 1 (J1 t1: "I'll focus on mounted pieces…" — a planning sentence the stricter-sounding ban did not hold) |
| Count/SKU leaks | 0 | 1 flagged, and on inspection it is a false positive: my leak regex caught the comma in a price ("$5,939.09"); J6 t1 has no prose at all |
| Empty turns (no text, no tiles) | 6 | 4 |
| Announced-but-empty shelves | 0 caught | 1 (J2 t2/t3: "Perfect—I found beautiful white gold sapphire pieces." with zero tiles, repeated twice) |

## Read

- **Bigger than the prompt difference: both legs fail the same spine.** Bold CTA 2/22 on both. Text-less and empty turns dominate both legs (6 vs 4 of 22). The reply-shape problem is not a fix-4 regression or a new-prompt regression — neither prompt makes this model write a human close on a shopping turn.
- **The new prompt's stricter silence rule did not hold better:** leg B produced the first planning-sentence leak ("I'll focus on mounted pieces…") — prose bans without worked examples keep failing, on both texts.
- **Phantom shelf caught on B:** "Perfect—I found beautiful white gold sapphire pieces." rendered twice with zero tiles — the announced-but-absent class, plus an em dash in shopper text.
- **Reply metrics are near-identical because the model (not the prompt text) is the bottleneck.** Swapping 39KB for 15KB moved nothing material on the graded columns.
- Caveats: chip columns are app+prompt combined (app chip fixes landed between legs); leg B's "count" leak is a grader false positive (comma-grouped price), noted rather than hidden.

## The decision this table forces

Two whole-prompt rewrites (39KB fix-4, 15KB compact) produce the same measured shopper experience. The remaining defects (no bold close, bare shelves, phantom announcements, planning-sentence leaks) need **worked repairs with the model's own measured sentences** — the instruction method that has held everywhere else — not another rule restatement. That is prompt iteration 3, applied to whichever base text you anoint: the compact one or fix-4. Your call on the base; the repairs are written from the measured specimens either way.
