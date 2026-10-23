# Spike findings — facet chips, live on the Dev stack

2026-10-23 evening. Plan: SPIKE-PLAN.md. All checks below were run against the
live Dev agent (8129ad66) and the worktree dev stack on port 5295, phone viewport
390×844, headless Playwright.

## Success criteria — scored

| Criterion | Result |
|---|---|
| Chips render from live data, zero hardcoding | PASS — chips render from the streamed `facets` aggregates of the real turn; values verbatim |
| Model emits the pick via one schema field | PASS — `displayFacets` present in the arrange args on the first live turn (`Catalog_WatchStyle`, `Catalog_MovementType`, `Catalog_WatchBandType`) |
| Tap → real products, fast | PASS — 308 ms tap-to-rendered-grid, 8 real products with images |
| Thin-catalog fallback | PARTIAL — the model still picked facets on "mothers ring" (169 hits): spec-sheet attributes ("Material Navigation Color", "Gemstone Creation Classification"). Prompt needs tightening; behavior not broken (preview + products still shown) |
| Row flooding controlled | FIXED DURING SPIKE — "diamond rings" first produced a 30-chip row; client now orders by count and caps at 6 (6/6/4 after fix) |
| Desktop unchanged | PASS — chips display:none ≥768px, workspace column intact |
| Unit suite | 512/512 pass; typecheck + lint clean |

## What was built
- Dev agent: optional `displayFacets` (1–3 attribute names) on the arrange_groups
  input schema + one Do-line in the "Showing products" section (instructions sha
  `c1c9ff84`, 36,347 chars; read-back verified). +418 chars.
- App (flag `jtv-facet-chips`, sessionStorage, default OFF): facet extraction
  from streamed tool parts, `FacetChips` component (label rows, no counts,
  top-4 relevancy preview, single-select tap-refine through the existing
  same-origin search proxy), fallback to inline anchored cards when no pick.
- New/changed files: FacetChips.tsx (new), nativeResults.ts (two extractors),
  ConnectedConcierge.tsx (flag + state + render swap), InlineProductCards.tsx
  (optional headings), connected.css (chip styles). Tests: +8 (512 total).

## Issues found and their fixes/status
1. Flag stored under sessionStorage (safeStorage), not localStorage — test setup
   fixed; app behavior correct.
2. Row labels showed "Catalog_Watch Style" — humanizer now strips the prefix and
   the product-domain word ("Style", "Movement Type", "Band Type").
3. 30-chip flood on deep facets — client-side count-order + cap at 6.
4. OPEN (prompt tightening, next phase): the model picked spec-sheet attributes
   on long-tail queries ("Gemstone Creation Classification"). The prompt line
   needs one more clause ("never pick attributes whose names read like record
   fields"), and the battery should score pick quality across the question pool.
5. OPEN: multi-select chips (parked by decision).

## Latency observation (the transcript's complaint, addressed)
Follow-up browsing no longer costs an agent turn: tap→products measured 308 ms.
Turn 1 still costs the normal agent round trip (unchanged).

## Next-phase decision (Arijit)
1. Tighten the prompt line for pick quality (one clause) — recommended before
   the battery.
2. Run the combined battery (flag on) vs baseline across the 35-question pool.
3. If battery holds: `arrange_groups` removal phase (readers sweep first), then
   production promotion on Arijit's call.
Rollback: app flag off; agent instructions restored to sha `28b97166` (snapshot
saved in this folder).
