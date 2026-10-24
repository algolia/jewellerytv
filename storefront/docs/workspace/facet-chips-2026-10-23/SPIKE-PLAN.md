# Spike plan — facet chips two-step concierge

Date: 2026-10-23. Approved by Arijit ("go for it") after the grill brief.
Parent documents: GRILL-BRIEF.md (decisions, surviving objections),
facet-chips-validation.md (35-question validation), facet-chips-mockup.html
(approved UX).

## What the spike proves, and what it deliberately does not do

Proves: chips render from live index facets in the real conversation flow; the
model can pick display facets via one schema field; tap-refines to real products
fast; the thin-catalog fallback fires. Measured against the existing behavior.

Does NOT do: no `arrange_groups` removal, no production agent change, no
tool-sheet deletion. All removal decisions come after this spike's evidence.

## Locked decisions (from the grill, [firm])
- Model picks 1–3 display facet attributes; values/counts always from the index.
- No counts on chips. Single-select for the spike (multi-select parked).
- Preview grid = top 3–4 hits by native Algolia relevancy from the SAME response.
- In-stock filter dropped from concern; PDP owns stock truth. (Default: do not
  add stock filtering to tap searches; revisit only if battery shows dead tiles.)
- Tiles without visible titles in the chips flow (image + price; a11y keeps title).
- Voice rule: prose carries breadth beyond chips, never repeats a chip value.
- Chips flow REPLACES inline anchored cards for that turn when the model emits a
  facet pick; fallback to current inline cards when it does not.
- All agent edits: Dev agent only, live-hash coordination first, whole-prompt
  read (done earlier this session), no new prompt sections (edit owner section).

## Architecture (spike shape)

```
agent turn (Dev agent 8129ad66)
  1. search tool call      → streamed output: {hits, nbHits, facets}   [T1 verified]
  2. arrange_groups call   → input gains optional displayFacets: string[1..3]
  3. reply text            → opener + breadth line (voice rules unchanged)
app (flag jtv-facet-chips, default OFF)
  - read facets + displayFacets from the streamed parts (nativeResults.ts)
  - when pick present: chips rows (label = facet values verbatim) + preview grid
    (top 4 hits already streamed) instead of inline cards for that message
  - tap chip → client search: same query text + shopper-chosen facet filter,
    via the public search client the site already uses → real results inline
  - when pick absent: current inline-cards behavior unchanged
desktop: unchanged entirely (flag scope = mobile conversation)
```

Key T1 facts this rests on (verified today):
- Streamed search output carries full per-attribute facet counts.
- Search tool-call args carry `queries` (text + facet filters) — tap-refine
  reuses the query text from the first query.
- `Catalog_ProductType` and `Pricing_PriceRange` facets exist with counts.

## Steps

### Phase A — agent side (Dev only)
- [ ] A1. Coordination preflight: live GET of agent 8129ad66 (sha, updatedAt),
      mtime scan of lane docs; confirm no parallel writer.
- [ ] A2. Tool schema: add optional `displayFacets` (array of strings, max 3) to
      arrange_groups input schema in the Dev agent's tool config.
- [ ] A3. Instructions edit (owner section "Showing products", house format, no
      new section): one Do-line — after the discovery search, include
      displayFacets naming 1–3 attribute names from the facet counts that best
      help this shopper narrow; skip single-value, hardware and spec-sheet
      attributes; omit entirely when nothing meaningfully splits the catalog.
      Whole-file diff review before PATCH (consolidation law).
- [ ] A4. Hash-verified PATCH + read-back (byte compare).

### Phase B — app side (worktree Prompter, flag default OFF)
- [ ] B1. `nativeResults.ts`: extract `facets` from search tool results and
      `displayFacets` from arrange input; typed + unit tests (TDD).
- [ ] B2. Chip data builder (pure): facet attribute + values → chip rows; label
      cleanup NONE (values verbatim); suppression: single-value attributes
      dropped client-side (the model may still err; belt and braces).
- [ ] B3. `FacetChips` component: rows + preview grid + selected state; renders
      inside the anchored-cards slot of a message when flag on + pick present.
- [ ] B4. Tap-refine: client search using the public search client (same as
      site), query text from the turn's search args, facet filter from the
      tapped chip, hitsPerPage 8; render results grid in the slot; loading state.
- [ ] B5. Flag wiring: `jtv-facet-chips` (localStorage/dev flag), default OFF;
      fallback path = current inline cards.
- [ ] B6. Component test: chips render, tap calls search, fallback path intact.

### Phase C — live verification (headless Playwright, 390×844, dev stack 5295)
- [ ] C1. "watch for dad" → chips from live facets, preview grid, tap
      Chronograph → real products <1s, screenshots.
- [ ] C2. "a mothers ring for my mom" → no chips, current behavior.
- [ ] C3. "Show me diamond rings" → cut/metal/budget rows, clean picks.
- [ ] C4. Desktop 1280px → unchanged.
- [ ] C5. Full unit suite + typecheck + lint green.

### Phase D — evidence + decision
- [ ] D1. Screenshots + timings into this folder; SPIKE-FINDINGS.md with the
      success criteria scored.
- [ ] D2. Report to Arijit with go/no-go on: tool removal + battery (next phase).

## Risks / tripwires (stop conditions)
- Schema PATCH rejected or guardrail trips on the new field → stop, report.
- Model emits hardware/spec-sheet attributes repeatedly across test questions →
  tighten prompt line or stop.
- Tap search returns dead/mismatched results vs chip label → stop, report.
- Any concurrent writer on the Dev agent → stop, re-coordinate.

## Files expected to change
- Dev agent config (instructions + arrange_groups schema) — via PATCH, hashed.
- `storefront/src/concierge/nativeResults.ts` (+tests)
- `storefront/src/concierge/FacetChips.tsx` (new, +test)
- `storefront/src/concierge/ConnectedConcierge.tsx` (flag wiring, slot swap)
- No CSS-framework or dependency changes; styles extend connected.css.

## Rollback
App: turn flag off (no code revert needed). Agent: restore instructions sha
captured at A1 via the standard rollback chain. No data migrations.
