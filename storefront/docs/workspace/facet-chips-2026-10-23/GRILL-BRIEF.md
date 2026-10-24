# GrillMe brief — facet-chip two-step concierge
_2026-10-23 · product/software · full grill (compressed, prior lenses pre-run) · status: ready. INDEPENDENT GATE SKIPPED: the Codex adversarial pass failed on the workspace spend cap (2026-10-23). The council is Claude-only (partial); objections list is single-model and should get an independent pass when the cap resets._

## The idea (as stated)
Replace the custom grouped-results pipeline (`arrange_groups` tool + three-direction
aiming + app-side grouping/hydration/surplus) with: agent runs one discovery search,
writes 1–2 sentences in its real voice, and emits which 1–3 facet attributes to show;
the app renders those as label chips (no counts); tapping a chip filters products
client-side, instantly. Chips carry the catalog's own structure (guided navigation,
as on jtv.com). Replace, not add — the custom layer is deleted. Titles hidden on
tiles (image + price; full title in a11y/PDP). Voice rule: prose carries breadth
beyond the chips, never repeats a chip value.

## Separate threads parked
- Prompt sanitization rewrite (converges with this — delete sections rather than rewrite)
- Search-bar placement of the concierge (transcript, separate workstream)
- Desktop inline conversion (built for mobile-anchored cards; this supersedes parts)

## Evidence tiers
- **T1 (verified on our system today):** facet counts real and query-derived
  (19+ queries probed); `Catalog_ProductType` and `Pricing_PriceRange` both exist
  with counts; 35-question walkthrough validated with graceful degradation
  (chips/silence rule); four mockups render with 17 real filtered product sets.
- **T2 (vendor doc):** InstantSearch refinement semantics; Algolia facet behavior.
- **T3 (prior decision/note):** transcript decisions (mobile-first 60%, tiles
  concise, in-line products + PDP, follow-up buttons valued); behavior-bar voice rules.

## Exchange log (working memory)
- Q: what proves the problem? A: transcript UX feedback (prototype too complex,
  multi-column confusing, tiles verbose) [T3] + our own debugging history
  (arrange_groups schema bug, surplus silent drop, red notices) [T1].
  Next: measure on the battery, not opinion.
- Q: chips-first = zero products on turn 1 for broad queries? RESOLVED [firm]:
  chips + preview row of the top 3–4 hits by native Algolia relevancy from the
  SAME discovery response — no "favorites" judgment, no extra search, no
  added latency. Arijit: "it's not favorite, it's just relevancy."
- Q: multi-select? OPEN. Mockup is single-select; guided nav stacks. Arijit's call.
- Q: who filters the tap-searches (in-stock/budget parity)? RESOLVED [firm]:
  Arijit drops the in-stock/RO-stock concern entirely — concierge is the
  discovery layer, PDP owns stock truth. Consequence: no server proxy needed;
  the only parity requirement left is that tap refinements replay the agent's
  base query (text + budget bands), which the client can read from the streamed
  tool input. Stock filter may still be kept as a one-line native facet filter
  for UX (no dead tiles) — Arijit's call, default drop.
- Q: are chip labels a new hardcoding risk? RESOLVED [firm]: values come
  verbatim from index facets, exactly as the website paints its guided
  navigation — data-driven, zero hardcoded lists. The model only picks WHICH
  attribute; an attribute with ugly values simply does not get picked.
- Q: proceed with arrange_groups removal? RESOLVED [firm]: yes, with the
  readers sweep (grep the tool-part-type class) and the before/after battery
  as the correctness conditions.

## Council
### Advocate — strongest case for
Catalog truth beats model invention: deterministic structure, zero invented
directions, zero eligibility surprises; deletes the entire custom grouping layer
(tool, schema, surplus, hydration, closed-attribute bug class); turns every
follow-up browse from a 15–20s agent turn into an instant tap; matches the
website's own pattern and the JTV transcript line by line (concise tiles, in-line
products, follow-up affordances valued); the model's one judgment (which facets)
is the judgment it already exercises well; 35-question validation shows graceful
degradation everywhere it must.

### Skeptic — strongest falsification attempt
1. **The curation was the differentiator.** "Three real directions, chosen for
   you" is the demo that wowed JTV; chips reduce the agent to a faceted search box
   with extra latency. Vuori doesn't have an agent; if the concierge becomes
   guided nav, why not just use the website's search?
2. **Turn 1 regression.** Broad browse previously showed 3 directions × pieces
   immediately; now the first turn can show zero products. "Access products
   quickly" is a transcript requirement.
3. **Filter parity gap.** The deterministic eligibility layer (in-stock, budget)
   lives in the agent's tool config; client-side tap searches bypass it unless a
   proxy replicates the config — a new config surface to keep in sync (the
   two-copies antipattern this project has been burned by).
4. **Stream-contract blast radius.** The app parses `tool-arrange_groups` parts;
   removing the tool breaks every reader keyed to the old part types (a known
   defect class in this repo), including canvas restore, withhold-tiles, and the
   refresh-product contract.
5. **Model output risk.** "One field" is a new structured output the guardrails
   and schema must carry; a wrong pick (hardware facets, single-value facets)
   resurfaces noise the old pipeline hid.

### Neutral Analyst — what settles it
1 vs 2 is settled by evidence, not argument: run the battery with a chips+preview
variant vs chips-only and measure tap-through and time-to-first-product. 3 and 4
are engineering requirements, not reasons to stop: one server proxy (single
source of filter config), and a readers-sweep before any tool removal (grep the
part-type class). 5 is bounded by the suppression rules already validated
(single-value and hardware facets suppressed; the 35-question walkthrough showed
the failure mode is "no chips", never "chips lie").

## Lens findings (sharpest)
- **Alternatives/status quo:** strongest competitor is keep-arrange_groups and
  just shorten prose. Rejected because transcript complaints target the grouped
  canvas itself, not just prose length. [firm]
- **Feasibility/platform:** facet counts client-side — must verify whether the
  streamed search-tool part carries facet_counts; fallback is the site search
  client. [verify before build]
- **Reliability/ops:** tool removal = reader sweep + battery + staged rollout;
  feature-flag the chip UI so revert is app-only. [firm]
- **Measurement:** baseline exists (production 24x3 battery). Success metrics:
  tap-through rate on chips, time-to-first-product, turn latency, canvas-fill
  rate; guardrail: reply-length and relevancy hold. [firm]
- **Pre-mortem:** likely failure causes: (a) chips feel like a search page inside
  chat → concierge identity lost; (b) filter desync shows out-of-stock tiles;
  (c) model picks noisy facets on long-tail queries. Early warnings: tap-through
  below baseline, stock complaints, noisy-chip screenshots in battery.
- **Deliverables/v1:** chips UI + model field + proxy + tool removal + battery.
  Out of v1: multi-select, counts, personalization. [firm]
- **Execution/stop:** if chips+preview loses to chips-only or baseline in
  battery, keep current pipeline and do only the prompt sanitization. Kill
  criterion named before build. [firm]

## Surviving objections (design must answer by name)
1. Single vs multi select on chips (UX decision, unmeasured).
2. arrange_groups removal blast radius (readers sweep required).
3. Model facet-pick reliability across the long tail (battery measures).

## Assumptions still unverified
- Client can read facet counts from the streamed tool output (else: site client).
- Model reliably picks 1–3 display attributes across the long tail (test in battery).
- Tap-through behavior on real shoppers (measure, don't assume).

## Converger intake
- Purpose: simplify concierge display to catalog truth; delete custom grouping.
- Audience: JTV shoppers (60% mobile).
- Constraints: agent tool-sheet changes gated on Arijit; live index read-only;
  battery before production; behavior-bar voice rules hold.
- Definition of done: battery shows ≥ baseline on relevancy/latency with chips
  tap-through measured; readers sweep clean; Arijit approves promotion.
- Objections to beat: the four surviving objections above.
- Recommended converger: brainstorming (spec the v1) → writing-plans.

## Plan intake
Milestones: (1) spike: client facet-count access + proxy filter parity;
(2) chips UI behind flag + model field on Dev; (3) tool removal + readers sweep;
(4) battery before/after + tap-through; (5) Arijit promotion call.
Parallel: prompt sanitization folds into (2). Tripwires: stock/budget mismatch
in any battery row stops the build.
