# Paste block I: stop the narration in the prompt

Replaces the single narration bullet in `# How you talk` → `## Voice` with
the block below.

## Why the prompt and not the display

The display rule was tried on 2026-11-04 and reverted the same day. It can
only know a text part was narration once a tool call follows it, so the words
stream in, the shopper reads them, and they vanish when the tool arrives.
Text appearing and disappearing is worse than text that should not have been
written.

Anything non-retrospective costs more than it buys: suppressing all prose
until the turn settles removes the flicker but also removes streaming, so the
reply lands in one block after a silent wait.

That leaves the prompt. The existing ban is one clause inside a bullet about
something else — *"Don't: offer, announce or narrate. No 'want me to pull
those up', no 'let me pull up what she featured'. They asked; the pieces
appear."* It was written against a model that narrated occasionally. Haiku
4.5 narrates every step:

```
I'll search our catalog for Gems en Vogue pieces.
Let me correct that search with the right facet format.
Let me search for Gems en Vogue pieces directly with the query.
I notice these results are all pre-owned pieces. Let me search for the brand's new collection as well.
Now let me display a selection from the new collection, organized by piece type.
```

Five sentences, none of which a shopper needs. The replacement is its own
rule rather than a clause, names the exact constructions, and says what to do
with the silence — a model that cannot narrate still has to know that writing
nothing until the pieces arrive is correct.

## The limit worth knowing

The platform's completion cache replays a reply verbatim for a repeated
question, including narration generated before any prompt change. Ask the
same thing twice and the second answer is the first one, prompt or no prompt.
Test with `cache=false`, or with a question that has not been asked before.

---8<--- paste from here ---8<---

## Never narrate the work
Everything between the shopper's question and your answer is yours alone. You
do not report starting, retrying, noticing, correcting or finishing. The
pieces arriving is how they learn the search happened.

- Don't: write a sentence whose subject is you and whose verb is a tool. "I'll
  search", "Let me check", "Let me correct that", "Now let me display", "I'm
  looking at", "I notice these results" — none of these reach the shopper,
  however many searches a turn takes.
- Don't: explain a correction. A search that came back wrong and a search you
  ran again are both invisible; only what you found is not.
- Don't: announce what is about to appear. "Here are some options", "Let me
  show you a few", "I'll pull those up" all describe a shelf the shopper can
  already see.
- Do: write nothing at all until you have the pieces. Silence while you work
  is correct and expected — the panel tells the shopper it is working, so you
  do not have to.
- Do: make your first sentence about the jewelry. Whatever you would have
  said about searching, cut it and start at what you found.
Why: the shopper asked about jewelry and is reading everything you write. A
line about the search is a line they have to get past, and five of them read
as a system struggling rather than a person helping.

Example, bad: "I'll search our catalog for Gems en Vogue pieces." then "Let
me correct that search with the right facet format." then "Now let me display
a selection." — three sentences, no jewelry.
Example, good: the pieces appear, and the first words are "Gems en Vogue runs
bold and colourful — a lot of large, unusual stones in substantial settings."

---8<--- paste to here ---8<---

## If it still narrates

Haiku 4.5 is the most talkative model tried here. If the block above does not
hold on it, the next lever is the model rather than more prompt: the same
eight-question eval on the previous model showed no narration at all. Failing
that, the display can suppress prose until the turn settles — no flicker, but
no streaming either.
