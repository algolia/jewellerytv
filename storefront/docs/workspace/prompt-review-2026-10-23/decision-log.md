# Decision log — rule-by-rule accounting

Live Dev base: instructions 09449b31 (17 headings), systemPrompt 39f9d09f (11 sections).
Draft D1 = C1 (Prompt-Review) + displayFacets restoration. Draft D1-sys = live system prompt + one disambiguation.
Every base rule accounted for below. C = kept as-is, M = merged/moved, X = cut (behavior relocated to named home), P = prod text borrowed in, R = restored by this session, D = changed by this session.

## Instructions

| Base location (09449b31) | Rule(s) | Disposition |
|---|---|---|
| Role p1–3 | identity, tone, first-person, ownership | C (Role p2 gains purpose+autonomy hoisted from Deciding — M) |
| Voice | friend-not-salesperson, contractions, examples-teach, Why, 2 examples | C |
| Respond to the person first | 4 Do/2 Don't, Why, 2 examples | C |
| Vocabulary | plain language, no internal words, Why, 2 examples | C |
| Format b1–2 | short sentences/paragraphs; three-moves browse | C |
| Format b3 + Showing directions Why + Showing products line 1 | display-tool mandate, tiles carry names/prices | M — single home in Format b3; "why" once in Showing directions |
| Format b4–6 | bold CTA only, no report styling, no em dashes | C |
| Format b7–8 + While-you-work mega-bullet tail | reread-and-cut, no padding, first-cut-together framing | C |
| Format good/verbose examples | two shape examples | C |
| While you work b1–4 | opener with topic, one progress line, answer once, silent fixes | C (split into 8 bullets) |
| While you work b5–8 | no future-tense promises, no narration, no counts (moved), no internals | M — counts Don't moved to Showing directions; rest C |
| While you work examples | pearl flow, double-yes, stacked announcements, generic filler, jargon-check | C (stacked merged into one example line) |
| While you work bridge line | question + first-cut bridge | C |
| Showing directions b1 | distinctions/trade-offs, words carry what display cannot | C (+ out-of-stock example clause from C1's rewrite) |
| Showing directions b2 | judge request as given, mother's-ring, absent-reading clause | C |
| Showing directions b3 | add depth | C (+ education clause) |
| Showing directions b4 | one clear next step / one question per reply / one-question-mark test | M — moved to new "Close with a next step" section (P: prod structure, same rules dev carried inline) |
| Showing directions b5 | no piece-by-piece listing, advice-not-a-next-step | M — split between Showing directions Don't and Close Don'ts |
| Showing directions example | cross-necklace | D by C1 — rewritten to three-moves shape (direction-naming line and "$50" removed); matches Format |
| Deciding each turn | purpose + autonomy (hoisted to Role), "complete rule" claim + 10-row table | C (3 rows absorb cut-example content: vague-taste readings, two-meaning stuck routes, thin-result out-of-stock) |
| Deciding breadth para + counts examples | honest breadth, no exact counts, no computing | C (single home for counts rule) |
| Deciding spread para | spread across differences, variant dedup, budget ceiling line | P+M — variant-dedup rule + huggie examples borrowed from prod 144–146 (matches Arijit's option-B model-rule decision); budget-ceiling line C |
| Deciding follow-up para | follow-ups add something, chat mode, close briefly, task-change | C |
| Continuity p1 | carry facts, tentative stays tentative, never drop a requirement, preference-vs-requirement set-aside | C |
| Continuity p2 | scope, taste-clue, single-focus, wording-sets-strength, correction-exactly-one, no cross-visit memory | C (C1 added scope-matters opener + "do not imply a correction applied" clause — M) |
| Continuity p3 | vocabulary mapping, exclusions, AND/OR, wearability, main-stone filter, white-gold/silver, unknowns, descriptive-style, no memory values | C |
| Evidence p1 | retrieval-only, no model memory, no invented composition | C ("never quote catalog values from memory" folded here — M) |
| Evidence p2 | lack-claim needs failed search, no order/account claims, cross-source proof limits | C |
| Evidence p3 | all/every/both, bounded sample, no popularity, no gender relevance, stone identities | C |
| Evidence p4 (C1) | Bella Luce examples | P — borrowed from prod 170 (C1 addition, kept; provenance verified) |
| Showing products line 1 | brand = browse | C |
| Showing products b1 (displayFacets) | selection, skips, omit-when-no-split, single-scope guard | R — C1 dropped it; this session restored verbatim minus ordering semantics (those live once in system prompt Display) |
| Showing products b2–9 | three directions, thin fallbacks, dropped pieces, requirement change, single focus, candidate checks, gift quality, stock reporting | C |
| Comparing p1–3 | compare/save/complete-look rules, tab actions, anchor rules, refresh-before-price | C |
| Service p1–2 | scan structure, all material rules, no invented mechanics | C |
| Money p1–2 | USD, ceiling-not-target, installments, FX, round estimates, weight/size, no checkout claims | C |
| When something fails | failure=fact, no canned recovery, specific gap, never present unrelated as match, natural end | C |
| Worked examples 1,4,5,6 (broad category, vague taste, thin result, silent fix) | 4 examples | X — content verified absorbed: table rows 1/7/9, While-you-work rules, When-something-fails (checked line by line) |
| Worked examples 2,3,7,8 (kept) | celebration+budget, personal gift, education, service | C (renumbered 1–4) |

## System prompt (39f9d09f → D1-sys)

| Base section | Disposition |
|---|---|
| Authority | C |
| Tools | C |
| Turn pipeline (order, one-search-per-direction, surplus, choose-by-need, no unverified claims) | C |
| Budget (band filters, inclusivity flags) | C — mechanics, correct home |
| Filters and vocabulary | C |
| Display p1: tiles-only-after-call, no pointing at absent tiles, one-piece link rule, no objectIDs, workspace-on-completion | D — link rule disambiguated: browse replies name no displayed piece; link allowed only for a piece the conversation is about (saved/settled/refreshed/compared/asked-by-name). Flagged for Arijit to confirm reading (a) |
| Display p2: displayFacets render semantics, reuse objectIDs | C — sole home for ordering semantics |
| Refreshing a piece | C |
| Tab actions | C |
| Source and claim rules p1–3 | C — contract layer; overlap with instructions "Evidence and sources" is a real split (what a source can prove vs how to phrase); deeper merge deferred, needs eval cover |
| Session state p1–2 | C |
| Tool scenarios 1–4 | C — scenario 4 becomes sole silent-fix teaching home after Example 6 cut |

## Counts
- Instructions base rules: all accounted (C/M/X/P/R per table above; no rule left without a home).
- System prompt sections: 11/11 accounted; 1 changed, 10 kept.
- Net behavior changes vs dev 09449b31: three-moves contradiction resolved (C1); variant-dedup + prod Close-Don'ts + Bella Luce borrowed from prod (C1, provenance verified); displayFacets restored (this session); system-prompt naming disambiguated (this session, pending Arijit confirm).
