# Full-prompt sanitization inventory — 2026-10-23

Scope: dev agent 8129ad66, both prompt files and the tool sheets. Baseline
hashes (2026-10-23 05:40 UTC, after the conciseness lane's round 3):
instructions f8e3d146 (32,631 chars), systemPrompt 9103c92e (10,816 chars,
byte-identical to this lane's two-phase apply). Arijit GO: rewrite end to end
in the house format (Do / Don't / Why / Example good / Example bad), collapse
subcategories, absorb parallel-thread fixes, then battery before/after; data
decides. Production promotion is a separate gate after the battery, on
Arijit's end-of-night call.

## Parallel-lane reconciliation (2026-10-23, mandatory input)

The conciseness lane (docs/workspace/conciseness-2026-10-22/) applied three
instruction rounds to the dev agent, the last at 05:31 UTC, minutes before
this inventory was rebased. Their edits are IN this baseline and the rewrite
must preserve them: the reread-your-reply test block, the narration rules
(A1-A3: between tool steps speak only when the shopper waits; never pre-announce
results), the tightened breadth sentence, and the Showing-directions example
rework. Their pending Edit B ("Never announce what you are about to show; show
it.") folds into the rewrite's While-you-work section. Verified surviving from
this lane: the two-phase systemPrompt (byte-exact), the aim-discipline bullet,
the purity note, the shortfall regroup scenario. Production (0bdf59fe) still
runs b54ffc95 / d90b149d — untouched by both lanes today except a 03:48 UTC
touch; it does NOT have the two-phase pipeline or conciseness rounds yet.

Coordination record: the AGENT-LOCK.txt mechanism proved stale (2-day-old
entries vs 30-second-old applies) and is retired for this purpose; live-hash
reads + mtime scans + lane docs are the input to every apply from here
(memory jtv-agent-config-coordination-live).

## Section inventory and verdicts

### Agent instructions (30,838 chars, 16 sections)

| # | Section | Verdict |
|---|---------|---------|
| 1 | Role | DONE (sanitized). Keep; absorb nothing new. |
| 2 | How you talk > Voice | DONE. Keep. |
| 3 | How you talk > Respond to the person first | DONE. Keep. |
| 4 | How you talk > Vocabulary | REWRITE in house format. Merge "internal words" list; move the "never quote catalog values from memory" rule here (currently buried in Continuity §11, wrong home). |
| 5 | How you talk > Format | REWRITE. Merge the verbosity example pair (repeated verbatim twice in the file today) into one. Bold-CTA rule stays here alone; Showing directions and Close stop restating it. |
| 6 | How you talk > While you work | REWRITE. Add the binding turn-completion rule from the emerald-battery failure: never end a turn between search and arrange; the answer follows the last tool result, never a future-tense promise of work not yet done (measured: 2026-10-23 turn 2, 0 tiles, no notice). |
| 7 | How you talk > Showing directions | REFORMAT only; content is sound. Drop the duplicated bold rule and the duplicated example pair (identical examples live in Format). |
| 8 | How you talk > Close with a next step | MERGE into Showing directions as one closing bullet + one example. A two-bullet section is not a section. |
| 9 | Deciding each turn | REWRITE (worst offender). 10 bullets restate what Showing products and Worked examples 1-8 also say. Becomes the single decision table: one line per shopper situation, one route. Scenario detail lives once, here or in examples, not three times. |
| 10 | Continuity and requirements | REWRITE. Four dense paragraphs carry three ideas: carry state forward; preference vs requirement strength; translate words to catalog vocabulary. Split into those three named rules; move the vocabulary-mapping paragraph to Vocabulary §4. |
| 11 | Evidence and sources | REWRITE. De-duplicate against systemPrompt "Source and claim rules": this file owns shopper-facing claim honesty (no memory claims, no all/every, no popularity claims, stone identities); systemPrompt owns the source-to-tool contract. Today both restate each other. |
| 12 | Showing products | REWRITE. Absorbs today's aim-discipline bullet (two-phase). Collapse its 9 bullets: group into (a) directions, (b) requirements checks, (c) stock and disclosure. Remove rules that duplicate Deciding each turn routes. |
| 13 | Comparing, saving and complete looks | REFORMAT. Content sound; the tab-action sentences duplicate systemPrompt "Tab actions" — keep the conversational half here, the tool-contract half there, no overlap. |
| 14 | Service and policy answers | REFORMAT. Sound; tighten the single 9-line sentence into the house bullet format. |
| 15 | Money, fit and purchase boundaries | REWRITE. The budget ceiling mechanics duplicate systemPrompt Budget (inclusive/strict wording appears twice). This file keeps shopper-facing money honesty; the filter mechanics live only in systemPrompt Budget. |
| 16 | Worked examples | TRIM 10 to 7. Cut examples 2 and 7 (budget) into one; cut example 4 (two meanings) — its route is one line in the decision table now. Each remaining example keeps Do / Do not / If stuck. No example may restate a rule that survives in a section. |

### System prompt (10,816 chars, 12 sections)

| # | Section | Verdict |
|---|---------|---------|
| 1 | Authority | KEEP as-is. Two sentences, correct. |
| 2 | Tools | KEEP; add one line naming the search tool's facet-count output as discovery evidence (today's addition, already in Turn pipeline — no duplication). |
| 3 | Turn pipeline | DONE today (discover → aim → arrange → write, honest surplus). Keep; re-check wording against §6 collapse. |
| 4 | Budget | KEEP. Absorb nothing; it is the single owner of band/ceiling/floor mechanics. Trim the band example repetition. |
| 5 | Filters and vocabulary | DONE today (purity note). Keep; merge the blog/help search sentences into one bullet. |
| 6 | Display | REWRITE. Repeats pipeline and tool-sheet content (tiles only after arrange, same order, aborted turn keeps previous). Becomes 3 bullets. Absorbs the "show me the first six again" rule from Scenario 5, which then dies. |
| 7 | Refreshing a piece | KEEP as-is. |
| 8 | Tab actions | TRIM. Keep the tool contract; the conversational guidance moved to instructions §13. |
| 9 | Source and claim rules | REWRITE. Becomes the source-to-claim contract only (which source proves which claim, URL rules, image-blindness rule). Shopper-facing claim honesty lives in instructions §11 — name the split explicitly so future edits do not re-merge them. |
| 10 | Session state | KEEP. Dense but load-bearing; only format cleanup. |
| 11 | Completion and failures | MERGE into Turn pipeline + Display. Its two real rules (never claim success without structured result; guardrail can replace content) already exist there; the rest repeats Authority. |
| 12 | Tool scenarios | TRIM 5 to 3. Scenario 5 dies (merged into Display). Scenarios 1 and 4 stay; Scenario 2 stays (refresh identity). Scenario 3 (shortfall) already rewritten today — keep. |

### Tool sheets

| Tool | Verdict |
|------|---------|
| algolia_search_index (prod_catalog) | KEEP. Description rewritten in the Lane 1 era, correct today. Add one purity-trap clause (material name vs purity) — 1 sentence, budget: 1024-char cap is comfortable. |
| algolia_search_index (blog, help_content) | KEEP as-is. |
| arrange_groups | DONE today (honest surplus, 191 chars, 200-char platform cap). Keep. |
| refresh_products | KEEP as-is. |

## Duplication map (what the collapse removes)

1. Bold-CTA rule: 4 sites (Format, Showing directions, Close, worked examples 1/3/4) → 1 (Format).
2. First-cut breadth honesty: 3 sites (Deciding each turn, Showing products, examples 1/6) → 1 decision-table line + 1 example.
3. Budget mechanics: 3 sites (instructions Money, systemPrompt Budget, arrange sheet) → systemPrompt Budget (owner) + one shopper sentence in instructions.
4. Claim-source honesty: 2 sites (instructions Evidence, systemPrompt Source rules) → split by owner, no overlap.
5. Re-show rule: 2 sites (systemPrompt Display, Scenario 5) → Display.
6. Verbosity example pair: 2 verbatim copies in instructions → 1.
7. Tab-action guidance: 2 sites → conversational in instructions, tool contract in systemPrompt.

## New rules this rewrite adds (from measured failures)

- Turn completion binding: never end a turn between search and arrange; never
  answer with future-tense work (emerald battery row, 2026-10-23).
- Aim discipline: directions from facet counts, one aimed search per direction
  (two-phase, measured 2026-10-23).
- Purity trap: material name separates solid from plated gold (measured).
- Honest surplus: report, model regroups, never tool-reallocates (measured).
- Image-blindness honesty (PROPOSED, from the four-failure report): the
  concierge cannot see photos; when a shopper describes appearance, ground in
  record fields, say what the catalog calls it, never claim to see or deny
  colors. Wording shown to Arijit before apply.

## Sequencing with parallel threads

- Lock claimed on AGENT-LOCK.txt for dev agent 8129ad66 config writes.
- Other lanes are idle (last lock entries 2026-10-21; no runner active).
- The rewrite absorbs: two-phase edits (this lane, applied today), turn-recovery
  and tiles-on-withhold (app code, not prompt — no conflict), guardrail
  wording (last touched by guardrail-ab lane 2026-10-22, categories unchanged
  by this rewrite; their ON-baseline remains).
- Baseline battery for before/after: the 5-turn measured set from today
  (4/5 full canvases, median 29.3s) plus the standing starter-question pool.

## Test plan (after apply)

1. Hash-verified PATCH + read-back (same proof shape as today).
2. The same 5 fresh literals from today's battery + 3 new (emerald-budget
   retry with fresh wording, opal, gift) — 8 turns minimum.
3. Compare: tiles per turn, latency median, stop-short count, notice count.
4. Data decides; report to Arijit; production promotion is his end-of-night
   call after the battery, via promote-agent.mjs.
