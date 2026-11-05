# Merge-state battery v2 — compact base + worked repairs, 2026-11-05 00:0x

Same 14 classes, third-set fresh literals, dev agent running the merged
prompt (f8643969, 17,348 bytes). Verdicts beside the v1 run (23:19).

| Class | v1 (compact) | v2 (merged) | Change |
|---|---|---|---|
| C1 broad browse | FAIL (bare shelf, no prose) | **FAIL** — still shelf-only, zero prose | not repaired |
| C2 style breadth | PASS structure / bare shelf | MIXED — multi-type groups again, still no prose | unchanged |
| C3 gift + recipient | PASS | MIXED — tiles but the reply is shelf-only (no person-first line this time) | regressed |
| C4 correction | FAIL (zero tiles + fragment) | **FAIL** — reply: "I need to search for solid sterling silver hoops, not gold over silver." — narrating a search it then did not show; zero tiles again | not repaired |
| C5 budget | MIXED (narration leak) | **PASS** — "I found several tennis bracelets within your budget." clean, budget group shown | repaired |
| C6 thin honesty | FAIL (silent widening) | **PASS** — "These are beautiful lab-created alexandrite pieces" — names the substitution honestly, alexandrite mentioned | repaired |
| C8 facet trap | MIXED (narrated the check twice) | **PASS** — "I found some beautiful sterling silver pendants for you." clean, no requirement-check narration | repaired |
| C9 brand | PASS (corrected) | PASS — 4 tiles, retrieval holding | holds |
| C10 education | PASS | PASS (structured care list, 4 bold labels) | holds |
| C11 policy | MIXED (narration leak) | **FAIL on leak** — "I'll look up our returns policy for you." opens the reply; structure and bold labels fine | not repaired |
| C12 on-air | PASS | PASS (12 tiles, 3 groups) | holds |
| C13 trending | PASS | PASS — no best-seller claims | holds |
| C14 product by name | MIXED (SKU leak) | **PASS** — no SKU (named in words: "The Ethiopian Opal Rhodium Over 14k White Gold Pendant"), and a bold closing question | repaired |

Score: 8 pass / 4 mixed / 2 fail (v1: 6 pass / 4 mixed / 4 fail).
Leaks: the C5 and C8 narration leaks and the C14 SKU leak are GONE.
Still failing: the voice duties on browse turns (C1/C2/C3 no prose, no bold
close), the correction turn (C4 — narrates a search, shows nothing), and
one stubborn opener leak (C11).
