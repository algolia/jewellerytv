# JTV Concierge storefront

This is the React and Node application behind the [JTV Concierge](../README.md). It connects a two-column shopping UI to one Concierge in Algolia's Agent Studio. It is the **baseline** established on 2026-10-22 ([docs/BASELINE.md](docs/BASELINE.md)): local development and production run this exact code and the same agent definition, and every future change starts from here. The agent searches the catalogue, blog and Help content with Agent Studio's own `algolia_search_index` tool and calls two deterministic client tools this application executes (`refresh_products`, `arrange_groups`), keeping judgment with the agent and stock, group size, bounds and refresh as tested code. `arrange_groups` accepts inclusive-bound flags and returns each piece's name and price. The application renders the workspace tiles from the `arrange_groups` output, keeps session state, and provides read-only exact product refresh and catalogue vocabulary. A server-side tool-sheet check turns a mismatch between the agent's declared tools and the tools this build answers into a labelled error instead of an agent that appears to fail.

Shopper-journey acceptance (Plan 3.1) is not complete. See the [Plan 3.1 handoff](docs/PLAN-3.1-STATUS.md) for observed passes, failures and pending work. The [workflow diagram](../README.md#how-it-works) shows the runtime boundaries; its editable source is [architecture.mmd](docs/architecture.mmd).

The earlier client-tool Discovery work described in the [three-style Discovery repair plan](docs/DISCOVERY-REPAIR-PLAN.md) targeted the earlier client-tool path (`retrieve_evidence`, `update_shopping_state`, `present_choices`) that the baseline retired, so it is historical here.

## Source map

| Area | What it owns |
| --- | --- |
| `src/concierge/ConnectedConcierge.tsx`, `EntryGuidance.tsx`, `ResponsiveAnswerTable.tsx`, `ConciergeWorkspaceLayout.tsx` and `ConciergeWorkspaceProvider.tsx` | Installed Chat SDK, provisional text streaming, responsive educational tables, session binding, a movable/resizable desktop window with maximize/restore, full-screen mobile layout and the two-column workspace. New clears the visible prior conversation when starting a mission. The empty conversation state shows five starter pills drawn from a search-analytics-grounded pool, varied across scenario themes and sentence voices, with a different varied set for each new conversation; a pill sends exactly its displayed text through the one existing composer path. |
| `src/concierge/tools/` (`catalogRecord`, `refreshProducts`, `arrangeGroups`) and `clientTools.ts` | The deterministic tools: one shared read-only catalogue record reader, an exact-product refresher, and the arrange tool that verifies stock, price bounds, duplicates and group sizes and returns each shown piece's name and price, registered with the Chat SDK beside the native search tool. Structured outcomes only; no generated shopper language. |
| `src/concierge/nativeResults.ts` and `toolRuntime.ts` | Read the agent's tool results (search hits and the arranged groups) out of the conversation stream for the workspace tiles, and run the turn lifecycle. No generated shopper language. |
| `src/concierge/sessionPersistence.ts` and `shared/concierge/` | Session persistence and the shared catalogue, session and vocabulary contracts. |
| `server/api.ts` and `server/concierge/` | Bounded `/api/chat` proxy with per-attempt upstream deadlines and an honest mid-stream error path; read-only `/api/search`, `/api/facets` and `/api/products/:id`; the exact product refresh route; the live catalogue vocabulary. |
| `shared/concierge/toolSheetGuard.ts` and `server/concierge/toolSheetCheck.ts` | The one list of tools this build answers, and the read-only check that compares it with the tools the agent declares. A mismatch returns a labelled 503 `tool_sheet_mismatch` on `/api/chat` and is reported on `/api/health`; an unreadable agent never blocks a turn. |
| `src/ProductWorkspace.tsx` | One discovery surface (2026-10-22 simplification): the agent's arranged groups as one column of cards per group; each tile is an image, the name and one price, and links to the product detail page. The former Discover/Compare/Save tabs, save actions, compare toggles and in-canvas preview were removed; the Ask JTV chip in the site search bar is the entry. |
| `tests/` and `evaluation/concierge-phases-1-3/` | Local regressions and a prepared but unaccepted live-journey scaffold. |

The agent's tools, instructions and indexes are configured in Agent Studio, not in this repository. No product-index setting or record change is part of this application.

## Local run

Use Node.js 24. Place server credentials and the selected agent identity in the parent project's `.env.local`; see [`.env.example`](.env.example). Set `JTV_CONCIERGE_DEVELOPMENT_AGENT_ID` and `JTV_CONCIERGE_PRODUCTION_AGENT_ID` to two different agents with identical definitions; the app and the baseline tools refuse to run if they are the same. `npm run dev` is the only supported local stack: do not start extra instances, wrapper scripts or alternate ports. Never commit that file or pass credentials through `VITE_*` variables.

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

`format:check` still reports pre-existing formatting and large-module debt; do not claim an all-green quality gate from the other passing commands. Live Agent Studio tests consume model and classifier usage and are not part of `npm test`. The local Phase 3.1 runner counts shopper turns separately from completion requests and exercised the Save/Compare controls that the 2026-10-22 simplification removed from the UI, so it predates this baseline; its live campaign, 22-turn continuity case and independent semantic review remain unexecuted.

For a read-only configuration backup, run `npm run snapshot -- <agent-id>`. The ID must be explicit; the command no longer defaults to a retired agent. Snapshots are written under ignored `evidence/` and are not release source.

## Product documentation

The Concierge handover documentation ships with the app: static pages under
[public/docs](public/docs/index.html), served by every build at `/docs/`. The pages
explain the system for the receiving development, merchandising and admin teams and are
stamped with the agent configuration and source state they describe. The pages are marked
`noindex` until their deployment is explicitly authorized.

## Deployment

Deployments are explicit CLI releases only: `git.deploymentEnabled` in [vercel.json](vercel.json) is false for every branch including `main`, so GitHub pushes never deploy. Releases use [`scripts/baseline/release-app.sh`](scripts/baseline/release-app.sh), which deploys a clean Git archive of an exact commit without switching the live alias (`deploy`) and then switches it in seconds (`promote`); the agent follows with [`scripts/baseline/promote-agent.mjs`](scripts/baseline/promote-agent.mjs), which refuses unless the tested hashes still match and writes a rollback snapshot first. After any release run `node scripts/baseline/verify-baseline.mjs` and check an actual Concierge turn on the public URL. The full procedure, rollback and the rule for updating the baseline are in [docs/BASELINE.md](docs/BASELINE.md); the Vercel project setup is in the [deployment guide](docs/deployment.md).
