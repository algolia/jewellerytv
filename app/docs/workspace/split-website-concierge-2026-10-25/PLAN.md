# Plan: split website UI from Concierge inside src/

**Date:** 2026-10-25 · **Author:** Claude session (code lane) · **Ordered by:** Arijit
**Status:** Ready for the mobile agent to execute. Do not start without the coordination gate (Phase 0).
**Parent queue:** item 9 in the fix-queue sequence; runs AFTER the structural requirement fix and its battery, BEFORE the god-file split if possible (the split touches the same files, so do not run them concurrently in different lanes).

---

## Objective

Arijit: "one storefront directory holds two different things — the website UI and the Concierge chat. Split them so we know what goes where, and clean the residue in the website files while we are in there."

Target structure inside the existing deploy folder:

```
storefront/src/
  website/          ← the jtv.com mirror surface (pages, shell, routing, styles)
  concierge/        ← the chat system (already exists; unchanged location)
  shared/           ← code both surfaces consume (catalog layer, telemetry, product canvas)
  embed/            ← unchanged
  main.tsx          ← unchanged entry
```

## The one structural decision (made, with reasoning)

**The split happens inside `src/`. The deploy folder is NOT renamed in this plan.**

- One Vite app, one build, one Vercel deployment, one package.json — that does not change. `website/` and `concierge/` become sibling directories under `src/`, which delivers exactly what Arijit asked for: "both are very separate, and we know what goes where."
- Renaming the deploy folder itself (`storefront/` → something else) or splitting into two top-level directories is a DIFFERENT change with deployment-config consequences (Vercel root directory, CI working-directory, clean-archive recipe, 10+ doc references). It is queued separately and must not ride along here.
- Rationale: pure `git mv` + import-path updates is fully covered by the test suite and zero-risk to deployment; folder rename or two-app split is churn during a delicate migration.

## File boundary (verified against import graph 2026-10-25)

### Move to `src/website/` — imported ONLY by website code
- `src/App.tsx`, `src/main.tsx` (entry stays at src root per Vite config — verify; if Vite demands it stay, leave it and note why), `src/shell/` (Shell.tsx, index.tsx)
- `src/ProductPage.tsx`, `src/ProductCard.tsx`, `src/Filters.tsx`, `src/SearchRouting.tsx`
- `src/routing.ts` (imported 4× by website, 1× by concierge — see shared note below; if the concierge import survives the residue audit, move to shared)
- `src/context.ts`, `src/resultContext.ts`, `src/styles.css`, `src/integration.css`
- `src/DevInspector.tsx` — imported only by App.tsx; **audit during Phase 3**: if dev-only, gate it behind `import.meta.env.DEV` or delete if truly unused in prod builds.

### Move to `src/shared/` — imported by BOTH surfaces (verified import counts)
- `src/catalog/` (adapter, categories, facets, fixtures.json, index) — whole directory moves as-is
- `src/telemetry.ts` (2 concierge + 1 website importers)
- `src/client.ts` (website + embed + concierge importers — the InstantSearch client)
- `src/ProductWorkspace.tsx` + `src/product-workspace.css` (the product canvas renders on the /search page AND inside the concierge panel)
- `src/ShoppingWorkspace.tsx` (correction from the review pass, 2026-10-25: `ConnectedConcierge.tsx:22` imports it and renders it at line 1389 — it is the product column inside the concierge panel as well as the /search page)
- `src/shopping-workspace.css` (second review correction, verified: imported by both `ShoppingWorkspace.tsx:2` and `ConciergeWorkspaceLayout.tsx:6` — moves alongside the component)
- `src/workspaceResults.ts` (3 concierge importers; verify no website importer before moving — if concierge-only, it goes under concierge instead)
- `shared/moneyBounds.ts`, `shared/shopping.ts`, `shared/brief*` (see Phase 4 — brief schema collapse is a separate queued task; do NOT collapse here, only move if its location changes)

### Stays at `src/concierge/` — unchanged
All 24 `src/concierge/` files + `src/concierge-window-controls.css` + `src/concierge-workspace.css` (move these two CSS files INTO concierge/ — they are concierge-only at the src root today).

### `src/embed/` — unchanged

## Execution phases

### Phase 0 — coordination gate (blocking)
1. `git fetch origin && git status` — must be clean; local main == origin/main.
2. Live-check the other lanes: no uncommitted concierge edits anywhere (`.lanes/`, worktrees, open PRs touching `src/concierge/` or `App.tsx`). If any exist, STOP and report — moving files under an active editor lane creates unresolvable diffs.
3. Record the base commit in the run notes.

### Phase 1 — pure moves, zero content changes (one commit)
1. Create `src/website/` and `src/shared/`.
2. `git mv` the Phase-1 file lists above. NO content edits, NO import rewrites yet.
3. Rewrite import paths mechanically (search-and-replace per moved file; `../catalog/` → `../shared/catalog/` etc.).
4. Update: `tsconfig` include/paths if any, Vite config aliases if any, `vitest` config include globs, CI `verify.yml` (no change expected — it points at the deploy folder, which is unchanged).
5. GATE: `npx tsc --noEmit` clean → `npm test` all green → `npm run build` clean → Playwright: homepage renders at localhost:5173 with zero broken assets, concierge panel opens, one search turn renders tiles.
6. Commit: `refactor: split src into website/ concierge/ shared/ (pure moves)`.

### Phase 2 — residue audit in website/ (second commit)
For every file now under `website/` and every src-root leftover:
1. Grep importers; list files with zero importers → candidates.
2. Candidates judged in the open: if a candidate is a route target, a Vite entry, or referenced by `public/docs/`, KEEP and note why. Otherwise delete.
3. Known audit targets from the 2026-10-25 inventory (verify, do not assume): `DevInspector.tsx` (dev-only?), `catalog/fixtures.json` (test-only? if so move under `tests/fixtures/`), dead exports in `facets.ts` (547 lines — list unused exports, propose deletion in a THIRD pass, do not delete in the move commit).
4. CSS residue: selectors in styles.css/integration.css with no class match in any tsx → list, delete only the provably dead ones.
5. GATE: same as Phase 1 gate. Commit: `refactor: website residue cleanup after split`.

### Phase 3 — documentation and memory propagation (blocking, same commit as Phase 1 where possible)
The split changes where files live. Every stored pointer must flip in the same change, or future agents will look in old locations, find nothing, and create duplicates. Sweep and update, in this order:

1. **Code-adjacent docs (same commit as the moves):**
   - `storefront/README.md` (module map section) and root `README.md`
   - `storefront/docs/BASELINE.md`, `storefront/docs/deployment.md`, `storefront/docs/PLAN-3.1-STATUS.md` — any `src/<file>` path references
   - Root `CLAUDE.md` "Current runtime" file-map row (local-only file, still binding)
   - Root `docs/HANDOFF.md` file map (local-only)
2. **Method:** after the moves, run a repo-wide grep for each moved basename and for `storefront/src/` references; update every hit that is a *pointer* (docs, configs). Hits that are historical narrative (old workspace notes describing the past) are labeled historical, not rewritten.
3. **Agent memory (Claude memory dir):** update/add one memory note stating the split LANDED (with the commit hash) and the new layout, and correct any memory file that names an old src path. Until this phase runs, memory must say "planned, not executed" — agents must not look for `src/website/` before it exists.
4. **Vault:** append the split to the Obsidian project wiki log (`Projects/jewellerytv/wiki/log.md`) and update the wiki index if it maps the source tree.
5. **Work state:** close the queued split item with the landing commit hash.
6. `SESSION.md`: add a dated entry describing the new layout and pointing at `SPLIT-REPORT.md`.

### Phase 4 — report + handoff
Write `SPLIT-REPORT.md` next to this plan: moved-file list, deleted-file list with reasons, gate outputs (test counts, build time), the reference-sweep hit list (what was updated), anything left intentionally with reasons.

### Phase 5 — release to production (Arijit authorized 2026-10-25: "GitHub has to be pushed and deployed to Vercel")
1. GitHub check-in per the github-checkin discipline: scoped housekeeping, README/architecture reconciliation (update the README module map for the new layout), summarize the changes, then push to origin/main. (Arijit authorized the push explicitly.)
2. Vercel configuration check: the deploy folder stays `storefront/` in this plan, so the Vercel project root-directory setting must NOT change; verify both `.vercel/project.json` links still name `prj_Hr4mhkvvdaerwE74WKmhONopZyOy` before deploying. If any step in this plan had renamed the deploy folder, reconfiguration would be required — it does not.
3. Deploy with the standing recipe only: `bash scripts/baseline/release-app.sh deploy <pushed-sha>` (clean git archive from the repo root, pinned project, unaliased), then `promote <deployment-url>` to flip jewellerytv.vercel.app.
4. Post-deploy verification on the LIVE URL: Playwright loads jewellerytv.vercel.app, homepage renders with zero broken assets, concierge panel opens, one search turn renders tiles, and the served bundle hash matches the new build.

### Phase 6 — local cleanup + final memory
1. Local filesystem: remove empty leftover directories and stale local artifacts outside the repo's tracked tree only; list-file-driven, archive-first for anything non-empty.
2. Memory/work state: flip the split memory to LANDED with the commit hash and final layout; close the queued items; append the vault wiki log line.

## Rules the executor must not break
- Pure moves in Phase 1: no renaming of files, no "small fixes while here", no logic changes. Each rule violation is a revert.
- Documentation pointers flip in the same commit as the move they describe (Phase 3, step 1). A pointer updated before the move is as wrong as one updated after.
- The production index, agent config, and Vercel deployment settings are untouched by this entire plan.
- No deployment in this plan. Deploy happens only on Arijit's explicit release order, via the standing clean-archive recipe.
- Every phase ends with the full gate: tsc + full test suite + build + one Playwright homepage-and-concierge check.
- Archives before any delete: `../jewellerytv-cleanup-archives/` tarball, list-file-driven deletion only.
- If tests fail after a move for reasons not obviously mechanical, STOP and report; do not patch product logic to make a move pass.

## Out of scope (explicitly)
- Renaming the `storefront/` deploy folder (queued item 9).
- God-file split (`ConnectedConcierge.tsx`), brief-schema collapse, `facets.ts` export deletion (queued pass 2).
- Any agent-side (Agent Studio) change.
- Vercel settings, CI changes beyond what import paths force.
