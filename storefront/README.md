# JTV Concierge storefront

This is the React and Node application behind the [JTV Concierge snapshot](../README.md). It connects a two-column shopping UI to one published Concierge in Algolia's Agent Studio. This branch (`agent-2`) is the native-first rebuild: the agent searches the catalogue, blog and Help content with Agent Studio's own tools (`algolia_search_index` and `algolia_grouped_results`) and generates the shopper conversation. The application renders the workspace from the agent's grouped results, keeps session state, and provides read-only exact product refresh and catalogue vocabulary. It has not been run against the currently published production agent, which still uses the three client-side tools, and it is not deployed.

The current snapshot is incomplete. See the [Plan 3.1 handoff](docs/PLAN-3.1-STATUS.md) for observed passes, failures, pending work, agent inventory and the exact release version. The [workflow diagram](../README.md#how-it-works) shows the runtime boundaries; its editable source is [architecture.mmd](docs/architecture.mmd).

The earlier client-tool Discovery work described in the [three-style Discovery repair plan](docs/DISCOVERY-REPAIR-PLAN.md) targeted the client-tool path that this branch removed, so it is historical here.

## Source map

| Area | What it owns |
| --- | --- |
| `src/concierge/ConnectedConcierge.tsx`, `EntryGuidance.tsx`, `ResponsiveAnswerTable.tsx`, `ConciergeWorkspaceLayout.tsx` and `ConciergeWorkspaceProvider.tsx` | Installed Chat SDK, provisional text streaming, responsive educational tables, session binding, a movable/resizable desktop window with maximize/restore, full-screen mobile layout and the two-column workspace. New clears the visible prior conversation when starting a mission. The empty conversation state shows five starter pills drawn from a search-analytics-grounded pool, varied across scenario themes and sentence voices, with a different varied set for each new conversation; a pill sends exactly its displayed text through the one existing composer path. |
| `src/concierge/nativeResults.ts` and `toolRuntime.ts` | Read the agent's native tool results (search hits and grouped results) out of the conversation stream for the workspace cards, and run the turn lifecycle. No generated shopper language. |
| `src/concierge/sessionPersistence.ts` and `shared/concierge/` | Session persistence and the shared catalogue, session and vocabulary contracts. |
| `server/api.ts` and `server/concierge/` | Bounded `/api/chat` proxy with per-attempt upstream deadlines and an honest mid-stream error path; read-only `/api/search`, `/api/facets` and `/api/products/:id`; the exact product refresh route; the live catalogue vocabulary. |
| `src/ProductWorkspace.tsx` | Discover, Compare and Save views. Discover renders the agent's grouped results as one column of cards per group, with Save and Compare on each card. |
| `tests/` and `evaluation/concierge-phases-1-3/` | Local regressions and a prepared but unaccepted live-journey scaffold. |

The agent's tools, instructions and indexes are configured in Agent Studio, not in this repository. No product-index setting or record change is part of this application.

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
