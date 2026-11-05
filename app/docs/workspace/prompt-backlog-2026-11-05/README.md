# Prompt backlog after the restructure

The live agent runs the restructured prompt as of 2026-11-05 14:28, and
`docs/agent/instructions.md` now holds a copy of it, so
`scripts/sync-agent-prompt.mjs` reports MATCHES on both fields again. Anything
below is a change to make on top of that, not a different prompt to paste over
it.

## Superseded — do not paste

| Block | Where it was | Why it is dead |
| --- | --- | --- |
| J, education answers | `on-air-2026-10-28/instructions-education-length.md` | §3 sets education at "usually 1 to 3 sentences answering the question directly", and §8 says to lead with the answer and link the guide. That is the block, better placed. |
| K, product-page length | `pdp-answer-length-2026-11-04/README.md` | §8 "Specific products": answer directly, focus on what affects the purchase, "Don't: repeat the entire product page", 1 to 2 sentences. Keep only the measured bad example if §8 ever needs defending. |
| On-air block B, as written | `on-air-group-headings-2026-11-04/README.md` | Written against a prompt structure that no longer exists, and §9 already carries the heading half (see below). |

## 1. Bound the retry (§6) — highest value

§6 reads:

> Use multiple searches when different product types, styles, or retrieval
> strategies would materially improve the result. Avoid redundant searches.
> […] If results are unsuitable or empty, revise the search meaningfully
> while preserving hard requirements.

There is no ceiling in that, and "revise meaningfully" invites another go
every time a shelf disappoints. Measured 2026-11-04, "help me find a mother's
day ring for my mom" ran **four searches in one turn**, each one prefaced to
the shopper with a verdict on the last ("These results are mostly pendants and
charms. Let me search specifically for…").

Two things follow from it. The turn costs four searches, and the gaps between
them are where the narration the transport filter now catches was being
generated in the first place. Bounding the retry is the cheaper fix of the
two, and it is the only one that recovers the latency.

The replacement already exists, written for the old structure
(`git show 4086075:app/docs/agent/instructions.md`, the "Don't: search a
second time" bullet). Reworded for §6:

---8<--- paste from here ---8<---

Don't: search again because a shelf looks small. A handful of pieces is a
shelf; show it. Search again only when the first search returned nothing at
all, only once, and only by changing something real: drop a filter, or drop
the query words and keep the filter. Rewording the same request returns the
same nothing and costs the turn. If the second search is also empty, say
plainly that we have nothing matching and offer the nearest thing you can
name.

---8<--- paste to here ---8<---

This does not forbid the genuine multi-search case §6 opens with (several
product types for one occasion); it forbids re-running the same intent.

## 2. On-air scope (§9) — one bullet, not a rewrite

§9 already carries the heading half of yesterday's work:

> - Do: group products by show when multiple broadcasts are represented,
>   using the returned series name or `showTitle`.

What it does not carry is the scope, and one of its bullets is now wrong:

> - Do: use the available historical show records, generally the last eight
>   days; search the whole history for a host or series unless a particular
>   episode is named.

A host's week is eleven shows and two hundred pieces; twelve tiles cut from it
belong to no broadcast the shopper can name. Since 2026-11-05 the index is
ranked `asc(recencyDays)` first, so the most recent show is simply the first
hit. Replace that bullet with:

---8<--- replace from here ---8<---

- Do: show one broadcast, not a week of them. On-air results come back most
  recent first, so with no day named the show you want is the one the first
  result belongs to: keep the pieces that share its `showId` and leave the
  rest. Search with the day on it when the shopper names one, `relativeDay`
  on their own word for it or a comparison such as `recencyDays < 3` for a
  span, rather than filtering afterwards. One search either way.
- Do: head each group with the day and the show, separated by a middle dot:
  "Yesterday · Sparkle in Silver". Take the day from the record's own
  `relativeDay`, or its `date` written out as a day and a month. Never work
  out a weekday yourself.

---8<--- replace to here ---8<---

The index-entry changes that go with it (blocks A and C: `hitsPerPage` 24,
pinned `attributesToRetrieve`, three corrected description claims,
`maxResultsPerGroup` 8) are unaffected by the restructure and still apply as
written in `on-air-group-headings-2026-11-04/README.md`.

## 3. The §11 checklist — measure before keeping

§11 ends with seven questions the model is told to run before every response.
Six of the seven restate a rule stated earlier in the prompt; the exception is
item 6, which carries the bold-closing-action requirement. A per-turn
checklist on a Haiku-class model is a real cost in tokens and latency, and
possibly a real gain in compliance. Neither is known.

The test is a single A/B on the class battery
(`agent-lane-fix4-2026-11-04/run-full-battery3.mjs`, 14 journeys, ~16 turns),
which already grades the behaviours the checklist asks about. Run it once with
§11 in place, remove the "Before every response, check" block in Agent Studio,
run it again, and compare pass counts and turn durations. If compliance is
flat, the block is latency with no return.

## 4. Expectation setting

The branch's own battery concluded that the remaining voice failures are
"model-level across three prompt generations". This restructure is the fourth.
It is a better prompt, and it is not the thing that will close the narration
gap — that is what the transport filter (`src/concierge/chat/narrationFilter.ts`)
is for.
