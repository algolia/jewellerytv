# Docs-thread brief: the architecture as of 2026-10-26

**Arijit's directive (2026-10-26): the GitHub documentation is to be THROWN AWAY
and rebuilt from scratch** — the architecture changed too much for incremental
edits to be safe. Use this brief as the factual source for the rebuild; do not
preserve the stale prose. The one thing worth keeping from the old docs is the
historical workspace records under docs/workspace/* — mark them historical,
do not rewrite them.

For the documentation workstream. Everything below is verified on production
(build 2f45e93 lineage, promoted 2026-10-26). The stale surfaces this brief
replaces: app/README.md (describes the Oct 24 chips-native cut — `present_products`
is absent from it), app/docs/architecture.mmd/.svg (Oct 22 era), app/docs/BASELINE.md
(anchors to Oct 22), app/docs/PLAN-3.1-STATUS.md and app/docs/deployment.md
(still say "storefront"; the deploy folder is `app/` since Oct 25).

## The system in one paragraph

One Concierge agent in Algolia Agent Studio owns every shopper-facing word. The
app connects to it, executes its deterministic client tools, and renders exactly
what those tools verified. The agent searches the catalog with Agent Studio's
own `algolia_search_index` tool (one search per turn, 12 candidates, in-stock
filtered server-side), then curates via the client-side `present_products` tool;
`refresh_products` re-fetches one exact product's live record when freshness
matters. Nothing shopper-facing is hardcoded; the app's tools decide what is
allowed to render, the agent decides what is worth showing.

## The display pipeline (single source of truth)

1. The agent searches (streamed hits + facet counts arrive in the conversation)
2. The agent calls `present_products` with its chosen objectIDs
3. The tool verifies every piece — exists, in stock, priced, photographed, not
   a same-design twin, and matching the shopper's own words (material, stone,
   brand) via the index-derived vocabulary — and returns the VERIFIED list,
   best first, with name, price, image (and the raw record for any tile the
   tool itself fetched)
4. Every render surface (conversation preview, staged shelf, anchor history
   cards) renders THE VERIFIED LIST in the tool's order — never the raw stream.
   Raw hits render only in the pre-verification instant of a live stream.

## The tile law (Arijit, standing)

- Rows of exactly three columns. Six tiles minimum (two rows), nine target
  (three rows). Never 3, 4, 5 stray counts.
- Three backfill layers guarantee the floor when the catalog has the pieces:
  streamed-pool top-up → tool-side follow-up search (facet-filtered on the
  enforced requirement) → staging-layer top-up. The floor never invents tiles
  the catalog doesn't have.
- Known thin cases: a genuinely rare ask can still stage fewer than six; that
  is the catalog, not a bug, and the reply says so.

## Enforcement facts

- The requirement's source is the shopper's own message, read by the tool —
  the model-quoted `requirement` field was removed after measuring 8% compliance
- Plated composites never satisfy a solid-metal ask ("Gold Over Silver" fails a
  silver ask; "Palladium Silver" passes — an alloy, not a plating); a plated
  value passes only when the shopper named the combination, both metals in role
- Brand asks ride as verbatim facet filters on Catalog_BrandNavigationName
  (exact catalog spellings: "Gems En Vogue", "Southwest Style by JTV") and are
  enforced tool-side against each tile's brand field
- Guardrail: `unsupported_assurance_or_contradiction` was REMOVED from the
  production agent on 2026-10-26 (it withheld 6/9 turns of a deep dynamic story;
  audited at ~4x false kills). Remaining categories: instruction_override,
  unapproved_sizing_procedure, confidential_output, unavailable_action_claim.
  Rollback snapshot in app/evidence/baseline/.

## Repo shape (since Oct 25)

- Deploy folder is `app/` (renamed from `storefront/`; Vercel rootDirectory = app)
- `app/src/website/` (jtv.com surface), `app/src/concierge/` (the panel),
  `app/src/shared/` (catalog adapter, session contract, telemetry),
  `app/src/embed/` — plus `app/server/` (API proxy + catalog vocabulary) and
  `app/scripts/` (baseline tools, battery, stories)
- Tests: 374 passing across 47 files (`npm run test` from app/)
- Baseline tag: `baseline-2026-10-26`

## Stale-reference sweep owed

Eight tracked files still reference `storefront`; README + BASELINE + PLAN-3.1-STATUS
+ deployment.md need tonight's state; the architecture diagram needs the current
tool flow (search → present_products verify → verified render, with the floor
layers). Historical workspace docs (docs/workspace/*) are dated records — mark
them historical, do not rewrite history.
