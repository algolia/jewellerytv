# Intake — docs rebuild, 2026-10-26

**What's broken, why:** The public docs site at `app/public/docs/` (served at `/docs` on
Vercel, deploy root `app/` since the storefront-to-app rename) still describes the older
architecture: more tools, different prompts, different flow, different UI. Arijit ordered
a from-scratch rebuild as six-chapter Algolia solution documentation (brand-neutral, JTV
as reference build) with prompt anatomy (system prompt, instructions, guardrail,
configuration), real screenshots, step-through examples, a fixed stylesheet, a new table
of contents, and an adoption chapter. Cleanup of superseded docs precedes writing.
Deploy to Vercel authorized for this release after local browser verification.

**Scope classification: LIGHT.** Docs-only change: static HTML/CSS/screenshots under
`app/public/docs/`, reconciling markdown under `app/docs/`. No schema, no API, no new
dependency, no security-sensitive surface. Run artifacts live in this folder instead of
a repo-root `.development-loop/` folder to follow the project's evidence convention
(substitution noted per development-loop subagent rule).

**Approach:** Ground truth first (live agent config read, client tool source, UI source,
server flow), then cleanup (archive-then-delete), then chapters + stylesheet +
screenshots (headless Playwright vs production app), Algolia brand gate, local browser
verification, deploy, live re-verify. Shaped work order approved by Arijit
(`~/.claude/prompt-library/2026-10-26-jtv-docs-rebuild.md`).

**STRIDE gut-check:** no new attack surface, reason: static public content only; no
auth, no inputs, no secrets in pages; identifiers confined to footers/appendix.

**Rollback answer (light path, required):** redeploy the previous Vercel production
deployment (Vercel instant rollback) or rebuild from the prior commit; no migration, no
data, nothing to reverse beyond the static files.
