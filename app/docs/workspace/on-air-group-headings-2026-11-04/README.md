# One show, named and dated

A shelf built from an on-air question comes back under styling headings
("Elegant Silver & Diamond Rings") that say nothing about which broadcast the
pieces came from, and it is cut from the host's whole week, so the twelve
tiles belong to no particular show. "What did Jennifer showcase yesterday"
returns pieces from three different broadcasts with nothing to tell them
apart.

Two halves, and the first makes the second possible. **Narrow the search** to
one day of broadcast: the latest show by default, or the day the shopper
named. **Then say which one** in the group heading — "Yesterday · Designer
Styling - Off Park Collection" — which the display tool already renders and
every record already has the fields for.

One index-settings change, two paste blocks, no application change.

## Contents

| File                       | What it is                                                               |
| -------------------------- | ------------------------------------------------------------------------ |
| `README.md`                | The index-ranking change, paste blocks A and B, and where each goes      |
| `verify-on-air-groups.mjs` | Two turns; prints each heading against the air dates behind its tiles    |

## Observed data, sampled read-only on 2026-11-04

Every `on_air_products` record carries `seriesName`, `showTitle`, `showId`,
`hosts`, `date`, `relativeDay` and `recencyDays`. Nothing has to be added to
the index.

**A host's week is wide and a host's day is not.** Facet counts rather than a
page of hits, so these are the real totals:

| Host     | The week          | Pieces per show       | The most recent day            |
| -------- | ----------------- | --------------------- | ------------------------------ |
| Misty    | 219 over 11 shows | 39 36 34 22 15 … 7    | today, 9 pieces, 1 show        |
| Jennifer | 168 over 12 shows | 36 25 25 18 14 … 1    | yesterday, 40 pieces, 3 shows  |
| Dawn     | 153 over 4 shows  | 83 …                  | today, 83 pieces, 1 show       |
| Melissa  | —                 | —                     | today, 14 pieces, 1 show       |

> An earlier draft of this block said a host's week came back as nine shows
> holding one or two pieces each, and built a series-pooling rule on top of
> that. It was an artifact of asking for twelve hits: the sample spread itself
> thinly across eleven shows. No show in the window is thin — the smallest is
> seven pieces. The pooling rule is gone, and so is the `hitsPerPage: 48` that
> only existed to feed it.

So the scope is the fix. A week is too much to answer in twelve tiles and
needs inventing a grouping to carve it up; a day is one to three shows and 9
to 83 pieces, which is a shelf. The rules below narrow the search to the
latest show by default, or to the day the shopper named, and then group by
show inside it.

**Filters do carry comparisons.** The index description tells the agent they
cannot (`recencyDays` "usable as `relativeDay:yesterday` or an exact
`recencyDays:2`, never as a range"). Verified today: `recencyDays < 2` on
`hosts:Misty` returns 9 hits, today's only. That claim has to go, because "the
last few days" depends on it.

**Nothing today sorts by recency.** `customRanking` is
`["asc(positionInShow)", "desc(rating)"]` and there is no newest-first
replica, so "the latest show" is not something the agent can ask the index
for — it can only filter on a day it already knows. That is the one index
change this needs.

**On weekday names.** The headings below use the record's own `relativeDay`
("Yesterday") or its plain `date` ("3 November"), never "Monday". The agent
has no clock, and the instructions already forbid it computing calendar dates;
deriving a weekday from `2026-11-03` is exactly that, and a wrong weekday is a
mistake a shopper catches immediately. If the weekday matters more than the
risk, it belongs on the records as a field rather than in the model's head.

---

## Index change: make the most recent show reachable

This is the one thing that is not agent configuration, and the only thing
blocking the default. The agent cannot ask for "the latest show": there is no
way to say it in a filter, because which day is latest differs per host —
Misty's is today, Jennifer's is yesterday — and nothing sorts by recency.

Put `recencyDays` at the front of the index's custom ranking:

```
customRanking: ["asc(recencyDays)", "asc(positionInShow)", "desc(rating)"]
```

Today it is `["asc(positionInShow)", "desc(rating)"]`. With the change, the
first hit of any on-air search is from the most recent show that matches, and
"the latest show" becomes a rule a model can follow without arithmetic: take
the `showId` of the first result. Position within the show stays as the
tiebreak, so the order inside a show is unchanged. This suits an index whose
whole content is the last eight days.

The alternative, if changing the ranking is unwelcome, is a newest-first
replica declared as a second index entry — the same shape as
`prod_catalog_newest` for new arrivals. More moving parts for the same result.

## Paste block A: the `on_air_products` index entry

In Agent Studio, `algolia_search_index` → the `on_air_products` entry.

**Settings**

- `hitsPerPage`: **12 → 24**. One show holds 7 to 83 pieces, so 12 is a thin
  slice to curate 8 or 12 tiles from, and anything above 24 is paying for a
  week the turn no longer shows.
- `attributesToRetrieve`: currently unset, so every field comes back,
  including `startMinutes`, `combinedId`, `stretchPayAmount` and
  `endTimeLocal`. Pin it to what the turn uses, so 24 records cost about what
  12 unrestricted ones did:

```
objectID, name, brand, image, seriesName, showTitle, showId, hosts, date,
relativeDay, recencyDays, outOfStock
```

**Description**

Three claims in the current text are wrong, and each one matters here: the
air-date field is `date`, not `showDate`; `onDemandUrl` is not on product
records at all; and filters do carry comparisons.

Replace this paragraph:

---8<--- replace from here ---8<---

Show fields on every record: `seriesName` (filterable and searchable),
`hosts` (filterable, searchable, multi-valued), `showTitle` (searchable),
`showId` (filterable), `date` (the air date, `YYYY-MM-DD`), `relativeDay`
(filterable), `recencyDays` (filterable).

`seriesName` is the show without its hosts ("Moissanite Fire"); `showTitle`
adds them ("Moissanite Fire with Misty and Tommy"). A series runs on several
days, so `seriesName` groups a week and `showId` identifies one broadcast.

Results come back most recent first, so the first hit is always from the
latest show that matches. Filter to one broadcast with its `showId`, to a
named day with `relativeDay:yesterday`, and to a span with a comparison on
`recencyDays` such as `recencyDays < 3`. Comparisons work; a range is a valid
filter here.

There is no replay link on a product record. `onDemandUrl` lives on
`on_air_shows`, so a turn that needs one has to look the show up by `showId`.

---8<--- replace to here ---8<---

## Paste block B: scope and headings in `# On-air shows`

This one **replaces** a bullet rather than adding to it. The rule currently
live says the opposite of the new default:

> - Do: match breadth to what the shopper named. A host or a series covers the
>   whole week, so search all of it. Narrow to one episode only when they name
>   that episode; a single episode can hold as few as two pieces, and a
>   two-piece shelf reads as broken.

Its reason no longer holds: the smallest show in the window is seven pieces
and most are twenty or more, so a single episode is a full shelf, not a broken
one. Replace that bullet with everything between the markers.

---8<--- replace from here ---8<---

- Do: show one day of broadcast, not a week of it. With no day named, that is
  the most recent show, which is the show the first result belongs to: take its
  `showId` and filter on it. When the shopper names a day, filter
  `relativeDay` on their word for it, and when they name a span, filter
  `recencyDays` with a comparison such as `recencyDays < 3`.
- Do: group what comes back by the show it aired on, not by style. One show is
  one group; a day that carried two or three of them is two or three groups.
- Do: head each group with the day and the name in that order, separated by a
  middle dot: "Yesterday · Sparkle in Silver", "3 November · Moissanite Fire".
  Take the day from the record's own `relativeDay` for anything in the last few
  days and from its `date` otherwise, written out as a day and a month. Never
  work out a weekday yourself.
- Do: name the series rather than the full show title. The title repeats the
  hosts, and "Sparkle in Silver featuring Morganite with Scott and Fatima" is
  sixty-one characters over a shelf four tiles wide.
- Do: say in your line which day the shopper is looking at, since a shelf of
  one show is an answer about one day and they asked about a person or a
  series. If other days hold pieces too, offer them rather than showing them.
- Don't: head a group with a day its pieces did not all air on. If a shelf ever
  mixes days, the series name alone is the honest heading.
Why: a week is eleven shows and two hundred pieces, and twelve tiles cut from
it belong to no particular broadcast, so the shopper cannot tell what they are
looking at. One show is a thing that happened, and the heading can say when.

Example, good: on "what did Jennifer showcase yesterday?", yesterday carried
three of her shows, so the shelves run "Yesterday · Designer Styling - Off Park
Collection" and "Yesterday · Affordable Luxuries", and the line says she was on
three shows yesterday and what they ran heavy on.
Example, good: on "what has Misty been showing?", no day is named, so the shelf
is her latest show under "Today · Moissanite Fire", and the line offers the
rest of her week.
Example, bad: twelve tiles drawn from eleven of her shows across eight days,
under "Elegant Silver & Diamond Rings" and "Gold & Moissanite Sets" (styling
labels over pieces from broadcasts the shopper cannot identify).

---8<--- replace to here ---8<---

## Nothing in the application

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

Apply the ranking change and blocks A and B to the development agent, then
from `app/`:

```sh
node docs/workspace/on-air-group-headings-2026-11-04/verify-on-air-groups.mjs
```

Three turns against the dev agent with caching off, so three agent
completions. It reads the search output and the display tool's input off the
same stream and joins them on `objectID`, so each heading is printed against
the air dates and shows actually behind its tiles — a heading that claims a
day its pieces do not share, or a shelf quietly cut from a whole week, shows
up as a mismatch rather than having to be eyeballed.

Pass looks like:

- "What did Jennifer showcase on yesterday's show?" — every tile from
  yesterday, two or three groups, each headed with that day and a different
  show name.
- "What has Misty been showing?" — no day named, so every tile from one show,
  headed with that show and the day it aired.
- "What did Misty feature this week?" — a span is named, so a wider set is
  allowed, but each group still belongs to one show and says which.

The script reports, per group, the number of distinct shows and air dates
behind the tiles. More than one show in a group, or a day in a heading the
tiles do not share, is a failure.

Before running, confirm the paste landed. The last three blocks in this
workspace were believed applied and were not:

```sh
node scripts/sync-agent-prompt.mjs
```

Read-only GET; it reports whether the live instructions match the tracked copy.
