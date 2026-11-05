# Agent lane fix 4: voice restored — draft for Arijit's review

2026-11-04, REBASED. Base: the LIVE agent text as of 2026-11-04 (39,438
bytes, sha256 head e4498172b421, byte-identical on dev 8129ad66 and prod
d466b4a6). An earlier draft was built on the 2026-11-03 snapshot (33,871
bytes) and was scrapped when the pre-flight found both agents updated the
same day (prod 16:21Z, dev 17:37Z): another lane had landed a narration,
education, on-air and display-shaping pass on both agents. This draft is
applied ON TOP of that pass, and per the consolidation law it merges the
pass's "Never narrate the work" section with the old "While you work"
section (which it duplicated) into one "# What you never say".

Nothing in this folder has been applied to any agent. Dev apply happens only
after Arijit approves the draft, then the full battery, then promotion on his
go.

## Files

- `DRAFT-instructions.md`: the complete replacement instructions text.
- The systemPrompt (9,064 bytes) changes in exactly one place: Scenario 3's
  em dash ("correct it — the exact facet value") becomes parenthesized, per
  the no-em-dash rule. Everything else in the systemPrompt is mechanics and
  stands.

## What changed and why

### 1. "Format" + "While you work" → "Format" + "What you never say"

The defect Arijit named on 2026-11-04 ("the north pole and south pole
opposite of a concierge"): on a browse turn the old contract left zero legal
warm sentences. Generic openers banned, promises discarded the whole reply,
process talk banned, pieces/prices/options banned, questions restricted, a
three-sentence ceiling, and "cut words" — the model resolved the squeeze with
one safe result-report line. The rewrite:

- The narration ban is stated once, positively: "write as if the work is
  already done". It stays the only hard ban.
- The reply-discarding threat ("your whole reply discarded... system notice
  instead") is gone from the instructions. INSTRUCTION-SIDE ONLY — the agent's
  streaming guardrail may still discard replies containing promise sentences
  (measured trips on "planning sentences", 2026-10-20). Tuning the guardrail
  is Arijit's separate call; if it stays as is, thin replies can still happen
  and the instruction rewrite alone will not fix them. FLAGGED, NOT DECIDED.
- The closing call to action becomes a duty on every shelf-or-answer turn,
  with two concrete closing shapes supplied. This restores the Oct 21 bar
  ("every reply ends with a next action") that the battery-tuned prompt had
  dropped.
- The three-sentence shape stays, framed as shape, with "crisp is the
  ceiling, never an excuse for a reply with no person in it".

### 2. New row in Deciding each turn: style/occasion/feeling briefs

The "elegant and timeless pieces" defect (2026-11-04): the agent folded an
open style brief into one product type (earrings only). New rule: a brief that
names a style, occasion or feeling is a whole-catalog brief; the first cut
crosses product types; a type is named only when the shopper named one.

### 3. New section: the follow-up questions the panel offers

The text suggestions under a reply are model output (they ride the stream's
`data-suggestions` part). Measured defect: stale suggestions from the previous
turn rendered under a new turn's reply. New rule: each suggestion is a next
step from this turn's answer; never a topic the conversation has left, never
one the reply or the display already answers.

### 4. Opened the human-moment duty to every turn (lighter)

"Respond to the person first" previously fired only on gift/milestone
requests. The Role now carries a lighter clause: every opening line reacts to
what this shopper said before it serves the catalog.

## Dedup ledger (consolidation law)

| Rule | Was | Now |
|---|---|---|
| Narration/process bans | 7 overlapping bullets in "While you work" + a display paragraph | One section, 4 bullets, positive framing + 3 examples |
| Count bans (exact, facet, computed) | 3 places (While-you-work, Deciding, Evidence) | 1 place (Deciding breadth paragraph) |
| Promise-of-action ban | 3 bullets + discard threat | 1 bullet inside the narration section |
| "Search is not inventory" | Respond-to-person + Failures | Kept in both deliberately: one is identity, one is failure wording (near-duplicate, agreed) |
| Breadth honesty | Deciding paragraph + Example 1 | Kept in both deliberately (rule + worked example) |
| "Say one thing per turn" | 2 bullets | 1 bullet (the speak-before-tool rule) |

## What this draft does NOT do

- No tool changes. The narrowing-axis channel is a separate finding: the
  native `algolia_grouped_results` tool input carries only `groups` + `intro`
  (captured live 2026-11-04, `sse-grouped-input-2026-11-04.txt` in the funnel
  run folder), so the model's instructed facet pick (Curating the display)
  has nowhere to land, and the app falls back to its own ranking. Arijit
  chose model-picked axes (option a); delivering it needs either a custom
  display tool (carrying `displayFacets`, as `present_products` did) or an
  Agent Studio platform change. That is an architecture decision for Arijit,
  not part of this prompt draft.
- No guardrail change (flagged above).
- No app changes (the funnel branch ships separately).

## Rollout (after Arijit approves)

1. Verify dev and prod instructions are still byte-identical (c816c21 claim,
   2026-11-04); read the live configs before writing anything.
2. Apply to the DEV agent only, via the programmatic save path
   (PATCH + admin key, `NODE_USE_SYSTEM_CA=1`); readback byte-verify.
3. Full battery (35×3×3, fresh literals, no completion-cache reuse), graded
   against the Oct 21 bar plus this draft's three new rules. Arijit
   spot-checks experience; Claude verifies logic.
4. Fix, re-run, then promote to prod via `promote-agent.mjs` on his go.
5. Byte-verify the promoted readback against this draft.

## Byte budget

Draft prompt body = 39,726 bytes vs the live 39,438 (+288 bytes net on the
rebased base: the style-brief table row, the suggestions section and the
closing-action duty added ≈ 2.4KB, offset by merging the duplicated
narration sections ≈ 2.1KB). All five em dashes the base carried in rules
and examples are fixed in the draft (agent-output ban).
