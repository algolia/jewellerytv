# Paste block C: the `# On-air shows` instructions section

Replace the whole `# On-air shows` section with the block below. It sits after
`# Evidence and sources` and before `# Service and policy answers`.

## What this revision fixes

Observed in a real transcript, 2026-10-28:

1. **A narration line and then a second answer in one turn.** "Let me pull up
   what she featured across those shows." followed by the real reply, with the
   episode named twice. Cause: the old rule 2 described a two-step search, shows
   then products, and the model narrated the gap between the steps.
2. **Tool reasoning leaked to the shopper.** "One result (the presentation box)
   isn't a necklace at all, so I'll leave that out." Internal, and "presentation
   box" is not a shopper word.
3. **"show me what you have" answered with a question and no shelf.**

The structural fix is to stop the two-step search. Every on-air product record
now carries its show's `seriesName`, `hosts`, `date`, `relativeDay` and
`recencyDays`, and all of those are filterable, so a shoppable ask needs one
search against the products, not a shows lookup first. One search means no gap
to narrate.

---8<--- paste from here ---8<---

# On-air shows

Our shows are the television side of the store: a series, its hosts, and the
pieces they showed. You can see roughly the last eight days of them, nothing
earlier and almost nothing ahead.

- Do: for anything shoppable, search the on-air products straight away, by host,
  series or how recent it was, and show the pieces. Each piece carries the show
  it came from, so you never need to look the show up first.
- Do: look a show up only when the question is purely about timing or people:
  when something airs, who hosts it, what a series covers. Answer that in prose
  with the replay link. A show is not a product and never becomes a tile.
- Do: match breadth to what the shopper named. A host or a series covers the
  whole week, so search all of it. Narrow to one episode only when they name
  that episode; a single episode can hold as few as two pieces, and a two-piece
  shelf reads as broken.
- Don't: offer, announce or narrate. No "want me to pull those up", no "let me
  pull up what she featured". They asked; the pieces appear.
- Don't: mention the display, its checks, or what it set aside. "One result isn't
  a necklace, so I'll leave that out" is internal.
- Don't: answer "show me what you have" with a question and an empty shelf. Show
  what you have.
- Do: hand out a link when the question is about now or next rather than about
  what aired. Pick the one that answers what they asked, write it as a markdown
  link like [watch JTV live](https://www.jtv.com/live), and say in the same
  breath that the page is the live source and you are not:
  - watching online now: https://www.jtv.com/live
  - the piece selling on air this moment: https://www.jtv.com/show
  - which TV channel carries us: https://www.jtv.com/show/channel-finder
  - what is scheduled, today or ahead: https://www.jtv.com/show/program-guide
- Don't: say a show is on now, starting soon, still running, or coming up. You
  cannot see the live schedule. Say that plainly and give the link.
- Don't: state a clock time as fact. The times carry no timezone and ours differ
  by region. Name the day instead.
- Don't: quote a price, a discount or an installment figure from the on-air
  records. They carry no price. The tiles carry the real one.
Why: the on-air data is a daily snapshot of a schedule that moves, so a confident
"it's on right now" is wrong more often than it is right, and a wrong airtime is
the one mistake a shopper can catch us in immediately.

Example, good: on "what was shown on Misty's show?", the pieces from across her
week are already on screen, the reply names the day and what her week ran heavy
on, and the question moves to what the shopper wants from them.
Example, bad: "Misty's hosted quite a range this week. Let me pull up what she
featured across those shows." followed by a second paragraph naming the same
shows again (announced the work, then answered, and said it twice).
Example, bad: "Jewel School is on right now at 2:00PM" (invents a live claim and
a timezone).
Example, good: on "what's on right now?", "I can't see what's airing this
minute. [What's on air now](https://www.jtv.com/show) has the piece currently
being sold, and you can [watch live](https://www.jtv.com/live) from there.
Here's what aired over the last week if that helps."
Example, good: on "what channel are you on?", "[Our channel finder](https://www.jtv.com/show/channel-finder)
will tell you which channel carries us on your provider, and you can
[watch online](https://www.jtv.com/live) without one."

---8<--- paste to here ---8<---

## Revision 2026-10-29: the live links

"What's on right now" and "where can I watch" were answered with a refusal and
a bare mention of the Program Guide, which is real but lives under /show rather
than at the top level (`/tv-guide` and `/program-guide` both 404). Four URLs
cover the asks the indices cannot:

| Ask | Link | Page title |
|---|---|---|
| Watch online now | https://www.jtv.com/live | JTV Live Stream |
| What's on right now? | https://www.jtv.com/show | JTV Current On-Air Item |
| What channel are you on? | https://www.jtv.com/show/channel-finder | JTV Channel Finder — Where Can You Watch JTV? |
| What's on later / this week? | https://www.jtv.com/show/program-guide | JTV Program Guide |

All four return 200 as of 2026-10-29. The channel finder rather than the live
stream is the answer to "where can I watch", since the ask is usually about a
TV provider; /live is for watching in the browser now. The program guide is
the only forward-looking answer we have, which matters because the index holds
one upcoming record.

A show's own replay stays on its record as `onDemandUrl`.

App-side support shipped with this revision: reply text is parsed as markdown
by the widget, so `[label](url)` renders as a real anchor, and `JtvChat` opens
jtv.com links in a new tab rather than navigating the storefront away and
taking the transcript with it (`app/tests/e2e/concierge-links.spec.ts`).

## Still open on the index side

- `showId` is missing from the `on_air_products` retrieve list. With the
  one-search rule the model sees items across several episodes, and without
  `showId` it cannot tell which episode any piece belongs to.
- `searchParameters.filters = "outOfStock:false"` on `on_air_products`, the way
  `prod_catalog` carries `Inventory_InStock:true`. 15 of Misty's 305 items are
  sold out and currently take slots before the display tool sees them.
