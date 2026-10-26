# Discovery — verified system inventory (2026-10-26)

Every fact below traces to source read this session: live agent JSON
(`agent-prod-2026-10-26T17-11-11-136Z.json`, fetched read-only), app source files, or the
running server. Sources cited inline. Stale sources rejected: `app/scripts/baseline/
baseline.json` (2026-10-24) predates the live agent — see Drift notes.

## The three tools

| Tool | Declared | Executes | Verified behavior |
|---|---|---|---|
| `algolia_search_index` | Agent Studio tool sheet, type `algolia_search_index`, static mode, `allowUnlistedIndices: false` | Agent Studio platform streams the result; the app claims the name but never executes it client-side (`clientTools.ts:83`) | 4 indices: `prod_catalog` (+ `prod_catalog_newest` replica for new arrivals), `blog`, `help_content`. Pre-filter `Inventory_InStock:true`. hitsPerPage 12 (catalog), 4 (blog/help). Page max 2 (catalog) / 1 (blog/help). Verbatim facet vocabulary + searchable attributes in the tool's enhanced description. Analytics/ABTest disabled. |
| `present_products` | Tool sheet, type `client_side` | Browser, `src/concierge/tools/presentProducts.ts` | One curation call after search. Input: 9-12 model-chosen objectIDs (max 24 hard cap) + 1-3 displayFacets. Verifies: exists, in stock, priced, photographed, not a same-design twin, requirement enforced. Requirement source = the shopper's own message text (never model-quoted; model compliance was 8%), matched against the live index vocabulary (material / gemstone / brand concepts; plated composites never satisfy a solid-metal ask). Cap 9 tiles, floor 6 with two-layer backfill: (1) streamed search's remaining hits, (2) facet-filtered follow-up search through the app proxy. Output: verified list (id, name, price, image; raw record on follow-up tiles), dropped reasons, displayFacets, enforced, backfilled, poolSize. |
| `refresh_products` | Tool sheet, type `client_side` | Browser, `src/concierge/tools/refreshProducts.ts` | Fresh facts per exact objectID (1-12): name, price, stock, image, link. Missing ID = per-ID not_found, never a partial record. Identity rule: fetched record's objectID must equal the requested one. |

Tool-sheet guard (`shared/concierge/toolSheetGuard.ts` + server check): app answers every
declared tool; mismatch = labelled 503, never a silent agent failure. Live status: match.

## The agent

- Production agent `0bdf59fe-e598-4db7-b139-2b93d5255bb4`, published. Dev twin
  `8129ad66-170b-4bb5-926a-c81d2cb38f22`. Model: `claude-sonnet-5` (both).
- System prompt, 10 sections (fetched live, sha8 dce5b890): Authority, Tools, Turn
  pipeline (search once → present 9-12 → answer from verified list), Budget
  (facet_Pricing_PriceRange bands), Filters and vocabulary, Display, Refreshing a piece,
  Source and claim rules, Session state, Tool scenarios (3 worked scenarios).
- Instructions, 13 sections (sha8 b3f987ba, 28,394 chars): Role, How you talk (Voice /
  Respond to the person first / Vocabulary / Format / While you work), Deciding each turn
  (9-row ask-vs-search table), Curating the display, The narrowing options already on
  screen, When new information changes course mid-search, Continuity and requirements,
  Evidence and sources, Service and policy answers, Money/fit/purchase boundaries, When
  something fails, Worked examples (4).
- Guardrail config: enabled, model `gpt-5.6-luna`, fail-open, 4 categories:
  instruction_override (input), unapproved_sizing_procedure (output),
  confidential_output (output), unavailable_action_claim (output) — each with scope,
  description, examples, fallbackResponse.
- Other config: enableAlgoliaMcp true, feedback enabled, suggestions disabled,
  entryPoints.searchBar.aiModeEnabled false, max_iterations 10, max_tokens 0,
  thread_depth.max_messages 0.

## Data flow (one shopping turn)

1. Browser `ConnectedConcierge.tsx` (AI SDK v5 `useChat`, transport `/api/chat`) sends
   messages + latest-turn metadata `turnContext` (`turnContext.ts`): missionId, turnId,
   `shoppingStateChunks` + `shoppingState0..N` (900-byte chunks of the accepted-facts
   JSON: factColumns + facts with scope/strength/certainty/status codes),
   `activeFacetSelections` (chip picks), extras.
2. Server `server/api.ts` validates (zod, origin allowlist, 2MB cap), checks the
   tool-sheet guard, then proxies to
   `https://{appId}.algolia.net/agent-studio/1/agents/{id}/completions?stream=true&compatibilityMode=ai-sdk-5`
   with 15s headers deadline + 30s stall deadline + one pre-headers retry.
3. Agent builds the search from the instructions (verbatim facet filters, one search per
   turn) and calls `algolia_search_index`; Agent Studio streams the result.
4. Agent picks 9-12 pieces + displayFacets, calls `present_products`; the browser
   executes it: records via `GET /api/products/{id}` (search-only key stays server-side),
   vocabulary via `GET /api/catalog-vocabulary` (index-derived, 12h TTL, empty
   multi-query facets:['*']), requirement from `shopperMessageRef` (the shopper's own
   send), backfill pool from the streamed hit list (`searchPoolRef`), last-resort
   facet-filtered search via `POST /api/search`.
5. The reply streams from the verified list. The preview renders `entry.verified`
   (never the raw stream); follow-up tiles carry their raw record. Chips render
   displayFacets verbatim, most results first, max 6 per row; a tap refines
   client-side through `/api/search` within the same turn's selection.
6. Server routes: `/api/health`, `/api/catalog-vocabulary`, `/api/agent-product-refresh`,
   `/api/search`, `/api/facets`, `/api/products/{id}`, `/api/chat`.

## UI surface

- Entry: "Ask JTV" chip inside the site search bar (`Concierge.tsx`), not a floating
  button. Two-column workspace: conversation + product canvas, full-width composer.
- Welcome screen: starter chips from a 36-question analytics-grounded pool
  (`starterQuestions.ts`), 9 per set, minimum 6, variety-capped by theme and voice.
- Tiles: image + name + price, verified only. Chips: cascading funnel, one level at a
  time. Homepage: lean 4 sections (gift-guide split, video strip, Just Reduced,
  concierge shelf) — live at jewellerytv.vercel.app.

## Drift notes (findings, not docs content)

- `app/scripts/baseline/baseline.json` (2026-10-24) is stale vs live agents
  (instructions 9956e6c5→b3f987ba, systemPrompt d516838e→dce5b890, tools
  d4e73684→cb5efdcb incl. present_products; config dev cf377cc5 ≠ prod ee435db9).
  verify-baseline.mjs exits 5 differences. Re-record after deliberate review —
  separate lane, flagged to Arijit 2026-10-26.
- `app/docs/BASELINE.md` and PLAN-3.1-STATUS.md to be reconciled in cleanup stage.
