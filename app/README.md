# JTV Concierge

The React application behind the [JTV Concierge](../README.md): a conversational
shopping panel wired to one agent in Algolia's Agent Studio.

**There is no application server.** The browser talks to Algolia and to Agent
Studio directly with a search-only key, restricted in the Algolia dashboard. The
Node server that used to proxy this was deleted on 2026-10-28 along with a
custom display pipeline, when the panel was rebuilt on `react-instantsearch`'s
own `Chat` widget — 23,000 lines removed, 1,300 added. That history matters for
anyone extending this: **before building a surface, check what the library
already ships.** The long version is in
[docs/building-agents.md](docs/building-agents.md).

The source splits four ways:

| Directory | What it is |
| --- | --- |
| `src/concierge/` | The panel. This is the product. |
| `src/website/` | A demo storefront to put the panel in. **Not** part of what JTV deploys. |
| `src/embed/` | The script-tag and iframe route onto a site we do not own. |
| `src/shared/` | Algolia client, telemetry, catalogue adapter for the demo. |

## How one turn works

The agent owns every shopper-facing word. The application connects and renders;
it never writes dialogue and holds no product logic.

1. **Search.** The agent calls Agent Studio's `algolia_search_index` over four
   indices — `prod_catalog_featured`, `on_air_products`, `help_content`,
   `blog` — each with its own page size, retrieved fields and permitted facets
   set on the index entry. In-stock filtering lives there too, where it cannot
   fail quietly.
2. **Display.** The agent calls `algolia_grouped_results` to say which pieces
   belong together and what each group is called. It is capped by
   configuration: `maxGroups: 3`, `maxResultsPerGroup: 4`.
3. **Render.** The widget renders those groups through our tile. The gate
   below is the only place a piece can be refused.

## The files that matter

### The shell

| File | What it owns |
| --- | --- |
| `concierge/Concierge.tsx` | Open and closed, collapsed and normal, the imperative `ask()` handle the entry chip calls, and the page context attached to each turn. Holds the panel's only import from the storefront (`website/analytics`). |
| `concierge/panelState.ts` | Open and size, persisted to sessionStorage so a reload does not undo what the shopper chose. |
| `concierge/panelAnchor.ts` | Measures the navigation bar's live bottom edge each animation frame and clamps it to a gutter, so the panel hangs from the nav under a sticky header, a scrolling one, or none at all. |
| `concierge/useConciergeWindowControls.ts`, `windowGeometry.ts` | Drag by the header, resize by the corner, clamped to the viewport. The geometry is pure and unit-tested. |

### The conversation

| File | What it owns |
| --- | --- |
| `chat/JtvChat.tsx` | The widget: chat instance, the transport pointed at Agent Studio, the custom header, and every component override. The place to look first. |
| `chat/narrationFilter.ts`, `narration.ts` | Strips the model's process-talk ("Let me search for…") out of the stream before it renders. Judges **per sentence** — a block-level verdict released everything after the first real line. |
| `chat/loaderVisibility.ts`, `chatLoader.tsx`, `loaderText.ts` | Keeps a labelled status up through the buffered tool call and the shelf skeleton. Without it there were 4.2 measured seconds of blank panel. |
| `chat/StarterChips.tsx` | The empty state: heading, one sentence, five fixed suggestions — two on-air, two product, one service. |
| `chat/chatActions.tsx` | The per-message action row. |

### The shelf

| File | What it owns |
| --- | --- |
| `chat/gatedGroupedResults.tsx` | The largest and most load-bearing file. Overrides the grouped-results tool: refuses repeats and unphotographed pieces, drops the tool's duplicate intro and subtitle, renders the skeleton, and hosts the refinement funnel. Groups otherwise render exactly as the agent grouped them. |
| `chat/ProductCard.tsx` | The one tile. Photograph only, no price and no name (JTV's call, 2026-11-06); the name rides the alt text and the link label so the piece is identifiable without sight. Reads both record shapes, catalogue and on-air. |
| `chat/narrowChips.ts`, `refineSearch.ts` | Refinement chips built from the search's own facet counts, and the client-side re-search a tap runs — no agent turn, no tokens. |
| `chat/linkTarget.ts` | Decides whether a clicked link is internal, external or neither, so opening a product keeps the conversation instead of reloading the page. |
| `chat/jtv-chat.css` | All panel chrome. The header's colours are custom properties in one block at the top. |

### Not in this repository

The agent's **instructions, tools, guardrails, index entries and facet
permissions** live in Agent Studio. Most behaviour people call a bug is
configuration rather than code — a prompt instructing a filter the agent is not
permitted to use, or naming a field it is not allowed to retrieve.

`docs/agent/instructions.md` tracks the live prompt but does not apply it.
`node scripts/sync-agent-prompt.mjs` is a read-only GET that pulls the live copy
down and exits non-zero if the two differ. **Run it before trusting any
measurement** — half the "the fix didn't work" results on this project were "the
fix was never applied."

## Deploying into JTV

What JTV takes depends on how much of their page they want to give up. Two
routes, and the first is far cheaper.

### Route A, the embed: a script tag

One line on jtv.com, nothing built into their application:

```html
<script src="https://<concierge-host>/concierge/loader.js"
        data-jtv-target="#siteSearchForm"
        data-jtv-pdp-template="https://www.jtv.com/product/{id}"
        defer></script>
```

What ships: `public/concierge/loader.js`, built by `scripts/build-embed.mjs`
into a dependency-free IIFE, and the panel bundle from `src/embed/frame.html`,
which `npm run build` emits as a second Vite entry. Both are static files on any
host.

The loader injects an "Ask JTV" chip next to `data-jtv-target` and opens the
panel in an iframe on first use. Host and panel talk over `postMessage` with
explicit origins: the host sends `open`, `ask` and `close`; the panel sends
`ready`, `product-click` and `closed`. **Product URLs are resolved on the host
side** from the PDP template, so the panel never needs to know their routing.

Right when JTV wants this live without a frontend release, or on pages their
React application does not own. The cost is the iframe: the panel cannot push
their page aside, and in-page navigation is theirs to handle via
`product-click`.

### Route B, the component: import it

They take `src/concierge/**` and mount it in their own React tree:

```tsx
<Concierge
  ref={chat}
  context={getContext} // ambient page facts, attached to each turn
  onNavigate={navigate} // their router, so the conversation survives a PDP
  anchorSelector=".main-nav" // the element the panel hangs from
/>
```

Three things to sever or supply first:

1. **`concierge/Concierge.tsx` imports `../website/analytics`** — the panel's
   only dependency on the demo storefront. Point it at their analytics or
   delete the call.
2. **`jtv-chat.css` falls back to storefront custom properties** — `--blue`,
   `--text`, `--line`, `--muted`, declared in `website/styles.css`. The
   fallbacks are inline so it renders without them, but their own tokens should
   be supplied instead.
3. **Peer dependencies:** `react-instantsearch`, `instantsearch.js`,
   `algoliasearch`, `lucide-react`, and `instantsearch.css/components/chat.css`.

Right when JTV wants the panel to behave as part of the page: sharing their
router, matching their design tokens, pushing content rather than floating over
it.

### What they configure either way

| | |
| --- | --- |
| Credentials | `VITE_ALGOLIA_APP_ID`, `VITE_ALGOLIA_SEARCH_API_KEY` (search-only, restricted) and `VITE_JTV_AGENT_ID`. Inlined at build time and **public by design**. |
| Agent | Their own Agent Studio agent. Prompt, tools, index entries and facet permissions are configuration and do not travel in this repository. |
| Indices | `prod_catalog_featured`, `on_air_products`, `help_content`, `blog`, pointed at their own data. An `on_air_shows` index existed earlier and was removed from the agent; the four above are what it searches today. |
| Entry point | Something that calls `ask()` — the chip in the search bar here, plus "Ask about this item" on the product page. |

### What does not travel

`src/website/` is a demo storefront written to have somewhere to put the panel,
and `src/shared/catalog/` adapts a fixture catalogue for it. Neither is part of
the product, and neither should be read as a recommendation about their
storefront.

## Local run

Node.js 24. Put browser configuration in the gitignored `app/.env`; see
[`.env.example`](.env.example). Set `JTV_CONCIERGE_DEVELOPMENT_AGENT_ID` and
`JTV_CONCIERGE_PRODUCTION_AGENT_ID` to two different agents with identical
definitions; the tooling refuses to run if they match. Never commit that file.

```sh
npm ci
npm run dev        # http://localhost:5173
```

## Checks

```sh
npm run lint
npm run typecheck
npm test           # 198 unit tests across 25 files
npm run test:e2e   # 9 Playwright specs, desktop and mobile projects
npm run build
```

The end-to-end specs script every agent turn through
`tests/e2e/fixtures/agentStream`, so they spend no model usage. The suites that
do call a live agent are run deliberately: `scripts/run-battery.mjs`, a
regression grid, and `scripts/run-stories.mjs`, multi-turn shopper stories with
self-grading.

**Agent behaviour is bimodal.** The same prompt and the same question give a
clean answer and a broken one on alternate runs. Nothing here is judged on fewer
than ten runs, before and after. Three times on this project five runs said
"fixed" and ten said otherwise.

## Deployment of the demo

Explicit CLI releases only: `git.deploymentEnabled` in
[vercel.json](vercel.json) is false on every branch including `main`, so pushes
never deploy. Releases use
[`scripts/baseline/release-app.sh`](scripts/baseline/release-app.sh), which
deploys a clean archive of an exact commit and then switches the alias, and the
agent follows with
[`scripts/baseline/promote-agent.mjs`](scripts/baseline/promote-agent.mjs),
which refuses unless the tested hashes still match and writes a rollback
snapshot first. Check a real turn on the public URL afterwards. Full procedure
and rollback are in [docs/BASELINE.md](docs/BASELINE.md); the Vercel project
setup is in the [deployment guide](docs/deployment.md).

## Other documentation

[docs/building-agents.md](docs/building-agents.md) covers what went wrong
building this and what to look for next time. Worth reading before changing the
prompt.

`docs/workspace/` holds dated investigation records. They describe the state at
their date and are not current.
