# Connected battery — funnel inline refine, 2026-11-04

Connected run against the dev agent (8129ad66) from the branch dev server, real
browser (Playwright MCP, headless), fresh literals, real search + real refine
queries. Screenshots in `battery/`. Run in two passes: pass 1 found two
defects, fixed in 997da03's predecessor and verified by pass 2.

## Pass 1 (found 2 defects)

| Step | Expected | Observed | Verdict |
|---|---|---|---|
| Entry: "Show me two-tone rings" | voice + shelf, complete rows | "Now I'll display the selection of two-tone rings." leaked above the shelf; 2 groups × 4 | DEFECT 2 (narration) |
| Click "White" | refined shelf in place, no new message, no agent call | 8 real pieces in <2s, transcript unchanged, `Back to all` present | PASS |
| After refine | next-level chips from the refine's own counts | NO next-level chips — the refine requested no facets | DEFECT 1 (deepen) |

Fixes: refine requests `facets: ['*']` (maxValuesPerFacet 100, mirroring the
storefront's own client query); display filter gained `now i'll` / `now i will`.

## Pass 2 (all pass)

| Step | Expected | Observed | Verdict |
|---|---|---|---|
| Entry: "Show me gold earrings" | voice + complete rows + index-derived axes | warm line, 3 groups × 4 (12 tiles), 3 axes: audience, price bands, discount bands (never offered by the old whitelist) | PASS |
| Narration check | no process-talk above the shelf | the earlier "Now I'll display…" line is filtered; the voice line renders | PASS |
| Click "Women" | instant refine, no shopper message, no agent turn | 8 tiles, transcript message count unchanged (2), Back present | PASS |
| Deepen | next-level chips from refine counts | First Quality/Pre-Owned, Female/Unisex, Gem/No-Gem — three axes from the refine's own counts | PASS |
| Back | grouped shelf + original chips return | "Small Gold Studs / Medium and Larger Studs / Gold Hoops", 12 tiles, 3 axes | PASS |

Screenshots: `01-initial-shelf.png` (pass 1 entry), `02-refined-shelf.png`
(pass 1 refine), `03-refined-deepened.png` (pass 2 refine + deepen chips).

## Observations for Arijit's review (not defects, judgment calls)

- The derived axes rank most-discriminative first, so "Women / Men" led the
  two-tone shelf and discount bands appeared on the earrings shelf — both
  correct per the index-derived law, both worth your eye in the preview.
- "$1000 and above" still offered on shelves priced under $200: the chip pick
  takes the highest-count values of the price axis from the search counts, and
  a thin high band still carries a count. A follow-up if you want a floor on
  it.
- The dev agent's reply voice was healthy on both pass-2 turns; the agent-lane
  prompt rewrite (fix 4) is still pending your draft review.

## Fixture e2e (hermetic, in CI)

`tests/e2e/concierge-funnel.spec.ts` — refine-in-place with exact wire params,
Back restore, failed-refine leaves the shelf standing. Unit: 149/149.
