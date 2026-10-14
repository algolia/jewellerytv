# JTV Concierge storefront

This is the React and Node application behind the [JTV Concierge snapshot](../README.md). It connects a two-column shopping UI to one published Concierge in Algolia's Agent Studio. The application provides typed tools, session state, read-only catalogue, blog and Help retrieval, exact product identity checks, price arithmetic and rendering. The agent generates the shopper conversation.

The current snapshot is incomplete. See the [Plan 3.1 handoff](docs/PLAN-3.1-STATUS.md) for observed passes, failures, pending work, agent inventory and the exact release version. The [workflow diagram](../README.md#how-it-works) shows the runtime boundaries; its editable source is [architecture.mmd](docs/architecture.mmd).

The application half of the [three-style Discovery repair plan](docs/DISCOVERY-REPAIR-PLAN.md) is implemented: brief-filtered style overview and per-style batch retrieval (query-level facets only, no index setting change), `three_style_grid` and `focused_choice` presentation modes with structured rejections, and a previous-choices note when a committed grid is superseded. The presentation boundary also rejects a one-group mode-less proposal outright and requires the shopper's explicit `selection` fact (or an accepted exact product) before `focused_choice` stages. The Concierge instructions were updated in the same coordinated save (instructions sha256 `a671aa36…`, October 14, 2026), and a connected local acceptance run passed the sister journey end to end the same day, including the clue-keeps-context beat, a rendered three-column grid, retained previous choices after a rejected presentation, and an explicit narrow-focus turn; receipts live under `.checkpoint/runs/sister-repair-connected-2026-10-14/`. Production deployment is a separate step.

## Source map

| Area | What it owns |
| --- | --- |
| `src/concierge/ConnectedConcierge.tsx`, `EntryGuidance.tsx`, `ResponsiveAnswerTable.tsx`, `ConciergeWorkspaceLayout.tsx` and `ConciergeWorkspaceProvider.tsx` | Installed Chat SDK, provisional text streaming, responsive educational tables, session binding, a movable/resizable desktop window with maximize/restore, full-screen mobile layout and the two-column workspace. New clears the visible prior conversation when starting a mission. The empty conversation state shows fixed starter-question pills; a pill sends exactly its displayed text through the one existing composer path. |
| `src/concierge/sdkTools.ts` and `toolRuntime.ts` | Three declared client callbacks, version checks, evidence ledger and staged product choices. No generated shopper language. |
| `src/concierge/sessionPersistence.ts` and `shared/concierge/` | v3 shopping state, lossless migration/backup, scoped facts, exact identities and deterministic selection validation. |
| `server/api.ts` and `server/concierge/` | Bounded API proxy with per-attempt upstream deadlines and an honest mid-stream error path, fixed read-only `prod_catalog`, `blog` and `help` retrieval with one query-level relaxation retry when a verbatim multi-word blog or Help query returns zero hits, exact object lookup, live-vocabulary-validated fact compilation including explicit product-audience scope, and source-bound evidence. |
| `src/ProductWorkspace.tsx` | Discover, Compare and Save views with visible product selection, prices and supported details. Agent-proposed complete looks render in the Save view with item subtotals. The tabs share one action-grid treatment. Multi-group Discover shows one lead per validated group and reveals up to two preselected variations on demand. In grid mode Discover renders three evidence-backed style columns of two to three eligible items; focused mode renders one verified column. |
| `tests/` and `evaluation/concierge-phases-1-3/` | Local regressions and a prepared but unaccepted live-journey scaffold. |

The published `Concierge - Development` now serves the public Vercel snapshot as well as the connected local path. Its tool names are `update_shopping_state`, `retrieve_evidence` and `present_choices`. The older Concierge and Interpreter have been removed after configuration backups and explicit confirmation. No product-index setting or record change is part of this application.

The application validates `Catalog_BraceletType` as a possible product-group basis, and treats an explicit men's or women's product request as audience scope: accepted audience facts compile to the authoritative catalogue gender facet, and records whose audience conflicts with the accepted scope are excluded per record. The published Agent Studio tool schema is administered separately and must be read back before claiming that the live agent can emit this newly allowed basis.

## Local run

Use Node.js 24. Place server credentials and the selected agent identity in the parent project's `.env.local`; see [`.env.example`](.env.example). The development and production identity variables may name the same published agent. Never commit that file or pass credentials through `VITE_*` variables.

```sh
npm ci
npm run dev
```

The app opens at `http://localhost:5173`, with the API on `127.0.0.1:5174`. The API uses Algolia's search-only key for read-only product, blog and Help calls. Browser state is per tab. New clears visible turns from the prior mission. Reload restores the current same-session transcript using the SDK and completion receipts. A connected local check covers New and reload; full shopper-journey acceptance is still pending. Login, cross-device state, cart, orders and payment are outside this build.

## Checks

```sh
npm run lint
npm run check:dependencies
npm run typecheck
npm test
npm run build
npm run format:check
python3 -m unittest discover -s evaluation -p 'test_*.py'
```

`format:check` still reports pre-existing formatting and large-module debt; do not claim an all-green quality gate from the other passing commands. Live Agent Studio tests consume model and classifier usage and are not part of `npm test`. The local Phase 3.1 runner now counts shopper turns separately from completion requests and uses real Save/Compare controls, but its live campaign, 22-turn continuity case and independent semantic review remain unexecuted.

For a read-only configuration backup, run `npm run snapshot -- <agent-id>`. The ID must be explicit; the command no longer defaults to a retired agent. Snapshots are written under ignored `evidence/` and are not release source.

## Deployment

Deployments are explicit CLI releases only: `git.deploymentEnabled` in [vercel.json](vercel.json) is false for every branch including `main`, so GitHub pushes never deploy. Deploy from a clean Git archive of the exact release commit with the canonical project pinned, then verify the served commit, unauthenticated access, `/api/health`, a read-only product request and an actual Concierge turn. Follow the [deployment guide](docs/deployment.md).
