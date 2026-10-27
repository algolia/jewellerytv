# JTV Concierge

This is the React and Node application behind the [JTV Concierge](../README.md).
It connects a conversational shopping panel to one Concierge in Algolia's Agent
Studio. The deploy folder is `app/` (renamed from `storefront/` on 2026-10-25);
the source is split into `src/website/` (the jtv.com surface), `src/concierge/`
(the panel), `src/shared/` (catalogue adapter, session contract, telemetry) and
`src/embed/`, with `server/` (the API proxy and catalogue vocabulary) beside
them. Baseline tag: `baseline-2026-10-26`.

## How the system works

One Concierge agent in Agent Studio owns every shopper-facing word. The
application never writes dialogue; it connects, checks and renders. The turn
has three steps, and every rendered tile has passed all of them:

1. **Search.** The agent searches the catalogue with Agent Studio's own
   `algolia_search_index` tool — one search per turn, twelve candidates, in-stock
   filtered server-side. The streamed result carries the hits and the live facet
   counts.
2. **Verify.** The agent curates via the client-side `present_products` tool
   (`src/concierge/tools/presentProducts.ts`). The model declares what it
   understood from the shopper's words — material, gemstone, brand as verbatim
   catalog values, a price ceiling when a budget was named — and the tool
   fact-checks that declaration against every candidate's actual record:
   exists, in stock, priced, photographed, not a same-design twin of one
   already showing, and actually carrying the declared material, stone, brand
   and budget. The generic pearl ask verifies against the record's pearl
   fields rather than a name; a declared value the catalog does not carry is
   skipped, so an invented constraint can never empty a shelf. The model
   never sees the tool's diagnostics, only the verified shelf.
3. **Render.** Every surface — the conversation preview, the staged shelf, the
   history anchor cards — renders the tool's verified list, in the tool's order,
   in rows of exactly three columns. A piece the tool dropped can never appear.
   Raw search hits never render directly.

When verification leaves the shelf under the six-tile floor, three backfill
layers top it up through the identical checks: the streamed search's remaining
hits, a tool-side follow-up search facet-filtered on the enforced requirement,
and the staging layer. The floor never invents tiles the catalogue doesn't have;
when the catalogue is genuinely thin, the reply says so.

The facet pills beside the reply come from the search's own facet counts — no
hard-coded attribute list. A tap refines its own turn, the shelf updates in
place, and the picks ride to the agent as session context, so the next typed
question keeps the narrowing.

## Guardrails

The agent's output guardrail runs four categories: prompt-injection protection,
unavailable-action-claim protection, confidential-output protection and
unapproved-sizing protection. The `unsupported_assurance_or_contradiction`
category was removed on 2026-10-26 after a measured deep-conversation run
showed it withholding six of nine genuine answers; the removal is snapshotted
and reversible. Honesty is enforced where it belongs: the instructions, the
deterministic tool checks above, and graded multi-turn story tests.

## Source map

| Area | What it owns |
| --- | --- |
| `src/concierge/ConnectedConcierge.tsx` and `EntryGuidance.tsx` | The Chat SDK wiring, streamed text with natural turn order (words stream first, the shelf mounts after the reply begins), starter questions, and the single composer path. |
| `src/concierge/tools/presentProducts.ts` | The display gate: requirement matching from the shopper's own words, plated-composite and brand enforcement, twin collapse, the six-tile floor with its three backfill layers, and the verified output with names, prices and images. |
| `src/concierge/tools/catalogRecord.ts`, `refreshProducts.ts` | The shared read-only record reader (material, gemstone and brand fields plus the raw record) and the exact-product freshness refresher. |
| `src/concierge/nativeResults.ts` | The verified-list extractors every surface renders from: `extractSearchPresentation`, `extractMessageFacetPicks` (verified items), `extractSearchHitObjectIDs` (the backfill pool), and the facet-count pills. |
| `src/concierge/ConciergeWorkspaceProvider.tsx` | Staging: normalizes the verified list, re-checks price/stock/image on the freshest record, tops up to the floor, and registers identity-verified records for `refresh_products`. |
| `src/concierge/sessionPersistence.ts`, `turnContext.ts`, `shared/concierge/` | Session persistence, the turn context carrying shopping facts and active picks to the agent, and the shared catalogue, session and vocabulary contracts. |
| `server/api.ts`, `server/concierge/` | The bounded `/api/chat` proxy with per-attempt deadlines; read-only `/api/search`, `/api/facets`, `/api/products/:id`; the tool-sheet guard that turns an agent/app tool mismatch into a labelled error instead of a silent failure. |
| `tests/concierge/` | 374 unit and integration tests, including enforcement, floor, brand and dedup suites. |

The agent's tools, instructions, guardrail and indexes are configured in Agent
Studio, not in this repository. No product-index setting or record change is
part of this application.

## Local run

Use Node.js 24. Place server credentials and the selected agent identity in the
parent project's `.env.local`; see [`.env.example`](.env.example). Set
`JTV_CONCIERGE_DEVELOPMENT_AGENT_ID` and `JTV_CONCIERGE_PRODUCTION_AGENT_ID` to
two different agents with identical definitions; the app and the baseline tools
refuse to run if they are the same. `npm run dev` is the only supported local
stack. Never commit that file or pass credentials through `VITE_*` variables.

```sh
npm ci
npm run dev
```

The app opens at `http://localhost:5173`, with the API on `127.0.0.1:5174`. The
local dev server runs the development agent (`NODE_ENV=development`); the hosted
site runs the production agent.

## Checks

```sh
npm run lint
npm run check:dependencies
npm run typecheck
npm test
npm run build
```

374 tests across 47 files pass on the current tree. Connected Agent Studio
tests consume model usage and are run deliberately — see `scripts/run-battery.mjs`
(the 35-question regression grid) and `scripts/run-stories.mjs` (four deep
multi-turn shopper stories with per-story video and self-grading).

For a read-only configuration backup, run `npm run snapshot -- <agent-id>`.
Snapshots are written under ignored `evidence/` and are not release source.

## Product documentation

A multi-chapter technical documentation set is being rebuilt separately from
this README. Historical workspace records live under `docs/workspace/` and are
dated — they describe the state at their date and are not current.

## Deployment

Deployments are explicit CLI releases only: `git.deploymentEnabled` in
[vercel.json](vercel.json) is false for every branch including `main`, so GitHub
pushes never deploy. Releases use
[`scripts/baseline/release-app.sh`](scripts/baseline/release-app.sh), which
deploys a clean Git archive of an exact commit without switching the live alias
(`deploy`) and then switches it in seconds (`promote`); the agent follows with
[`scripts/baseline/promote-agent.mjs`](scripts/baseline/promote-agent.mjs),
which refuses unless the tested hashes still match and writes a rollback
snapshot first. After any release, check an actual Concierge turn on the public
URL. The full procedure and rollback are in [docs/BASELINE.md](docs/BASELINE.md);
the Vercel project setup is in the [deployment guide](docs/deployment.md).
