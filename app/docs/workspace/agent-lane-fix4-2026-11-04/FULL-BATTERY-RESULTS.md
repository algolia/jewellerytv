# Class-coverage battery — the compact prompt on the dev agent, 2026-11-04 23:19

14 journeys, one per rule-class the prompt carries. Graded on the rendered
screen with class-specific checks. This is the certification surface the
six-journey smoke could not cover.

| Class | Result | Measured evidence |
|---|---|---|
| C1 broad browse | MIXED | 8 tiles, 2 groups, 9 chips — but zero prose: the reply is shelf-only, no opening line, no close |
| C2 style breadth | **PASS (structure)** | "delicate and romantic for an anniversary dinner" → 3 groups across pendants/earrings/bracelets — the multi-type rule works through multi-search; but zero prose and zero chips (multi-scope suppression) |
| C3 gift + recipient | PASS | "something special for your niece" opens with the person; no invented details |
| C4 mid-course correction | **FAIL** | "silver hoops instead" → zero tiles, reply is the fragment "These are gold-over-silver pieces." — no corrective shelf, no voice |
| C5 budget | MIXED | Under-$250 applied, but leaks process talk: "I found some great options, but I need to filter these to stay under $250." |
| C6 thin honesty | **FAIL** | alexandrite ask → 12 tiles in generic groups ("Drop & Dangle", "Stud & Halo"), zero mentions of alexandrite — silent widening, the exact class the honesty rule bans |
| C7 two meanings | MIXED | cluster rings → two gemstone readings shown; the setting reading may be missing (both groups gemstone-flavored) |
| C8 facet trap | MIXED | sterling ask: shelf survived with no gold-titled pieces (trap mostly held), but the reply narrates the requirement check TWICE: "The results include gold-plated pieces that don't match your sterling silver requirement.These still include gold-plated pieces.Perfect!" |
| C9 brand facet | **UNVERIFIED/FAIL** | "Gems en Vogue rings" → generic groups, zero brand mentions in reply, no brand group — filter application not in evidence |
| C10 education | PASS | direct care answer, correct shape |
| C11 policy | MIXED | full structured answer with bold labels (the only bolds in the run) — but opens with a narration leak: "I'll retrieve our return policy for you." |
| C12 on-air | PASS | shows the pieces, no live-claim phrases detected, chips correctly absent |
| C13 trending trap | PASS | "best selling" ask → no best-selling/trending claims in the reply |
| C14 product by name | MIXED | answered from the named record — but leaked the SKU: "WPG153 features a 1.82-carat Ethiopian opal…" |

## The pattern, measured

- **Voice is the failure everywhere**: no bold close on any shopping turn (the only bolds are policy labels), bare shelves on C1/C2, narration leaks on C5/C8/C11, a fragment on C4. The compact prompt's silence rule makes the model silent at the wrong moments too.
- **Correctness spine mostly holds**: budget, facet trap (shelf-side), on-air honesty, trending honesty, education, policy structure, gift warmth.
- **Two real retrieval failures**: C4 (correction produced nothing) and C6 (silent widening off a rare stone). C9's brand filter needs the conversation receipt to judge.
- **The SKU leak reproduces** (C14) — second measured instance.

Note: tile `h3` titles came back empty on several shelves (selector/shape
change in this build), so C6's widening is evidenced by group titles and the
zero alexandrite mentions, not per-tile names; C8's shelf-side trap check is
group-title-level.
