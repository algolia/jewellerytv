# Merging #53 into main

Fetched `origin/main` read-only over HTTPS with `gh`'s credentials; the SSH
key is passphrase-protected and cannot be used non-interactively.

**Position:** 52 commits ahead, 13 behind. Merge base `79e1d71`.

## The conflicts are trivial

Three, all the same kind — files this branch deleted that main has since
modified:

| File | main's commits |
|---|---|
| `app/src/concierge/ConnectedConcierge.tsx` | `78aa714`, `3b83c0d` |
| `app/src/concierge/nativeResults.ts` | `3b83c0d`, `1bce8c1`, `82aa777`, `a13ea43` |
| `app/tests/concierge/message-markdown.test.tsx` | `11acb1c` |

`app/package.json` auto-merges. All three resolve as **keep the deletion** —
every one belongs to the display pipeline and the panel this branch removed,
and nothing in the new architecture imports them.

## What does not resolve by deleting

Main's changes are not cleanup. They are three platform findings, and the
branch must not lose them.

### 1. Pre-tool narration renders. Confirmed bug on this branch.

`78aa714`: *"text written before a tool call is progress talk, and the
platform's completion cache replays it verbatim for exact repeated questions
even after the prompt banned it. The display keeps only what the model wrote
after its last tool call."*

Tested against the rebuilt panel: stream a text part, then a tool call, then
the real reply. **Both texts render.** The prompt rule against narrating was
added on this branch, but main's point is that the rule is not enough — the
completion cache replays banned text verbatim, and caching is on.

This needs carrying across as a display rule, not a prompt rule.

### 2. Facet counts can stop arriving.

`3b83c0d`: the platform stopped returning facet counts on 2026-10-30, so main
added a client-side facet-count-only search to keep the chips alive.

The narrowing chips on this branch read `output.facets` from the search part
and return nothing when it is absent, so they would disappear silently.
Counts were present when measured on 2026-11-02 and 11-03, so this is
intermittent or shape-dependent rather than permanent — but a fallback is
cheap insurance for a feature that fails invisibly.

### 3. The search tool has two input shapes. Already carried.

`a13ea43` / `1bce8c1`: the input arrives either as `{queries: [{query,
facet_<Attribute>: [...]}]}` or flat as `{query, index, facet_filters}`, and
the model picks per turn. Main normalizes one into the other.

This branch found the same thing independently on 2026-11-02 and handles it
in `narrowChips.ts` — `indexOf` reads the index from either the tool name or
the input, and `alreadyFiltered` reads both filter shapes. Nothing to carry;
worth noting that two people measured it a week apart.

## Plan

1. Merge `origin/main`, resolving all three conflicts as deletions.
2. Port the pre-tool narration rule into the panel's display path, with the
   test that `11acb1c` added rewritten against the new components — its
   intent, *the display contract is reply-only*, outlives the file it tests.
3. Decide on the facet-count fallback. Cheap, and it fails invisibly without
   one.
4. Re-run the suites and the eight-question eval before pushing.

Nothing here argues against the merge. The conflicts are an artefact of
deleting a directory that stayed alive on main for another fortnight.
