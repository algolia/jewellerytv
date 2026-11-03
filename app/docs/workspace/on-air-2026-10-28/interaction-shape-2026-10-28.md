# Paste block E: the turn shape, general sections

The narration, the double answer and the question-instead-of-a-shelf are not
on-air behaviour. The general prompt requires them. Four edits, three of which
delete text.

Line numbers are from the development agent's instructions as read on
2026-10-28.

---

## Edit 1 — delete the progress-line licence (line 62)

**Remove, whole bullet:**

> - Do: between tool steps, at most one short progress line ("Let me pull those
>   up"), and only when the shopper is left waiting.

The transcript's "Let me pull up what she featured across those shows" is this
rule being obeyed, in almost the supplied wording. Nothing replaces it: a turn
that is about to show a shelf has nothing to narrate, and `While you work`
already covers the rest.

---

## Edit 2 — make the pre-tool line conditional (line 61)

**Current:**

> - Do: acknowledge the request in your opening line, before your first tool
>   call, with the topic in it: what they asked for, your take, and why you are
>   searching. Never a generic filler line that could open any reply.

**Replace with:**

> - Do: say one thing per turn. When the turn will end in a shelf or an answer,
>   that is the only message the shopper gets: no line before the tool call, no
>   second message after it. Open with the topic in hand, never a generic filler
>   line that could open any reply.
> - Do: speak before a tool call only when nothing will land this turn, such as a
>   question you must ask before you can search at all.

This is the root of the double answer. Line 61 requires a message before the
first tool call and line 63 requires the answer after the last tool result, so
two text blocks per turn are the specified behaviour. Line 66 then forbids the
second one from re-acknowledging, which is why the model repeats itself while
technically complying.

---

## Edit 3 — make the closing question conditional (line 40)

**Current fragment:**

> an opening line, one line that carries the single most useful thing the tiles
> cannot, and one question.

**Replace with:**

> an opening line, one line that carries the single most useful thing the tiles
> cannot, and a question only when one would change what you show next.

**And add as the next bullet:**

> - Don't: answer an explicit "show me what you have", "show me more" or
>   "whatever you think" with a question. They have told you to act. Show the
>   pieces; a question there asks them to do your job twice.

The third turn in the transcript, "show me what you have", came back as two
questions and no shelf. The mandatory question is why.

---

## Edit 4 — give the internals ban the transcript's own words (line 69)

**Append to the existing bullet:**

> Never tell the shopper what the display left out or why: "One result isn't a
> necklace, so I'll leave that out" is your reasoning, not their information. If
> something you picked did not make the shelf, show what did and say nothing
> about the rest.

Lines 68 and 69 already ban this twice, in general terms and with an invented
example, and it happened anyway. A verbatim example of the real failure binds
where an abstract rule did not. Note the model can infer a drop by comparing
what it asked for against what came back, so the rule has to cover the inference
rather than the tool output.

---

## Why these are mostly deletions

The same pattern as the verbosity work earlier in this session: the measured
improvement came from removing competing obligations, not from adding
instructions. The prompt is at 31,408 characters and every added rule competes
with the three-sentence ceiling for the same turn.
