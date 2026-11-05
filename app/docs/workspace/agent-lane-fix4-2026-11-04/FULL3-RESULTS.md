# Battery v3 — the restructured prompt (Do/Don't/Why/Examples), 2026-11-05 03:21

Same 14 classes, fourth-set fresh literals, dev agent on c634c885 (compact
base + worked repairs + restored methodology structure, 18,040 bytes).
Verdicts beside v2 (the unstructured merge).

| Class | v2 (merge, unstructured) | v3 (restructured) | Change |
|---|---|---|---|
| C1 broad browse | FAIL bare shelf | **FAIL** — shelf-only again, zero prose | the restructure did not move it |
| C2 style breadth | MIXED | **FAIL** — ONE group of 4 ("Delicate & Romantic"), reply is tiles-only, 47 chars; the multi-type breadth from v1/v2 did not fire | regressed |
| C3 gift + recipient | MIXED | MIXED — person-first opener present, then "Perfect! Here's a collection..." (announcement), em dash | unchanged |
| C4 correction | FAIL | **FAIL** — zero tiles again; the reply narrates the trap ("These results are gold over silver rather than solid silver. The catalog carries mostly...") — better words, still no corrective shelf | not repaired |
| C5 budget | PASS | **MIXED** — "Looking at the results, I have pieces under $250 but also several over that limit." narrates the curation again | regressed |
| C6 thin honesty | PASS | **MIXED** — honest about lab-created, zero tiles (announced pieces, showed none), em dash, closing question present | partial |
| C8 facet trap | PASS | **MIXED** — "Now I can see the results include both solid sterling silver and gold over sterling silver pieces.Perfect!" — the check-narration leak returned | regressed |
| C9 brand | PASS | PASS — retrieval holds | holds |
| C10 education | PASS | PASS (structured, 4 bold labels) — one em dash | holds |
| C11 policy | FAIL on leak | **PASS** — "Our 30-day return policy covers most purchases..." — direct answer first, no retrieval announcement, bold close | repaired |
| C12 on-air | PASS | **MIXED** — zero tiles this run (v1/v2 showed the pieces), prose carries the week's series; 11 bolds | regressed on display |
| C13 trending | PASS | PASS — no claims | holds |
| C14 product by name | PASS | PASS — no SKU, named in words, bold close | holds |

Score: 6 pass / 5 mixed / 3 fail (v2: 8/4/2).
Persistent leaks: em dashes (4 turns), the check-narration class (C4/C8),
count-free but still zero bold closes on all 10 shelf turns.

## What this proves

The restructure (Do/Don't/Why/Examples) did NOT regress the correctness
spine (brand, education, policy, trending, on-air honesty all hold) and it
REPAIRED C11 — the one class whose repair was a pure rule-restatement with
the specimen quoted. But the voice failures (bare shelves, no bold close,
narration leaks) are NOT prompt-structure problems: three prompt
generations, three structures, same model, same failures. The variance
between runs (C2 breadth firing in v1/v2 but not v3; C12 showing tiles in
v1/v2 but not v3; C6 showing tiles in v2 but not v3) points at
model-level inconsistency, not instruction-level gaps.
