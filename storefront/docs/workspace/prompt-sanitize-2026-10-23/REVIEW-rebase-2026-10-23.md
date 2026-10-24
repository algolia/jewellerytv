# Prompt review, rebased on live text — 2026-10-23 (evening)

Reviewer: Claude (Prompter worktree), full end-to-end read of both live files.

Baseline for this review (read live from Agent Studio this session):
- Dev agent 8129ad66 and Production agent: **identical** instructions sha
  `28b97166` (35,929 chars) and systemPrompt sha `d90b149d` (9,278 chars).
  Dev updated 14:57 UTC, Production 15:18 UTC today. The INVENTORY.md in this
  folder was baselined five hours earlier at f8e3d146 / 32,631 chars, so
  ~3,300 chars of round-5e additions landed after it. This review verifies its
  verdicts against the current text and adds what it could not have seen.

## A. Arijit's structural observation — confirmed

The prompt carries three coexisting formats:

1. **House format** (Do / Don't / Why / Example good / Example bad): the
   "How you talk" subsections and Worked examples.
2. **Dense prose paragraphs**: Deciding each turn, Continuity and
   requirements, Evidence and sources, Showing products, Comparing, Service,
   Money, When something fails. These read like compressed memos; several are
   single paragraphs of 150+ words carrying 5+ rules each.
3. **Scenario format** (Do / Do not): systemPrompt Tool scenarios.

Same rule, three encodings, depending on which section a round touched last.
This is the "structured in two different ways" feeling, and it is also why
rounds kept appending: each new rule got bolted into whichever format the
editing lane was working in, instead of the section that owns the concern.

## B. Verified duplication map (live text, by rule)

| Rule | Sites today | Owner it should live in |
|---|---|---|
| Bold only direction names + closing CTA | 6: Format, Showing directions example, Worked examples 1, 2, 3, 4, 9 ("bolding the direction names and the call to action" repeated verbatim per example) | Format, once |
| Never repeat tile facts in prose | 4: Format, Showing directions, Showing products, Worked example 1 | Showing directions, once |
| Never quote counts / facet counts | 2 heavy: While-you-work Don't bullet, Deciding each turn paragraph (plus facet-count variant in While you work) | Deciding each turn (breadth honesty), once |
| Announce/narration discipline | 5+: While-you-work block (one 130-word bullet), two pearl examples in the same section (the "Let me see what's available" bad example appears twice), Close, Worked example 8 | While you work, once |
| Budget mechanics (strict/inclusive/bands) | systemPrompt Budget (owner) + instructions Money partial + Scenario 1 | systemPrompt Budget; instructions keeps one shopper-facing sentence |
| Short-group / surplus handling | systemPrompt Turn pipeline + instructions Showing products + Scenario 3 | systemPrompt Turn pipeline; instructions keeps the shopper-facing "say what the catalog lacks" half |
| Re-show rule ("first six again") | 2: systemPrompt Display AND Scenario 5 (near-verbatim) | Display. Scenario 5 dies. |
| Never claim success without structured result | 4 sites in systemPrompt (verified by grep): Completion and failures explicit, plus its final-publication variant, Display ("never claim a display succeeded from your own prose"), Tab actions ("without its structured result"). Turn pipeline carries none on the live text — the sanitize lane's candidate draft has it there, the deployed text does not. | Turn pipeline, once. Section-specific one-liners only where the failure mode differs. |
| Aborted turn keeps previous display | 2: Display, Completion and failures | Display |
| Requirements vs preferences strength | Continuity (owner, full paragraph) + Showing products candidate-check restatement | Continuity; Showing products keeps only the candidate-check action |
| Direction-line format (one line, price range, example) | 2: Format bullet rule, Showing directions | Showing directions (it is about directions, not formatting) |

## C. Tensions and near-contradictions found on the read

1. **Format says "everywhere else, stay in flowing paragraphs"; Service and
   policy answers mandates bold labels + numbered lists.** Scoped, but a
   model can read them as competing format authorities. Service should carry
   one clause: "this structure applies to service answers only."
2. **Format mandates the bulleted browse list; Showing products says describe
   directions "without bold group headings".** Consistent when read carefully
   (system group headings vs direction-name bullets) but two rounds' wording
   circling the same display. One paragraph should own the relationship:
   bullets name directions, tiles carry pieces, group headings are the
   system's and are never quoted.
3. **Deciding each turn opens with "nothing else in this prompt overrides
   these bullets", while Format's canvas rule and While-you-work rules also
   claim binding scope.** Two "this wins" clauses. One authority order
   (shopper safety > turn pipeline > talk rules) replaces all of them.
4. **While-you-work has become a rule dump.** Five rounds bolted rules onto
   two bullets that now run 130+ words each. The rules are right; the
   placement and density are wrong. This is where the +3,300 chars since the
   inventory mostly went.

## D. What the sanitize lane's INVENTORY got right (verified still true)

All seven duplication collapses in its map hold against the live text. Its
section verdicts (Deciding = worst offender, merge Close into Showing
directions, split Continuity into three named rules, split claim honesty by
owner between the two files, trim examples 10 → 7, kill Scenario 5) all
verify. Its systemPrompt.candidate.md draft matches this review's direction
for the systemPrompt side.

## E. What changed since the inventory that the rewrite must absorb

Round-5e additions (all now live in both agents): one-question-mark test,
no-second-acknowledgment, segment rule (one line between tools), facet-count
suppression, first-sentence tightening. Verdict: keep every rule; they target
measured failures. Re-home them: announcement/narration rules into While you
work (rewritten into short bullets), count suppression into Deciding's
breadth paragraph, one-question test stays in Close. Net: no rule lost, no
rule added, ~1,000 chars of pure restatement removed.

## F. Proposed target structure (single owner per concern)

Instructions (~35.9k → target 23–26k):
1. Role — keep
2. How you talk: Voice / Respond to the person first / Vocabulary / Format /
   While you work / Showing directions (absorbs Close) — house format,
   rewritten in place, no new rules
3. Deciding each turn — collapse to the decision table (one line per shopper
   situation) + the breadth-honesty paragraph (sole count-rules owner)
4. Continuity and requirements — split into three named rules (carry-forward,
   strength, vocabulary mapping), prose → house bullets
5. Evidence and sources — shopper-facing claim honesty only
6. Showing products — keep the candidate-check and stock-disclosure halves,
   drop restatements of Deciding and Turn pipeline
7. Comparing / Service / Money / When something fails — reformat to house
   bullets, tighten, single 9-line sentence broken up
8. Worked examples — 10 → 7 (merge 2+7, cut 4; strip the per-example bold
   restatements)

SystemPrompt (9.3k → target ~7.5k):
- Authority, Tools, Turn pipeline, Budget, Filters, Refresh, Session state — keep
- Display — absorbs re-show; Scenario 5 dies
- Completion and failures — merges into Turn pipeline + Display; keeps only
  the guardrail-can-replace-content rule
- Source and claim rules — source-to-claim contract only (image-blindness
  stays here)
- Tab actions — tool contract only
- Tool scenarios — 5 → 4

Tool sheets: keep; one purity-trap clause on the catalog search sheet (the
inventory's item, still absent live).

## G. Process commitments for every future prompt edit

1. Whole-file read before any edit (consolidation law, already standing).
2. Every rule has exactly one owner section; a new measured failure edits its
   owner in place or creates a named rule there — never a new paragraph or
   bullet elsewhere.
3. No rule may be restated in an example; examples show the owner section's
   rule, they do not re-specify it.
4. Size is a check: an edit that grows the file by more than it must is
   suspect before it is even evaluated.
5. Sequencing unchanged: rewrite on Dev → hash-verify → battery before/after →
   Arijit's promotion call. No writes until Arijit approves this review.

## H. Estimated outcome

Instructions 35,929 → ~24,000 chars (−33%), systemPrompt 9,278 → ~7,600
(−18%), zero rules lost, zero new rules beyond the inventory's four measured
additions and the proposed image-blindness rule (shown to Arijit before
apply, per the four-failure report). Estimates, not promises — the rewrite
counts as done only when the battery holds and the diff shows deletion
exceeding addition.
