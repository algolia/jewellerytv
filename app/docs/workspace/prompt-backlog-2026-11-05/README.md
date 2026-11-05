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
- Do: head each group with the date and the show, separated by a middle dot:
  "3 November · Sparkle in Silver". The date is the record's own `date`
  written out as a day and a month; never "3 days ago", and never a weekday,
  which you would have to work out. Say "yesterday" or "today" in your line
  if it helps, where a sentence can carry it; the heading stays the date.

---8<--- replace to here ---8<---

### 2b. One group, and the empty day (measured after the first paste)

With the old bullet gone, two turns in three still spanned the week
(`verify-on-air-groups.mjs`, 2026-11-05: "What has Misty been showing?" came
back as 5 November, 4 November and 2 November, one show per group). The pull
is no longer inside §9 — it is one layer up, in the system prompt:

> Send four pieces to a group, or eight; the shelf is four across, so five
> leaves one stranded. **Two groups, three at most.**

For a catalog search with several directions in it, that is right. For an
on-air turn it is an instruction to find three shows, and the only way to find
three is to reach across days. The model is obeying the more specific-sounding
number.

So §9 has to say what the shape is for its own turns. Add after the
one-broadcast bullet:

---8<--- paste from here ---8<---

- Do: expect one group on an on-air turn, not two or three. The broadcast is
  the direction, so one show is one group; the two-or-three-group shape
  belongs to a catalog search that holds several directions at once. More than
  one group only when the day the shopper asked about carried more than one of
  that host's shows, and then one group per show, never one per style.
- Do: when the day they named holds nothing for that host or series, say so in
  one line and show their most recent show instead, headed with its own date.
  Measured 2026-11-05: "what did Jennifer showcase on yesterday's show?" when
  she had not been on air for two days returned an empty panel and no
  explanation, which reads as broken rather than as an answer.

---8<--- paste to here ---8<---

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

## 4. The restructure dropped the ban on report styling (§3)

Measured 2026-11-05, "What outfits match gold hoops best?" — 1,328
characters, seven paragraphs, fourteen sentences, four bold section labels
(**Casual & Minimalist**, **Layered & Modern**, **Elevated Basics**,
**Evening & Statement**), zero tiles, and two blog searches.

Two causes, and neither is the model being wordy for no reason.

**The prohibition that forbade this shape is gone.** The prompt the
restructure replaced carried it twice:

> - Don't: use headings, section labels, italics, report styling.
>
> - Don't: use bold section labels, headers or a list. Those are for rules
>   with deadlines and fees. A comparison has one answer and some nuance, and
>   sections make three sentences look like a document.

§3's "Avoid:" list has eight items and none of them is this one. The
principle survived in the Why line — "Bold is reserved so the one action we
want stands out" — but a reason with no rule attached is not an instruction,
and the model bolded four labels without breaking any rule it was given. Add
to the "Avoid:" list:

---8<--- paste from here ---8<---

- Headings, bold section labels, and lists, outside a policy answer with
  steps or conditions. Sections make three sentences look like a document.

---8<--- paste to here ---8<---

**And the question is not in the length table.** §3 sizes five kinds of
answer: discovery, product questions, comparisons, education, policies.
Styling advice is a sixth, so nothing capped it. This is the same gap the
product-page answer fell through before the restructure closed it, in a
different place. Add a row:

---8<--- paste from here ---8<---

- **Styling and wear advice:** usually 2 to 3 sentences, and show the pieces
  rather than describing the looks in prose.

---8<--- paste to here ---8<---

The "show the pieces" half matters as much as the length. The turn searched
`blog` twice, displayed nothing, and closed by asking "Would you like to
explore specific hoop styles or see some options to shop?" — a permission
question for something §5 already tells it to do. Gold hoops are a catalog
search; the styling guide is the supporting half, not the whole answer.

The second blog search is item 1 again: the model's own words before it were
"Let me try a broader search."

## 5. Expectation setting

The branch's own battery concluded that the remaining voice failures are
"model-level across three prompt generations". This restructure is the fourth.
It is a better prompt, and it is not the thing that will close the narration
gap — that is what the transport filter (`src/concierge/chat/narrationFilter.ts`)
is for.
