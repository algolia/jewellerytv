# JTV feedback, against the rebuilt panel

The feedback document was written against the previous UI — the floating panel
with the Discover / Compare / Selected canvas, which no longer exists. Each
item below is re-checked against what is in the branch now, so nothing is
assumed fixed by the rewrite and nothing is assumed still broken by it.

Four outcomes: **solved**, **obsolete** (the surface the complaint was about is
gone), **open — ours** (prompt, index or data work we can do), **open —
platform** (blocked on Agent Studio).

## UI feedback

| # | Feedback | Status | Evidence |
|---|---|---|---|
| 1 | "Should start with some suggested prompts" (Vuori comparison) | **Solved** | Nine chips in the empty state: seven from the demand-grounded pool, up to two derived live from `on_air_shows` facets. `StarterChips.tsx`, commit `9347432`. |
| 2 | "Need UI prompts to explain Discover vs Compare vs Selected" | **Obsolete** | The canvas is gone. `ProductWorkspace.tsx` and `ConciergeWorkspaceProvider.tsx` were deleted in the migration; there are no tabs to explain. |
| 3 | "Holds onto product filters after clicking plus for a new session" | **Likely solved, needs a look** | The facet chips that carried those filters were removed with the canvas, and the plus control calls the widget's own `clearMessages`. Covered by *the new-conversation control clears the turn and keeps the panel open*. Worth one manual pass to confirm no `indexUiState` survives a clear, since the grouped tool can set it. |
| 4 | "Doesn't auto-scroll to my follow-up or the response" | **Solved, by deletion** | The old panel hand-rolled scroll follow. The library's `useStickToBottom` owns it now, which is why `concierge-stream-scroll.spec.ts` asserts the transcript grows and the turn settles rather than asserting the scroll itself. |
| 5 | "New clears the canvas but retains my questions; they look clickable" | **Obsolete** | Clearing now empties the transcript outright and returns the panel to the starter chips. Nothing persists to look clickable. |
| 6 | "Is a response like this too long? For the UI I say yes" | **Partly ours, open** | The verbosity pass cut about 20% (49.8 words median). The example quoted — three products with six bullets each — is the display tool's job now, and tiles carry the specs instead of prose. Not re-measured against this example. |

## Agent and data feedback

| # | Feedback | Status | Note |
|---|---|---|---|
| 7 | On-air data: shows, hosts, items, "what Misty showed last night" | **Solved** | Two indices, denormalised onto products, plus the `# On-air shows` instructions. Host and series questions now answer in one search with a full shelf (12 hits, 3 steps) after today's `searchableAttributes` fix. |
| 8 | "Agent knows the program guide and channel finder — why aren't they hyperlinked?" | **Solved** | Four real URLs in the prompt, rendered as anchors and opened in a new tab. Commits `c677562`, `70951d8`. |
| 9 | Service policies: returns, shipping, resizing | **Partly** | `help_content` is indexed and answers returns and shipping. The resizing gap — "doesn't explain how a customer pays for a custom size" — is a content gap, not a retrieval one. |
| 10 | Budget ignored: "$1,000 pearls" answered with two cheap pieces | **Open — platform** | This is the `numericFilters` gap. The agent cannot express a price ceiling in a search, so it filters by band and the ceiling leaks. Measured: a $150 ask returned 2 of 12 over budget. |
| 11 | Pearl answer ignores freshwater / South Sea / Tahitian | **Open — ours** | A prompt and facet-vocabulary question, untouched by the rebuild. |
| 12 | "Give options for Bella vs moissanite vs lab-grown — standard pill facets" | **Open — ours, deferred** | The facet chips were removed with the canvas and deliberately not rebuilt. This is the strongest argument for bringing some form back. |
| 13 | Comparisons restate the differences instead of offering shopping jump-offs | **Open — ours** | Prompt. |
| 14 | "Popular / trending should map to top sellers" | **Open — ours** | No popularity signal is wired in. Needs an Algolia ranking or a merchandised attribute. |
| 15 | Gender cues missed — men's ask answered with women's styles | **Open — ours** | Prompt plus facet. |
| 16 | Three watches shown don't cover the three styles described | **Open — ours** | Prompt: the prose promises a spread the selection doesn't deliver. |
| 17 | Holiday gift guide: prefer the shopping page over the blog | **Open — ours** | Prompt rule plus the category URL. |
| 18 | Bella brand voice "too technical and academic" | **Open — ours** | Prompt. |
| 19 | Zendesk handoff | **Not started** | Not in this build. |
| 20 | PDP awareness — "how much context does the agent have?" | **Partly** | The panel sends `selectedProductId` and `selectedSize` with every turn (`website/context.ts`), so the agent knows *which* product is on screen but not its attributes; it has to search for those. Worth saying plainly to the team rather than leaving as a question. |
| 21 | "Lead the customer to a next choice" (Kate Spade) | **Solved** | Post-turn suggestions render as chips under each reply; `data-suggestions` arrives on the stream and the widget draws them. |
| 22 | "Show me the original six recommendations" returned two wrong ones, then an error | **Partly** | The error was `MaxStepsPerCompletionError`, which today's two index settings removed from the eight-question set. The recall failure — not being able to re-show an earlier shelf — is untested and probably still real. |

## One thing the feedback found that we have reintroduced

Beth: *"the text needs to be in American English instead of British English."*

The concierge's own strings are American — all 36 starter labels use "jewelry",
and the placeholder is JTV's own wording. The **demo storefront** is not:
`catalogue` appears in visible copy at `website/App.tsx:96,109,110,124,290`,
`website/ProductPage.tsx:21,25`, `shared/client.ts:30` and the footer
disclosure in `shell/Shell.tsx`.

That copy ships with the demo rather than with the concierge, so it does not
reach JTV's environment — but it is what a reviewer reads, and it is the
specific thing Beth called out. Cheap to fix; not done here because it touches
the storefront rather than the panel.

## Summary

Of the 22 items, 6 are solved by this build, 2 are obsolete, 1 is blocked on
the platform, 1 is not started, and 12 are prompt, content or data work that
the rebuild neither fixed nor broke. The rebuild was never going to move most
of this list: it changed how the panel is built, not what the agent knows.
