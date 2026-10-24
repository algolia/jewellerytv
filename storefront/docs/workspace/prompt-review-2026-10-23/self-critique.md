# Self-critique of draft D1 — graded before showing

Graded per the caliber standard: zoom in, list defects. Severity: HIGH / MED / LOW.

1. HIGH — Untested. D1 is a text consolidation. Nothing here proves behavior held or improved. The two-leg battery (current Dev vs D1, 35-question pool or the 24x3 runner) is the gate before any apply. Until then this is a candidate, not a better prompt. Mitigation: battery planned post-approval, per Arijit's confirmation.

2. HIGH — The three-moves resolution is a bet, not a measurement. C1 resolved the contradiction toward chips-era shape because the app now renders directions as facets. If facet chips fail to render on some turn types (multi-scope turns render grouped tiles per the facet-chips memory), a browse reply that relies on chips may leave the shopper with prose that names nothing. The single-scope guard covers displayFacets, but the three-moves text rule has no such guard. Mitigation: the battery includes multi-scope turns; watch for "reply names nothing, chips absent" failures.

3. MED — Prod-borrowed sections were not re-derived. "Close with a next step", the variant rule, and Bella Luce text are prod's wording, tested in prod's context (different surrounding rules). In D1 they sit next to dev's three-moves Format. Interactions unverified. Specifically: prod's close example "Which of those three feels closest" (not borrowed) coexisted with prod's bulleted-directions shape; D1 pairs the close rules with the three-moves shape. Coherence is plausible but not proven.

4. MED — The system-prompt disambiguation (D1-sys) changes a boundary. The old wording arguably permitted naming any displayed piece in prose; the new wording restricts naming to conversation-central pieces. If any current app surface (e.g., compare announcements) relies on naming a displayed piece outside the five listed contexts, D1-sys breaks it. Mitigation: Arijit confirms reading (a); battery covers compare/save turns.

5. MED — displayFacets restoration is verbatim dev text, but the feature is young (single-scope guard learned from one gold-hoops catch). If the guard itself is wrong or incomplete, D1 inherits the error. No independent verification was possible in this session.

6. LOW — C1's changelog contains fabricated evidence ("Timeless pick" text that exists nowhere; false claim that dev "had added" the Close section). The C1 prompt text itself checks clean against its base, but this is a trust flag for that lane's documentation. My review documents it rather than propagating it.

7. LOW — Size barely moved. D1 instructions ≈ 5,100 words vs base 5,168. Arijit said size is a byproduct, so this is honest — but if he expected visibly smaller, the remaining levers (tool-description migration, example diet, dense-middle compression) all need eval cover and are logged, not applied.

8. LOW — "Why:" coverage is uneven by design: kept where present, not added where absent. A stricter reading of the research would add reasons to Continuity/Evidence. Deferred as a size trade; could regress nuance if written without failure evidence.

9. LOW — This review read the prompts, hashes, prod, C1 and research but did not read the app's current rendering code to confirm the chips-era claims in F1/F3. Claims about app behavior rest on memory + the prompt's own statements. If the tiles/chips pipeline changed since the facet-chips session, the three-moves resolution could target a stale app shape.
