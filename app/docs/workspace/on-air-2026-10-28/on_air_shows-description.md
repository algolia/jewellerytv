# Paste block A: `on_air_shows` index description

Replace the whole auto-generated description for the `on_air_shows` entry in the
agent's `algolia_search_index` tool with the text between the markers.

The current text is platform-generated and misleads the model in four ways: it
calls `date` "the date the show aired" without saying the window rolls, it never
lists the `status` values, it never mentions the `showId` join to
`on_air_products`, and it says nothing about the missing timezone.

---8<--- paste from here ---8<---

JTV's broadcast schedule. One record is one show episode. Coverage is a rolling
window of roughly the last eight days, so this index can say what aired recently
and what a series or host covers. It cannot say what is on air at this moment and
it holds almost no future schedule.

Use it only when the question is about timing or people: when a series airs, who
hosts it, what a series covers. To shop what a show sold, search
`on_air_products` directly — every product there carries its own show, so this
index is not a step on the way to the pieces.

Key fields: `title` (searchable), `seriesName` (searchable, filterable),
`hosts` (searchable, filterable, multi-valued, one show can have several hosts),
`date` (filterable, exact `YYYY-MM-DD`), `relativeDay` (filterable: `today`,
`yesterday`, `2 days ago`), `recencyDays` (filterable integer, 0 is today),
`startTimeLocal` and `endTimeLocal` (display strings such as "12:00PM"),
`startMinutes` (minutes from midnight), `status` (filterable), `showId`,
`onDemandUrl` (replay page), `itemsUrl` (the show's product page on jtv.com).

For anything relative, use `relativeDay` — it is the shopper's own word already
indexed. Never compute a calendar date yourself; you have no clock. Filters
match a value exactly and cannot carry a comparison, so `recencyDays:1` is
valid and a range is not.

`status` is `aired`, `live` or `upcoming`. The data refreshes once a day, so
`status` describes the last refresh and not this moment. Never tell a shopper a
show is on now, starting soon, or still running. For the current or future
schedule, say you cannot see it and link the right page:
https://www.jtv.com/show/program-guide for what is scheduled,
https://www.jtv.com/show for the item selling on air now,
https://www.jtv.com/show/channel-finder for which channel carries us, and
https://www.jtv.com/live to watch online.

Times carry no timezone, and JTV publishes its schedule per timezone, so a clock
time here is not authoritative for any particular shopper. Name the day rather
than the hour.

Filter examples: `seriesName:"Jewel School"`, `hosts:Misty`, `status:aired`,
`relativeDay:yesterday`, `date:2026-10-27`. Copy facet values verbatim from the
facet counts; do not compose them from the shopper's phrasing.

---8<--- paste to here ---8<---

## Revision 2026-10-30

The block above replaces the 2026-10-28 draft. Its appendix — "add this once
the recency fields are indexed" — has landed, and two things in the main text
had gone stale.

- **`recencyDays` and `relativeDay` are in the field list now**, but the
  appendix's suggested `recencyDays < 3` is deliberately not. A captured
  failure started with `facet_recencyDays: ["<7"]`, which returns zero without
  erroring because the operator is read as a literal facet value. Until a
  comparison parameter reaches the search tool, `relativeDay` is the only
  relative filter that works.
- **"Point to the Program Guide" is now four real URLs.** The guide exists at
  `/show/program-guide`, not at the top level, which is why an earlier check
  for it 404'd.
- **The join instruction is reversed.** It said to take a `showId` from here
  into `on_air_products`; the show fields are denormalised onto the products
  now, and following the old instruction cost two steps in a captured trace.
  This index is for timing and people, not a step on the way to pieces.
