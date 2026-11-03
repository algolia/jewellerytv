# The simplification push: what changed

From `ad51822` to `d737501`. **178 files, +5,953 / −23,498 lines** — 118 files
deleted, 40 added. What is left in `app/src` is 28 TypeScript files.

## The architectural change

The panel used to be ours: a custom display pipeline in the browser, a Node
server in front of Algolia and Agent Studio, and a workspace canvas with
Discover / Compare / Selected tabs. It is now the library's own `Chat` widget
from `react-instantsearch`, talking to Agent Studio directly from the browser,
with one small component of ours wrapped around the display tool.

That is the whole push. Everything below is a consequence of it.

**The server is gone.** `app/server/`, `app/api/` and `app/shared/concierge/`
were deleted. The storefront now reads Algolia directly with a search-only
key, and a product page reads its record by `objectID` instead of calling a
proxy route. One failure mode went with it: the dead `/api/products/:id` did
not 404, it fell through to the SPA shell and returned `index.html` with a
200, so a missing product surfaced as a JSON parse error.

**Four display layers became one.** The old pipeline re-checked stock, price
and image at four separate points, each against a record it had not fetched,
and each returning nothing in silence when a check failed. There is now a
single gate (`gatedGroupedResults.tsx`) that reads the conversation's own
record store rather than re-fetching, and logs every refusal. It enforces only
what no index setting can: no image, a duplicate, a group too small to be a
shelf, a tile stranded on a row by itself.

**The canvas is gone**, which closed two items on the team's feedback list by
deletion rather than by work — the tabs nobody could explain, and the filters
that survived a new session.

## What was added back

- **Starter suggestions.** Nine chips on the empty panel: seven from the
  demand-grounded pool, up to two derived live from `on_air_shows` facet
  counts so the panel opens on a series and a host that actually aired.
- **A right-hand full-height rail**, shelves as a four-across grid rather than
  carousels, and JTV's filled-pill styling.
- **Live-schedule links.** Four real jtv.com URLs for the questions the
  indices cannot answer, rendered as anchors and opened in a new tab.
- **A pending shelf** during the display tool's stall, so the four seconds
  between the reply text and the pieces show the shape of what is coming.
- **The test suite, rewritten.** 106 unit tests and 58 end-to-end tests across
  two viewports, against 8 e2e specs and 6 unit files.

## What it measures

Eight fixed questions, caching off, run at every step:

| | before | after |
|---|---|---|
| median turn | 14,920ms | **5,751ms** |
| steps per turn | 3 | **2** |
| turns needing a second search | 1 of 8 | 0 of 8 |
| failures | varied; 2 of 8 at worst | 0 of 8 |
| tool output per search | 131,869 chars | **3,902** |
| facets in context | ~150 | **9** |
| attributes retrieved per hit | 75 | 3 |

Most of the speed is not from the rewrite. It came from two index settings and
two agent settings that the measurements pointed at — word matching on
`on_air_products`, making host and series searchable, cutting the facet list
to nine, and trimming what each hit returns.

## What we learned that changed a decision

- **Removing the display tool is faster and worse.** Three and a half seconds
  quicker on easy questions, two of eight failing outright, the carousel back,
  and the grouping recited as SKU codes in prose. Restored.
- **Tiles cannot render before the display tool finishes.** The wait is real —
  a median of 6.9 seconds with every piece already in hand — but the tool
  curates: it named fewer pieces than the search returned on three of eight
  turns, including the two where the curation is the only thing enforcing a
  budget. Early rendering would show pieces the agent chose to exclude.
- **The step cap is reached only after a search returns nothing.** Not a
  general ceiling: a normal question costs three of five steps. Every captured
  failure began with an empty search.
- **`filterOnly` never blocked a price comparison.** The budget ceiling is
  blocked by the agent having no per-query comparison parameter, not by an
  index setting — which moved the ask from the index owners to the platform.

## Still open

| | Owner |
|---|---|
| No per-query numeric comparison, so a budget leaks at a band boundary | Agent Studio |
| The display tool's fixed ~4.4s stall | Agent Studio |
| `searchable()` on the two high-cardinality facets | index |
| Three paste blocks drafted and not yet applied: the opening line, the retry rule, the refreshed on-air tool descriptions | agent |
| Facet pills, the team's feedback item 12 | product decision |
| Zendesk handoff | not started |
