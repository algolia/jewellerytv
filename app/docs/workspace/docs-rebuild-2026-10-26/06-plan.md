# Plan — docs rebuild (light path, 2026-10-26)

**Files touched:** `app/public/docs/` (new: index.html, experience.html,
architecture.html, agent.html, examples.html, adopting.html, appendix-prompts.html,
docs.css, assets/ screenshots; removed: old index.html + architecture.html after
archive), `app/docs/BASELINE.md`, `app/docs/PLAN-3.1-STATUS.md`,
`app/docs/architecture.mmd` + `.svg`, run evidence in this folder.

**Test approach:** a link/asset integrity check script (every internal href resolves,
every image exists) run before verification — the minimal regression test for a static
docs site; then a real-browser walkthrough of every page (local, then live after
deploy); Algolia brand-check gate on the prose.

**Order:** cleanup (archive-then-delete, list-file only) → screenshots from production
(headless Playwright, bounded paid turns, fresh literals) → write chapters + stylesheet
→ brand check → local verify → deploy → live verify. Regression test written before the
deploy gate.

**Rollback:** redeploy previous Vercel production deployment; no migration.
