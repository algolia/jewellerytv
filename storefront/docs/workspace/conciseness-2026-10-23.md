# Concierge instruction conciseness program — status 2026-10-23

Portable summary of the conciseness work checked in on 2026-10-23. Raw working files, probe
outputs and screenshots live in the local-only workspace `docs/workspace/conciseness-2026-10-22/`
(git-ignored by the application-only policy); this page is the tracked handoff.

## What changed and where

The Concierge agent's `instructions` text only. No application code, no index configuration,
no systemPrompt, no tools changed. Changes were applied programmatically (single PATCH per
round, hash-verified readback) to the dev agent `8129ad66-170b-4bb5-926a-c81d2cb38f22`.
Production (`0bdf59fe-e598-4db7-b139-2b93d5255bb4`) still runs the pre-change instructions
`b54ffc95` at the time of this writing.

| Round | Dev instructions sha | Content |
|---|---|---|
| 0 (baseline 2026-10-22) | `b54ffc95` | grammar fix, unchanged behavior |
| 1 | `0ac7bd2e` | short-sentence format line, reread test with verbose/good example pair, "what you left out" narrowed to when it would mislead, breadth compressed to one sentence, bulleted example replaced with warm prose |
| 2 | `ad08b243` (applied 2026-10-23 04:53 UTC, overwritten at 05:10) | topic-specific acknowledgement (no generic filler opener), the pearl flow as the worked example, Don't covers announcing results the reply will present, test clause: every sentence helps the shopper choose, reacts, or moves forward |

## Final state 2026-10-23: promoted and aligned

Rounds 3-5e continued after this page's earlier sections. Round 5 hardened the post-search
rule (first sentence names pieces, prices or directions; never found/picked/assembled/categorized),
capped the absence claim at one sentence inside the findings, set one question mark per reply,
taught the continue-don't-reopen seam with a worked example pair, and killed the exact-count
leaks with a worked count example. The tool fixes (hard-bounds arrange description, all eight
`exposed` search controls reverted) went with it.

At 07:02 UTC the state was promoted to production with `scripts/baseline/promote-agent.mjs`
(guards pinned: prod `b54ffc95:d90b149d:951e564c`, dev `c1013e8b:d90b149d:c91b024a`) and
`verify-baseline.mjs --write-manifest` re-recorded the baseline. All nine checks pass:
dev == production == baseline. Rollback snapshot:
`storefront/evidence/baseline/2026-10-23T07-02-39-411Z-PRODUCTION-rollback.snapshot.json`.

Known open defect (tracked follow-up, not silently dropped): the per-tool segmentation seam.
The model writes one text segment per tool boundary and can re-open the answer at each one;
five wording rounds reduced it to one duplicated opening image plus one stub announce line per
multi-tool reply. First move for a fresh session: ask Algolia Engineering whether per-tool
text segments can be constrained platform-side.

Application fix riding with this commit: a failed turn no longer wipes the painted reply
(`ConnectedConcierge.tsx` reveals streamed assistant text on failed turns, with the honest
system notice beneath it). Note: this app fix reaches production shoppers only through a
Vercel release; the agent promote does not ship it.

## Release 2026-10-23 07:52 UTC: round 6 live everywhere

Round 6 (structured browse bullets, de-duplicated examples) promoted to production (guards
pinned; snapshot `2026-10-23T07-52-11-354Z-PRODUCTION-rollback.snapshot.json`) and the
baseline re-recorded: dev == production == baseline at `35561ee9`. The app (paint fix, canvas
headings, canvas-restore fix from PR #38) released to Vercel from a clean archive of `4a3afbd`
and aliased to jewellerytv.vercel.app. Live health: ok, toolSheet match.

## Coordination note (2026-10-23 05:10 UTC)

A parallel session edited the dev agent while this program was in flight: instructions are
now `cf2243c5` and the systemPrompt and tools also changed. The round-2 wording (pearl flow,
test clause, acknowledgement rule) is NOT in the live dev agent text; only the round-1
short-sentence format line survives. Round-2 content is preserved in the local rollback
chain (`instructions.round2.md`) and can be re-applied once one lane owns the agent. Shared
Agent Studio prompt changes between concurrent sessions must be serialized; do not patch
until the owner is decided.

Rollback snapshots for both rounds are in the local workspace
(`instructions.old-b54ffc95.md`, `instructions.new.md`).

## The bar the edits teach

Short sentences, same warmth: the conversation keeps the empathy, joy and personal voice;
one or two short sentences carry a point. No caps, no numbers, no limits. Verbosity is cut at
the sentence level, never by stripping the human touch. Broad browse keeps the accepted
first-cut + depth + call-to-action shape.

## Verification (connected, headless Playwright, fresh literals each round)

- Round 1 (8 conversations, 9 turns): openers still generic; announce-then-repeat narration
  measured at 3/3/6 phrases in the three browse probes.
- Round 2 (same suite, all-new literals): generic opener gone in 9/9 turns; narration 3→1,
  3→0, 6→3; education reply 132→96 words with depth intact; follow-up discipline held.

## Open defects after round 2 (proposed fixes drafted, not applied)

1. Between-steps narration now shows display-assembly deliberation ("let me fill that third
   direction...", "Let me finalize the display..."). Proposed A4: the shopper sees only
   finished work.
2. Personal-gift turn asks its deciding question twice (open and close). Proposed A5:
   one question per turn.
3. One exact-count leak ("216 sapphire earring pieces") against an existing never-quote-counts
   rule; watch on retest, no new rule.

## Baseline state (read via scripts/baseline/verify-baseline.mjs)

`baseline.json` still records `b54ffc95`. Dev leads production (`ad08b243`), so the verify
script reports the expected drift until the tested state is promoted with
`scripts/baseline/promote-agent.mjs` and the baseline is re-recorded with
`verify-baseline.mjs --write-manifest`. Promotion is explicitly gated on review of the open
defects above.

## Related

- Local working folder with full evidence: `docs/workspace/conciseness-2026-10-22/`
  (INSTRUCTION-EDITS.md has every before/after; verify-run/ has results, grading and screenshots).
- Binding behavior bar: vault ADR 2026-10-21 conversation-behavior-bar.
