# JTV Concierge

This is the React application behind the [JTV Concierge](../README.md). It
connects a conversational shopping panel to one Concierge in Algolia's Agent
Studio. The deploy folder is `app/` (renamed from `storefront/` on 2026-10-25);
the source is split into `src/website/` (the jtv.com surface), `src/concierge/`
(the panel), `src/shared/` (catalogue adapter, telemetry) and `src/embed/`.
There is no application server: the browser calls Algolia and Agent Studio
directly with a search-only key, restricted in the Algolia dashboard.

## How the system works

One Concierge agent in Agent Studio owns every shopper-facing word. The
application never writes dialogue; it connects and renders.

1. **Search.** The agent searches with Agent Studio's own
   `algolia_search_index` tool over six indices, in-stock filtered by the index
   entry's own search parameters. The streamed result carries the hits.
2. **Display.** The agent groups what it chose with the built-in
   `algolia_grouped_results` tool. `react-instantsearch`'s `Chat` widget renders
   those groups, and the conversation's own records store supplies each piece's
   record, so a tile can only render for a record the search actually returned.
3. **Render.** `src/concierge/chat/ProductCard.tsx` is the single tile: image,
   name and a link to the product page. Price is deliberately absent, since the
   product page is the only place a price is current.

The panel holds no eligibility logic of its own. The four-layer verification it
used to run (tool admission, extraction cross-check, staging re-check, render
caps) was removed on 2026-10-28: each layer independently re-checked stock,
price and image and each returned nothing in silence, so a shelf could vanish
with every layer reporting success. Stock filtering now lives in the index
entry's search parameters, where it cannot fail quietly.

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
| `src/concierge/chat/JtvChat.tsx` | The whole panel: a chat instance, a transport pointed at Agent Studio, and the library `Chat` widget. 74 lines. |
| `src/concierge/chat/ProductCard.tsx` | The one tile component, passed to `Chat` as `itemComponent`. Reads both record shapes: catalogue (`Catalog_TitleDescription`, `Media_Images`) and on-air (`name`, `image`). |
| `src/concierge/Concierge.tsx` | The panel shell: open and close state, the `ask` handle the Ask JTV chip calls, and the page context attached to each turn. |
| `src/shared/client.ts` | The storefront's Algolia client, `algoliasearch/lite` with analytics off. |
| `tests/` | Unit and integration tests. The suites covering the removed pipeline went with it on 2026-10-28. |

The agent's tools, instructions, guardrail and indexes are configured in Agent
Studio, not in this repository. No product-index setting or record change is
part of this application.

## Local run

Use Node.js 24. Place the browser configuration in the gitignored `app/.env`;
see [`.env.example`](.env.example). `VITE_ALGOLIA_APP_ID`,
`VITE_ALGOLIA_SEARCH_API_KEY` and `VITE_JTV_AGENT_ID` are inlined into the
bundle at build time and are public by design. Set
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
