# Validate report — docs rebuild (light path layers)

**Layer 1, static analysis:** integrity check (`check-docs.mjs`) — every internal
href/src resolves, every same-page and cross-page anchor exists, verbatim appendix
blocks byte-identical to the live agent extracts (system prompt 9,104 chars,
instructions 28,393 chars). ALL CLEAN.

**Layer 2, unit-equivalent:** the integrity check doubles as the regression test for a
static docs site (rerun gate before any future docs change).

**Layer 8, SOP/brand compliance:** Algolia brand-check gate run against the 2026 Xenon
brand core. Fixes applied: primary `#003DFF` (retired Nebula) → Xenon `#0067F7` in CSS
and diagram; typeface system stack → Sora 300/400/600 + JetBrains Mono via Google Fonts;
font weights 650/700 → 600; "Algolia Agent Studio" → "Agent Studio" per product-naming
rule ("Algolia's Agent Studio" on first mention); two `<em>` italics removed. Accepted
exception: em dashes inside verbatim appendix blocks are faithful captures of the live
configuration text, not authored prose. **Verdict: PASS (9/10).**

**Browser verification (desktop 1440):** all 7 pages HTTP 200, correct h1 and
aria-current nav, all images load, stylesheet applied, zero console/page errors.
**Phone width 375:** no horizontal overflow on any page (examples table wrapper fixed a
10px overflow found on first pass). Screenshots: `walk-*.png` in this folder.

**Layers skipped and why:** 3 (integration) and 4 (contract) — static docs site, no
backend consumers of its own; 5 (E2E) — the browser walkthrough above is the E2E for a
content site; 6 (performance) — no perf-sensitive path; 7 (security regression) — no new
attack surface (intake STRIDE line: static public content, no inputs, no secrets).

**Paid-turn budget note:** five production Concierge turns were spent capturing the real
screenshots (welcome, shopping turn, chip refinement); receipts in shoot*-receipts.json.

**Live finding (not docs scope):** one capture run caught the production agent streaming
internal tool-reasoning text mid-turn before completion; flagged to Arijit separately.

## Post-deploy defect (reported by Arijit, fixed same hour)

**Symptom:** /docs chapter rendered unstyled with broken images. **Root cause:**
`/docs` (no trailing slash) serves the HTML without redirecting, so relative URLs
(`./docs.css`, `./assets/…`) resolved against the site root and 404'd. My verification
had only ever entered via `/docs/…` file paths — the no-slash directory entry was
untested. **Class fix:** every internal URL is now root-relative (`/docs/…`) and
`check-docs.mjs` rejects relative internal URLs, so the class cannot regress.
Committed 0b49ab5, deployed dpl_Gh1sU1Wi8yap34wJug6rvYLpBJtB, promoted. **Verified
live on the exact broken path:** entry `/docs` (no slash) now renders styled with all
images, as do all seven file-path entries; zero 4xx/5xx. Lesson: directory-style
entries may serve without normalization — always test the no-slash entry and prefer
root-relative URLs in static sites.
