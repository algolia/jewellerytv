# On-air groups carry the show and the day

A shelf built from an on-air question comes back under styling headings
("Elegant Silver & Diamond Rings") that say nothing about which broadcast the
pieces came from. Hosts appear on several shows a week, so "what did Jennifer
showcase yesterday" returns pieces from three different broadcasts with
nothing to tell them apart.

The heading is the carrier: the display tool renders each group's `title`
above its shelf, and every `on_air_products` record already holds the show,
the series and the air date. Three paste blocks, all agent configuration. No
application change.

## Contents

| File                       | What it is                                                            |
| -------------------------- | --------------------------------------------------------------------- |
| `README.md`                | Paste blocks A, B and C, and where each goes                          |
| `verify-on-air-groups.mjs` | Two turns; prints each heading against the air dates behind its tiles |

## Observed data, sampled read-only on 2026-11-04

Every `on_air_products` record carries `seriesName`, `showTitle`, `showId`,
`hosts`, `date`, `relativeDay` and `recencyDays`. Nothing has to be added to
the index.

| Ask                 | What comes back                                                            |
| ------------------- | -------------------------------------------------------------------------- |
| Jennifer, yesterday | 52 pieces, 3 shows (9 / 7 / 36), all on `2026-11-02`                       |
| Misty, this week    | 219 pieces across 9 shows; `Moissanite Fire` recurs on three separate days |

Two findings shape the blocks below.

**1. Pooling a series needs more hits than the tool fetches.** The index entry
returns 12 hits and the display tool is configured for exactly four pieces per
group. Counting the series with four or more pieces available in the window:

| `hitsPerPage` | Misty | Jennifer | Dawn |
| ------------- | ----- | -------- | ---- |
| 12            | 1     | 1        | —    |
| 24            | 1     | 1        | 4    |
| 48            | 7     | 6        | 4    |

At 12 or 24 a host's week can only ever fill one group, whatever the prompt
says. 48 is the number that makes the rule executable.

**2. A pooled series spans several days.** `Moissanite Fire` in Misty's week
covers 28 October, 30 October and 4 November, so that group cannot carry one
date. The heading rule has to allow for it rather than assert a day over four
tiles from three broadcasts.

**On weekday names.** The headings below use the record's own `relativeDay`
("Yesterday") or its plain `date` ("3 November"), never "Monday". The agent
has no clock, and the instructions already forbid it computing calendar dates;
deriving a weekday from `2026-11-03` is exactly that, and a wrong weekday is a
mistake a shopper catches immediately. If the weekday matters more than the
risk, it belongs on the records as a field rather than in the model's head.

---

## Paste block A: the `on_air_products` index entry

In Agent Studio, `algolia_search_index` → the `on_air_products` entry.

**Settings**

- `hitsPerPage`: **12 → 48**. Without this the series rule cannot fill more
  than one group (table above).
- `attributesToRetrieve`: currently unset, so every field comes back,
  including `startMinutes`, `combinedId`, `stretchPayAmount` and
  `endTimeLocal`. Pin it to what the turn uses, so 48 records cost roughly
  what 12 unrestricted ones did:

```
objectID, name, brand, image, seriesName, showTitle, showId, hosts, date,
relativeDay, recencyDays, outOfStock
```

**Description**

Two claims in the current text are wrong, and both matter here: the air-date
field is `date`, not `showDate`, and `onDemandUrl` is not on product records
at all.

Replace this paragraph:

---8<--- replace from here ---8<---

Show fields on every record: `seriesName` (filterable and searchable),
`hosts` (filterable, searchable, multi-valued), `showTitle` (searchable),
`showId` (filterable), `date` (the air date, `YYYY-MM-DD`), `relativeDay`
(filterable), `recencyDays` (filterable).

`seriesName` is the show without its hosts ("Moissanite Fire"); `showTitle`
adds them ("Moissanite Fire with Misty and Tommy"). A series runs on several
days, so `seriesName` groups a week and `showId` identifies one broadcast.

There is no replay link on a product record. `onDemandUrl` lives on
`on_air_shows`, so a turn that needs one has to look the show up by `showId`.

---8<--- replace to here ---8<---

## Paste block B: grouping rules in `# On-air shows`

Add after the "match breadth to what the shopper named" bullet, before the
"if a show's line-up turns out to be jewelry-making supplies" one.

---8<--- paste from here ---8<---

- Do: group an on-air shelf by where the pieces came from, not by style. When
  they all aired on one day, each group is one show. When they are spread
  across the week and no single show holds four pieces, pool a series that ran
  more than once into one group.
- Do: head each group with the day and the name in that order, separated by a
  middle dot: "Yesterday · Sparkle in Silver", "3 November · Moissanite Fire".
  Take the day from the record's own `relativeDay` for anything in the last few
  days and from its `date` otherwise, written out as a day and a month. Never
  work out a weekday yourself.
- Do: name the series rather than the full show title. The title repeats the
  hosts, and "Sparkle in Silver featuring Morganite with Scott and Fatima" is
  sixty-one characters over a shelf four tiles wide.
- Do: drop the day from the heading when the group's pieces did not all air on
  the same day, which is what pooling a series across a week usually means. The
  series name on its own is true; one date over four pieces from three
  broadcasts is not.

Why: the shopper asked about a broadcast, so the heading is where their
question gets answered; a styling label over the same tiles answers one nobody
asked, and leaves them unable to tell one show from another.

Example, good: on "what did Jennifer showcase yesterday?", her pieces came
from three broadcasts on one day, so the shelves run "Yesterday · Southwest
Style by JTV" and "Yesterday · Solara by Prazana", and the reply says she was
on three shows and what they ran heavy on.
Example, bad: the same pieces under "Elegant Silver & Diamond Rings" and
"Gold & Moissanite Sets" (names a direction the shopper did not ask about, and
hides the one they did).
Example, bad: "4 November · Moissanite Fire" over a group pooled from three
air dates (states a day three of the four pieces did not air on).

---8<--- paste to here ---8<---

## Paste block C: nothing in the application

The gate strips each group's `why` subtitle on purpose
(`src/concierge/chat/gatedGroupedResults.tsx:125-130`), and
`tests/concierge/display-gate.test.ts:189-211` holds it stripped. The heading
carries everything above, so that stays as it is.

If the headings prove too long in the rail, the fallback is to stop stripping
`why` for on-air turns and let it carry the day as a second line: it renders
at 0.85× size and 70% opacity
(`instantsearch.css/components/chat.css:1477`), which is what metadata wants.
That is a follow-up, not part of this.

## Verify

Apply blocks A and B to the development agent, then from `app/`:

```sh
node docs/workspace/on-air-group-headings-2026-11-04/verify-on-air-groups.mjs
```

Two turns against the dev agent with caching off, so two agent completions. It
reads the search output and the display tool's input off the same stream and
joins them on `objectID`, so each heading is printed against the air dates and
series actually behind its tiles — a heading that claims a day its pieces do
not share shows up as a mismatch rather than having to be eyeballed.

Pass looks like:

- "What did Jennifer showcase on yesterday's show?" — two or three groups, each
  headed with the same day and a different show name.
- "What did Misty feature this week?" — at least two groups headed by series
  name, and no day on a group whose tiles span more than one date.

Before running, confirm the paste landed. The last three blocks in this
workspace were believed applied and were not:

```sh
node scripts/sync-agent-prompt.mjs
```

Read-only GET; it reports whether the live instructions match the tracked copy.
