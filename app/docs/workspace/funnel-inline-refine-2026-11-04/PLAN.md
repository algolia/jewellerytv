# Funnel inline refine, index-derived chips, deterministic rows

Branch: `funnel/inline-refine-index-chips` (base a714de6, includes the 8 local display commits per Arijit's order 2026-11-04).
Run folder: this file + `state.json`. Path: light (no schema/dependency/new external surface; reuses the browser's read-only search client).

## Progress

- [x] Verified live prod defects (chips-as-questions, whitelist facets, inconsistent rows) — receipts in `.playwright-mcp/`, analysis in session
- [x] Port source located: `buildFacetRefineParams` + turn-constraint reading from 5948289 (deployed funnel, 2026-10-26)
- [x] Current seams read: gatedGroupedResults (gate + NarrowChips), narrowChips (whitelist to delete), shared/client (searchClient with analytics off by policy), ProductCard JtvHit
- [x] Scenario list enumerated (below)
- [ ] RED: failing tests
- [ ] GREEN: implement
- [ ] Local gate: typecheck + lint + vitest
- [ ] Fixture e2e: chip tap refines in place, no new agent message, Back restores
- [ ] Preview push + Arijit review gate

## Scenario list (TDD step 1)

refine.ts (turn extraction + params, pure):
1. Generic tool shape (`{index, query, facet_filters:[["A:V"]]}`) → queryText + OR-groups
2. Per-index shape (`{queries:[{query, facet_A:["V"]}]}`) → queryText + one OR-group per attribute
3. Neither shape → query only, no filters
4. Multi-query input → `multiScope: true` (chips suppressed, accepted 2026-10-23 single-scope rule)
5. `buildRefineParams(pick, selections)` → turn filters first, selections ANDed on top; pure and stable

narrowChips.ts (index-derived, whitelist deleted):
6. Attributes come from the search's own facet counts — an attribute absent from the old whitelist (gemstone, purity) now offers chips
7. Attribute with a single value → skipped
8. Attribute with >24 values → skipped (spec-sheet guard, accepted derive rule)
9. Most-discriminative axis first (fewest values), name tiebreak, cap 3 axes
10. One row per axis (existing behavior kept)
11. Price bands in price order (band ordering, not the price attribute in any offer list)
12. Catalogue index only; on-air → []
13. No facets → []
14. Already-applied values never re-offered (both tool shapes; existing tests kept)
15. Chips carry {attribute, value, label} — no `ask` sentence (they are no longer questions)

gateGroups (complete rows of four):
16. Group of 5 → 4, drop logged as orphan
17. Group of 7 → 4
18. Groups [3,4] → leading small group folds forward → one full row of 4
19. Groups [4,4,4] untouched
20. Groups [6,4] → [4,4]
21. Total under 4 pieces → rendered as-is (thin shelf, no trim to zero)
22. Empty/duplicate handling unchanged (existing tests kept)

Component wiring (e2e, fixture stream + routed search):
23. Chip tap adds NO shopper message and fires NO agent completion; one client search fires with turn constraints + selection
24. Refined shelf replaces the grouped shelf; Back restores it
25. Refine failure → previous shelf stays, error logged, no dead panel

## Decisions (decision, rationale, date)

- Refine carries `filters: 'Inventory_InStock:true'` like the deployed funnel — the accepted 2026-10-22 in-stock design. VERIFY at preview: the 2026-11-03 tool-config snapshot shows no `filters` key, so parity with the live agent's own search must be confirmed against real turns before merge. 2026-11-04.
- Chips derive attributes index-side with the accepted derive rule (fewest-values first, ≤24 values, cap 3×3); no offer-list hardcoded. `Pricing_PriceRange` keeps a price-order sort — an ordering rule for numeric bands, not an attribute list. 2026-11-04.
- Refined shelf renders as one flat grid (up to 8) with the Back control; themed groupings describe the unrefined shelf and the refine says so. Matches the deployed funnel's behavior. 2026-11-04.
- Prose above the shelf is not rewritten on refine — the agent's words stand, the tiles filter. The 2026-11-02 "chips ask the agent" decision existed to avoid this; Arijit has explicitly chosen the funnel behavior instead. Flagged for his eyes in the preview. 2026-11-04.
- Suggestion chips under the message (chatActions) keep their text behavior — they are follow-up questions, not facet filters. Only the facet narrowing chips change. 2026-11-04.

## Outcome

(pending)
