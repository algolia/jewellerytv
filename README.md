# JTV Concierge demo

A public JTV-style shopping app for exploring jewelry through conversation. One Concierge in Algolia's Agent Studio learns the shopper's preferences, searches the read-only JTV catalogue and guidance, and helps them discover pieces. The shopper sees conversation beside a single product canvas; clicking a tile opens the product page.

**Status:** This repository holds the 2026-10-22 baseline with the chips-native cut of 2026-10-24 applied: the application on `main` and the Concierge agent are the same in local development and in production ([the baseline](app/docs/BASELINE.md)), and all future work starts from it. The Concierge is live on the public [main Vercel URL](https://jewellerytv.vercel.app/) with no Vercel login. Full anniversary, replacement, guardrail and continuity acceptance (Plan 3.1) remains open; no checkout or purchase verification exists.

**Public hosted app:** [jewellerytv.vercel.app](https://jewellerytv.vercel.app)

**GitHub:** [algolia/jewellerytv](https://github.com/algolia/jewellerytv)

## How it works

![JTV Concierge workflow](app/docs/architecture.svg)

The [editable workflow source](app/docs/architecture.mmd) keeps the diagram's source. The detailed developer view, including both safety checks and how a change reaches production, lives in the public [documentation pages](app/public/docs/index.html). The static SVG uses system fonts and self-contained shapes, so GitHub can render it without a separate PNG fallback.

The Concierge owns interpretation, tone, questions, search decisions, curation and explanations. The application owns state, identity, source boundaries, exact arithmetic and display staging. The Concierge searches the catalogue, blog and Help content with Agent Studio's own `algolia_search_index` tool — one search per turn — and calls one deterministic client tool the application executes (`refresh_products`, exact-product facts). The earlier client-side tools (`update_shopping_state`, `retrieve_evidence`, `present_choices`) were retired on 2026-10-22, and `arrange_groups` followed on 2026-10-24: the streamed search result itself is now the display. Product, blog and Help indices and all index settings remain read-only. The app does not contain canned Concierge replies or a second conversational router.

The browser stages the display directly from that search: the hits become tiles in the search's own order (image, name, one price, linking to the product detail page, at most eight), and the facet counts in the same response become the selectable narrowing chips, ordered by code from the data itself with no hard-coded attribute list. Tapping a chip refines client-side through the same-origin API, and the active picks ride to the agent so the next typed question keeps the narrowing. Same-design variants (size or metal twins) collapse to one tile. Records with no image, no price or out of stock never render as tiles. When the output guardrail withholds an answer, the tiles the search already streamed stay visible beside the fixed system notice. When a tool call fails mid-turn but the model recovers with real results and an answer, the turn is shown instead of a failure notice. Save and Compare remain jtv.com features (Love List, cart). Agent Studio memory is off, and there is no login or cross-device state.

The app displays incoming Concierge text as it streams, then commits the answer and tiles only after a completed turn.

## Google Analytics

The website installs one Google tag, `G-GVSHHN3EJQ`, in the shared HTML document head. Concierge visibility events reuse that tag: `concierge_open` and `concierge_close` contain only fixed widget labels. Conversation text, preferences and tool records are not supplied by these custom events. Analytics failures do not interrupt the widget.

```mermaid
flowchart LR
  Page[Website page shell] --> Tag[One Google tag]
  Widget[Concierge open and close] --> Tag
  Tag --> GA[Google Analytics 4]
```

SPA history-based page views are controlled by the GA4 web stream's enhanced measurement. The application does not send a second manual route page-view event. Verify real event receipt in GA after release; local fixture tests establish wiring and deduplication only.

## Run locally

Use Node.js 24 and npm. Supply the server-side Algolia values and published Concierge agent ID in the project-root `.env.local` as described in [the environment template](app/.env.example). The two variables name two different agents with identical definitions; see [the baseline](app/docs/BASELINE.md). Do not put credentials in `VITE_*` variables or Git.

```sh
cd app
npm ci
npm run dev
```

Open `http://localhost:5173`. The local API runs on `127.0.0.1:5174`. The [app guide](app/README.md) covers the source modules and checks. The [deployment guide](app/docs/deployment.md) covers the public Vercel snapshot and rollback.

## Verification and limits

The local build uses TypeScript, Vitest, ESLint and dependency checks. The live Concierge and guardrail must be judged through actual connected browser journeys. A successful tool receipt, a green unit suite or a deployed page is not proof of a complete shopping experience. The baseline's agent fingerprints are recorded in [`app/scripts/baseline/baseline.json`](app/scripts/baseline/baseline.json) and checked with `node scripts/baseline/verify-baseline.mjs`; acceptance history is in the [snapshot handoff](app/docs/PLAN-3.1-STATUS.md).

The hosted demo is publicly accessible without a Vercel login. Git-triggered deployments are disabled; a GitHub push does not deploy. The `/api/chat` endpoint is publicly reachable and invokes the published agent, so monitor its usage as public traffic grows. Customer index records, rankings, synonyms and settings must never be changed as part of this project. JTV marks and imagery are demo references and do not imply endorsement.
