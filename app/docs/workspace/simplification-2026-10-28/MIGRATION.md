# Migration: direct Agent Studio, built-in display

## Why

The display pipeline has four layers that each independently verify stock, price
and image, and each returns `null` or `[]` on failure. On 2026-10-28 a turn
reported `present_products status: ok, 6 of 6, zero dropped` and the shopper saw
an empty screen, with no error logged anywhere: layer 1 verified against the
catalogue record, layer 3 re-verified against the streamed on-air hit, which
carries none of the catalogue fields. Finding that took two hours and required
importing a module-level telemetry array into the page.

`react-instantsearch@7.51.0` already ships the entire surface this reimplements:

```
Chat · ChatOverlayLayout · ChatInlineLayout · ChatSidePanelLayout
ChatGreeting · ChatTrigger · ChatMessageLoader · createDefaultTools

algolia_search_index · algolia_grouped_results · algolia_display_results
algolia_compare_products · algolia_recommend · algolia_memorize
algolia_memory_search · algolia_ponder
```

Per-tool rendering is overridden by tool id, which is the customisation hook we
need. `/Users/eliasingea/code/vuori-assistant` is the reference: it talks to
Agent Studio directly from the browser with no server at all, and the whole
assistant is 515 lines.

## Target shape

From `components/organisms/ChatAssistant.tsx` in vuori:

```tsx
const chatInstance = new ChatClass({
  agentId,
  transport: new DefaultChatTransport({
    api: `https://${appID}.algolia.net/agent-studio/1/agents/${agentId}/completions?compatibilityMode=ai-sdk-5`,
    headers: { 'x-algolia-application-id': appID, 'x-algolia-api-key': apiKey },
  }),
});

<Chat
  chat={chatInstance}
  layoutComponent={ChatLayout}
  promptComponent={ChatPrompt}
  suggestionsComponent={PromptSuggestions}
  tools={{
    [SearchIndexToolType]: {
      // Harvest hits into a registry, render nothing.
      layoutComponent: ({ message }) => {
        message.output?.hits?.forEach((h) => (registry[h.objectID] = h));
        return <></>;
      },
    },
    [GroupedResultsToolType]: {
      streamInput: true,
      layoutComponent: ({ message }) => {
        const { intro, groups } = message.input ?? {};
        // Groups name objectIDs; the registry holds the real records.
        return groups?.map((g) => <Carousel key={g.title} title={g.title}
          products={(g.products ?? []).map((p) => registry[p.objectID]).filter(Boolean)} />);
      },
    },
  }}
/>
```

Two things this buys beyond the deletion: `streamInput: true` renders tiles while
the model is still writing the call, rather than after the tool result; and the
registry pattern means a tile can only render for a record the search actually
returned, which preserves the one guarantee worth keeping.

## What we lose, deliberately

The verified-display gate. Nothing will re-check stock, price, image, design
twins, budget ceilings or requirement matching. Hallucinated SKUs are not the
risk, since hits come from the index. The real losses and their new homes:

| Lost check | Replacement |
| --- | --- |
| `out_of_stock` | `searchParameters.filters` on the index entry: `Inventory_InStock:true` (already set for `prod_catalog`), `outOfStock:false` for `on_air_products` |
| `no_image` | The item component renders a placeholder or skips |
| `unpriced` | Item component; price display is going away anyway |
| `over_budget` | Prompt only. This is a genuine downgrade, accept it knowingly |
| `variant_of_shown` | Index-side `distinct`, or accept twins |
| `requirement_mismatch` | Prompt only |

## Delete list

### Display pipeline — delete outright (2,023 lines)

| File | Lines |
| --- | --- |
| `src/concierge/tools/presentProducts.ts` | 579 |
| `src/concierge/nativeResults.ts` | 437 |
| `src/concierge/ConciergeWorkspaceProvider.tsx` | 292 |
| `src/shared/ProductWorkspace.tsx` | 215 |
| `src/concierge/tools/catalogRecord.ts` | 174 |
| `src/concierge/clientTools.ts` | 166 |
| `src/concierge/ConciergeWorkspaceLayout.tsx` | 126 |
| `src/concierge/FacetChips.tsx` | 94 |
| `src/concierge/InlineProductCards.tsx` | 75 |
| `src/concierge/tools/refreshProducts.ts` | 59 |
| `src/concierge/tools/designVariant.ts` | 25 |
| `src/shared/ShoppingWorkspace.tsx` | 13 |
| `src/concierge/workspaceResults.ts` | 9 |

### Server and its clients — delete outright (1,357 lines + adapters)

| File | Lines |
| --- | --- |
| `server/` (api, config, index, concierge/*, vercel-routing, snapshot) | 1,341 |
| `src/shared/client.ts` (proxy search client) | 16 |
| `api/[...path].ts`, `api/products/[objectID].ts` | adapters |
| `shared/concierge/toolSheetGuard.ts` + `server/concierge/toolSheetCheck.ts` | guard dies with the server |

`InstantSearch` on the storefront switches to `algoliasearch/lite` directly, as
vuori does in `pages/_app.tsx`.

### Session and turn machinery — delete, `ChatClass` owns this (538 lines)

| File | Lines |
| --- | --- |
| `src/concierge/sessionPersistence.ts` | 301 |
| `src/concierge/turnCompletion.ts` | 102 |
| `src/concierge/turnContext.ts` | 72 |
| `src/concierge/sessionStore.ts` | 63 |

### Rewrite

- `src/concierge/ConnectedConcierge.tsx`, 1,527 lines, becomes roughly 200: a
  `ChatClass`, a transport, a `<Chat>` with two tool overrides.
- `src/concierge/useCatalogVocabulary.ts` (59) and `toolRuntime.ts` (48) go with
  the tools they served.

### Keep

- `useConciergeWindowControls.ts` (172) and `windowGeometry.ts` (67) if the
  floating window stays. These are the one genuinely custom UX piece.
- `starterQuestions.ts` (120) and `EntryGuidance.tsx` (91) become
  `suggestionsComponent`.
- `ResponsiveAnswerTable.tsx` (58) for markdown tables.
- `verifiedBlogLinks.ts` (87): cheap safety on agent-authored hrefs, keep.
- `src/shared/catalog/*`: `facets.ts` (547) belongs to the storefront;
  `adapter.ts` (54) may still normalise records for the item component.
- `src/shared/telemetry.ts` (60), trimmed to what remains.

**Net: roughly 3,900 lines of source deleted, before tests.**

## Agent-side changes

1. Tool sheet: drop `present_products` and `refresh_products`, add
   `algolia_grouped_results`. Keep `algolia_search_index` with its six indices.
2. Index entries: add `searchParameters.filters = "outOfStock:false"` to
   `on_air_products`; `prod_catalog` already carries `Inventory_InStock:true`.
3. Instructions: delete every rule that exists only because of the custom
   pipeline. The display-tool verdict ban, the shelf floor, the facet picks, "the
   display tool verifies every piece", the drop-reason vocabulary. Keep voice,
   breadth, evidence, money and on-air policy.

## Order of work

The tool-sheet change and the app change must ship together, or every turn 503s
on the guard until the server is gone.

1. Branch, and get the new `<Chat>` panel rendering against the existing agent on
   a throwaway route, reading `algolia_search_index` output only. No deletions
   yet.
2. Switch the dev agent's tool sheet to `algolia_grouped_results`, point the
   panel at it, confirm tiles render with `streamInput`.
3. Delete the display pipeline and the session machinery.
4. Delete the server; move `InstantSearch` to a direct `algoliasearch/lite`
   client; delete the Vercel API adapters.
5. Prune the prompt.
6. Delete orphaned tests, then write the three below.
7. Re-run the on-air and catalogue checks, promote, re-record `baseline.json`.

## Test posture after the cut

Most of the 13,381 lines of tests cover files on the delete list. Do not port
them. Every bug this session lived between units, which is exactly where there is
no coverage today. Write three:

1. **Turn renders results.** A completed turn whose `algolia_grouped_results`
   call names objectIDs renders that many tiles. This is the test that would have
   caught the silent `stage-empty`.
2. **Thin record.** The item component renders a record with no image and no
   price without throwing or rendering a broken tile.
3. **Failure paths.** A guardrail violation and a transport error each surface a
   visible notice rather than an empty panel.

Keep the existing `tests/api.test.ts` only for whatever of the server survives,
which should be nothing.

## Risks

- **Public completions.** With no proxy, anyone can run the agent from the
  browser. Mitigate with Algolia key restrictions; in JTV's own environment it
  sits behind their auth.
- **Budget enforcement weakens** from code to prompt. Measure it before and after
  on a "under $200" ask.
- **`baseline.json` and `docs/BASELINE.md`** both describe the current tool
  sheet and will need re-recording. `verify-baseline.mjs` fails until then.
- **The `unavailable_action_claim` guardrail** is unrelated to this work and still
  over-fires on benign phrasing.
