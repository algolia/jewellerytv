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

The index-ranking change is applied; three paste blocks remain, and no
application change.

## Contents

| File                       | What it is                                                               |
| -------------------------- | ------------------------------------------------------------------------ |
| `README.md`                | The index-ranking change, paste blocks A, B and C, and where each goes   |
| `verify-on-air-groups.mjs` | Three turns; prints each heading against the shows and dates behind it  |

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

**Nothing sorted by recency, so that was changed first.** `customRanking` was
`["asc(positionInShow)", "desc(rating)"]`, which left "the latest show"
unsayable: the agent can only filter on a day it already knows, and which day
is latest differs per host. See the next section — it is applied, and it is
what lets the default cost one search.

**On weekday names.** The headings below use the record's own `relativeDay`
("Yesterday") or its plain `date` ("3 November"), never "Monday". The agent
has no clock, and the instructions already forbid it computing calendar dates;
deriving a weekday from `2026-11-03` is exactly that, and a wrong weekday is a
mistake a shopper catches immediately. If the weekday matters more than the
risk, it belongs on the records as a field rather than in the model's head.

---

## Index change: applied 2026-11-04

The agent could not ask for "the latest show" — which day is latest differs
per host, Misty's is today and Jennifer's yesterday, and nothing sorted by
recency. `recencyDays` is now at the front of the custom ranking, verified
read-only:

```
customRanking: ["asc(recencyDays)", "asc(positionInShow)", "desc(rating)"]
```

Position within a show stays as the tiebreak, so the order inside a show is
unchanged. Two things follow, and the second is what shapes the prompt block.

**The latest show is the first hit's show.** No arithmetic, no lookup:

| Host | First hit | Its day |
| --- | --- | --- |
| Misty | Moissanite Fire | today |
| Jennifer | Designer Styling - Off Park Collection | yesterday |
| Dawn | Southwest Style by JTV Sale & Clearance | today |
| Melissa | Affordable Luxuries | today |

**And it needs no second search.** Because the page now leads with the most
recent show, its pieces are all at the top of the first page. Across all 24
hosts in the window, at 24 hits a page, the fewest the latest show yields is
eight — enough for two groups without asking the index again:

| Latest show's share of page one | Hosts |
| --- | --- |
| 8 to 9 | Wendy, Tommy, Misty, Fatima, Charles |
| 12 to 14 | Susan, Lissa, Jennifer, Mark, Melissa, Scott |
| 17 to 24 | the other 13 |

So the default is one search, then a filter the model applies to records it
already holds. That is why block A sets `hitsPerPage` to 24 and not lower.

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

- Do: show one broadcast, not a week of them. On-air results come back most
  recent first, so with no day named the show you want is the one the first
  result belongs to: keep the pieces that share its `showId` and leave the
  rest. That is a choice you make among records you already have, not a second
  search.
- Do: search with the day on it when the shopper names one, rather than
  filtering afterwards: `relativeDay` on their own word for it, or a
  comparison such as `recencyDays < 3` for a span. One search either way.
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

## Paste block C: let one show fill a shelf

`algolia_grouped_results` is configured `minResultsPerGroup: 4`,
`maxResultsPerGroup: 4`. That was fine when a shelf was cut from a week and
carved into three style groups. Now that a group is one broadcast, it caps a
default turn at four tiles: one show, one group, four pieces, where the same
question returns eight or twelve today.

Set `maxResultsPerGroup` to **8** and leave the minimum at 4.

The shelf is four tiles across, so eight is two clean rows and the app's own
gate already expects it — it trims a ninth piece that would sit alone on a row
(`gatedGroupedResults.tsx`, `trimOrphan`), and the system prompt already says
to send "four pieces to a group, or eight". A single-show turn then shows
eight, and a day carrying three shows still shows three groups.

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

The ranking change is in. Apply blocks A, B and C to the development agent,
then from `app/`:

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
