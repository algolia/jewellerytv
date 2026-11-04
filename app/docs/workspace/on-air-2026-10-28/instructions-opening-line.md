# Paste block F: the opening line

Add as a subsection of `# How you talk`, after `## Voice` and before
`## Respond to the person first`.

## Why it is needed

The display tool's settings changed where the agent puts its prose. Traced
across eight questions on 2026-11-01, every turn is now two steps — search,
then display — with **no message text at all**. The whole reply is the tool's
`intro`, and the intro has shrunk to a fragment: "Gift ideas under $200",
where a week earlier it was "A varied first look at opal jewelry."

Two reasons to move it back into the message rather than lengthen the intro:

- **It is the only thing on screen during the wait.** Message text streams
  word by word as it is generated. The display tool's input does not render
  until it is complete, and there is a fixed four-second stall inside it, so
  an intro cannot fill that gap and a message can.
- **The panel already handles both.** The display gate drops the tool's intro
  when the message carries text of its own, and keeps it when the message is
  empty. Whichever side the sentence lands on, the shopper reads it once — so
  writing both only wastes generation.

The old rule at `# Worked examples` already asks for "the opening line"; this
makes it a rule of its own, because an example is not where a requirement
should live.

---8<--- paste from here ---8<---

## The opening line
Every turn that shows pieces opens with one sentence of yours, in your reply,
before the shelves. It is the difference between a recommendation and a
results page, and while the pieces are still loading it is the only thing the
shopper has to read.

- Do: write it as your own text, not in the display tool's intro field. Your
  text reaches the shopper as you write it; the tool's does not appear until
  the shelves do.
- Do: give it something to carry — what this category runs deep in, what
  separates the directions on screen, or the one thing worth knowing before
  choosing. A sentence, not a label.
- Do: keep it to one sentence. A second belongs after the pieces, if anywhere.
- Don't: restate the request, count what came back, or describe the work.
  "Here are some options", "I found several", "Let me show you" are all the
  turn narrating itself.
- Don't: write a heading. "Gift ideas under $200" is a caption; it tells the
  shopper nothing they did not just say.
Why: a shelf with no words is a search results page, and the shopper came here
to be advised rather than to run a query.

Example, good: "Opal runs deep here, from milky Ethiopian stones to the darker
black opals, which is really the first choice to make."
Example, good: "Under $200 the gold-over-silver pieces give you the most
presence, so I've leaned that way."
Example, bad: "Gift ideas under $200" (a caption, not a sentence).
Example, bad: "Here are some great options for opal jewelry!" (restates the
request and narrates the turn).

---8<--- paste to here ---8<---

## If the display tool is requiring an intro

If its settings make `intro` mandatory, the model will write both and the gate
will drop one. That is correct but wasteful. Turning the field off is the
tidier end state, and nothing in the panel needs it.

## Superseded in part, 2026-11-04 — do not paste as written

Haiku 4.5 narrates far more than the models before it. A single turn:

```
I'll search our catalog for Gems en Vogue pieces.
Let me correct that search with the right facet format.
Let me search for Gems en Vogue pieces directly with the query.
I notice these results are all pre-owned pieces. Let me search for the brand's new collection as well.
Now let me display a selection from the new collection, organized by piece type.
```

The prompt already bans this and the ban does not hold — across models, and
because the completion cache replays banned text verbatim for repeated
questions. So it is now a display rule: **text that a tool call follows does
not render**, and what the model writes after its last tool call is the
reply.

That rule cannot tell an opening line from narration. Both are text before a
tool call; only their content differs, and the display cannot read content.
So this block's central instruction — write the sentence in your reply,
before the shelves — would now be hidden by the rule that fixes the
narration.

**The sentence should live in the display tool's `intro` instead.** The gate
already shows it whenever the message carries no text the shopper will read,
so there is still exactly one voice per turn and it still appears above the
shelves.

What is lost by moving it: the intro does not stream, so it cannot fill the
display tool's four-second stall the way streamed message text could. The
pending shelf and the "Choosing pieces…" loader cover that gap instead.

Keep from this block: one sentence, carrying something, not a caption, not a
count, not a restatement of the request. Change where it is written.
