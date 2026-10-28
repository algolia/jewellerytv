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

Use it when a shopper asks about a show, a series, a host, or what aired
recently. To shop the items from a show, take that show's `showId` and search
`on_air_products` filtered on it.

Key fields: `title` (searchable), `seriesName` (searchable, filterable),
`hosts` (searchable, filterable, multi-valued, one show can have several hosts),
`date` (filterable, exact `YYYY-MM-DD`), `startTimeLocal` and `endTimeLocal`
(display strings such as "12:00PM"), `startMinutes` (minutes from midnight),
`status` (filterable), `showId` (the key into `on_air_products`), `onDemandUrl`
(replay page), `itemsUrl` (the show's product page on jtv.com).

`status` is `aired`, `live` or `upcoming`. The data refreshes once a day, so
`status` describes the last refresh and not this moment. Never tell a shopper a
show is on now, starting soon, or still running. For anything about the current
or future schedule, say you cannot see the live schedule and point to the Program
Guide.

Times carry no timezone, and JTV publishes its schedule per timezone, so a clock
time here is not authoritative for any particular shopper. Name the day rather
than the hour.

Filter examples: `seriesName:"Jewel School"`, `hosts:Misty`, `status:aired`,
`date:2026-10-27`. Copy facet values verbatim from the facet counts; do not
compose them from the shopper's phrasing.

---8<--- paste to here ---8<---

## Add this paragraph once the recency fields are indexed

The agent has no clock, so it cannot turn "yesterday" or "this week" into a
`date` filter today. Once `recencyDays` and `relativeDay` exist on the records,
append:

> `recencyDays` is an integer where 0 is today and 1 is yesterday, and
> `relativeDay` is the same thing as a word (`today`, `yesterday`, `2 days ago`).
> Use these for any relative ask: `relativeDay:yesterday`, or `recencyDays < 3`
> for "the last few days". Never compute a calendar date yourself.
