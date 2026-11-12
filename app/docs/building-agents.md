# What we learned building the JTV concierge

Field notes from building a retail shopping agent: an Algolia Agent Studio
agent, six indices, a React chat panel, and a small model (Haiku 4.5) doing
the talking. Everything below is something that went wrong here and cost
time. The numbers are measured, not estimated.

It is written for the next person building an agent with Claude Code or a
similar tool. The headings are the things to look for.

---

## 1. Check what the SDK already ships before you build it

This was the most expensive mistake on the project, and it was made in the
first week.

The original concierge was a hand-built React chat panel, a custom display
pipeline, custom result normalisation, custom agent tools, and a Node server
proxying Agent Studio. The dependency that was already in `package.json` —
`react-instantsearch` — shipped all of it:

```
Chat · ChatOverlayLayout · ChatInlineLayout · ChatSidePanelLayout
ChatGreeting · ChatTrigger · ChatMessageLoader · createDefaultTools

algolia_search_index · algolia_grouped_results · algolia_display_results
algolia_compare_products · algolia_recommend · algolia_memorize
algolia_memory_search · algolia_ponder
```

Two of those built-in tools had been hand-written locally. The commit that
removed the parallel implementation:

```
130 files changed, 238 insertions(+), 23023 deletions(-)
```

| Deleted | Lines |
| --- | --- |
| `ConnectedConcierge.tsx` — one component | 1,540 |
| `presentProducts.ts` — a custom display tool | 579 |
| `server/api.ts` — the whole backend | 530 |
| `nativeResults.ts` — result normalisation | 428 |
| `connected.css` | 704 |
| 28 test files written against the above | ~8,000 |

The replacement was about 1,260 lines, and the only customisation genuinely
needed — our own product tile and a gate on what reaches the screen — was an
84-line component overriding one tool by id. The server went too: the browser
talks to the agent platform directly, removing a deployment target. A
comparable assistant on a sibling project is **515 lines in total**.

### The bug that forced the issue

The custom pipeline had four layers that each independently verified stock,
price and image, and each returned `null` or `[]` on failure. One turn
reported `status: ok, 6 of 6, zero dropped` and the shopper saw an empty
screen, with nothing logged anywhere. Layer 1 verified against the catalogue
record; layer 3 re-verified against the streamed broadcast record, which
carries none of the catalogue's fields.

Finding that took two hours and required injecting a module-level telemetry
array into the running page. In the widget version it is one gate, in one
place, with tests.

### Why it happened, and why an AI coding tool makes it more likely

- **Ask an agent to build a chat panel and it will build a chat panel.** It
  will not stop to check whether something in your dependency tree already
  does it. It is extremely good at producing the code and has no instinct for
  *not* producing it.
- **Every layer was locally reasonable.** Each of the four verification layers
  was added in response to a real bug. None was wrong on its own. Nobody was
  holding the whole shape in their head, and the assistant holds only the
  files in its context.
- **Generated code is cheap to write and expensive to own.** 23,000 lines
  arrived faster than anyone could review them, then had to be tested,
  maintained and debugged. The 28 deleted test files were themselves real
  work — correctness effort spent defending an architecture that should not
  have existed.
- **Nothing in the normal workflow asks "should this exist?"** Code review
  catches bad code. It rarely catches code that is fine but redundant.

### What to do instead

1. **Before building any surface, ask the assistant to inventory the SDK
   first** — "list the components and tools `react-instantsearch` exports for
   chat" — and only then ask for code. One prompt, before the feature.
2. **Ask "what does this look like with no server?" early.** Ours did not
   need one, and the server was the thing hosting the layers that broke.
3. **Treat growing line count as a smell, not progress.** A 1,540-line
   component is the signal, not the milestone.
4. **Find a reference implementation and compare orders of magnitude.** 515
   against 23,000 is not a difference in style.
5. **Prefer one override point to a parallel pipeline.** "Override rendering
   by tool id" replaced the entire custom display path.

The trade-off is real and worth stating: building on the library means
tracking its changes. A platform update here silently dropped the facets that
fed our refinement chips, and we had to notice and adapt. That was a day. The
custom pipeline cost weeks.

---

## 2. Measure before you diagnose. Then measure again at n=10.

**Agent behaviour is bimodal.** The same prompt, the same question, the same
model gives you a clean answer and a broken one on alternate runs. A single
run tells you almost nothing, and a batch of five tells you less than it
appears to.

Three times on this project, five runs said "fixed" and ten said otherwise:

| What we believed at n=5 | What n=10 showed |
| --- | --- |
| "Routing is fixed, 0 failures" | 5 failures in 10 |
| "Excited shoppers get longer replies — clean separation" | Means still apart, but the ranges overlap |
| "Headings always carry the date now" | 1 in 6 dropped it |

Rule adopted: **nothing is judged on fewer than ten runs**, and a fix is only
a fix when the before and after are both at ten.

**Instrument before you theorise.** The worst day on this project was spent
guessing at why one question produced six paragraphs of prose and no
products. Three plausible theories, three prompt edits, no change. The actual
cause took four minutes to find once we logged the tool names: the agent was
searching the blog index, writing from an article, and never reaching the
product catalog at all. Not a length problem. A routing problem.

Write the probe first. A fifty-line script that prints what the agent
*actually called* beats any amount of reading the prompt.

**Watch for sampling artefacts in your own measurements.** We reported that
TV shows carried "one or two products each" and built a prompt rule on it.
The real range was 7 to 83. We had been counting a page of twelve results.
The measurement tool had a default, and the default was the finding.

---


## 3. Verify the prompt that is actually running

**Prompt drift is silent and total.** On this project the tracked prompt in
git was 314 lines of fiction — an entirely different structure from what the
agent was running. Separately, a prompt block was believed applied and had
never been pasted. Twice.

The fix is twenty lines of code: a read-only GET that pulls the live config,
writes it next to the intended one, and exits non-zero if they differ.

```
instructions:  MATCHES (15,704 chars)
system prompt: MATCHES (0 chars)
exit=0
```

Run it before every measurement. Half the "the fix didn't work" results on
this project were "the fix was never applied."

**Hand-edits delete load-bearing rules.** A tightening pass here removed a
paragraph requiring the agent to display products rather than describe them.
The section was still titled *"Search, then show."* Only the search half
remained. Measured result: 3 turns in 9 wrote about products the shopper
could not see.

If a prompt is worth tracking in git, diff it after every hand-edit. The
section heading will not tell you what left.

---

## 4. The prompt and the tool config are one surface

This was the single most expensive class of bug here, and it is invisible
from inside the prompt.

**Instructions the agent is not permitted to execute.** Our search tool had
an allow-list of facets it could filter on. The prompt's three worked
examples instructed filters on four attributes that were not on it. The agent
was not ignoring the prompt; it was forbidden from obeying it. Every one of
those examples existed because it was a measured failure, so the failures
could never be fixed by rewording.

The tell: the model substitutes the nearest *permitted* thing. Asked for
gold, it filtered on the colour "Yellow" — wrong, because gold-plated pieces
are yellow too. It looked like a comprehension failure and was a permissions
failure.

**Instructions referencing fields that are not returned.** The prompt told
the agent to group products by `showId`. `showId` was not in the tool's
`attributesToRetrieve`. The agent could not see the field it was told to use,
so it grouped by the nearest visible one and silently merged two different
broadcasts.

**Tool descriptions that contradict the data.** One index description
documented the air-date field as `showDate`. The field is `date`.

Checklist for any agent with tools:

1. Every attribute the prompt names — can the agent filter on it?
2. Every field the prompt names — is it in the returned payload?
3. Every example in the prompt — run it, confirm it executes.
4. Every field name in a tool description — confirm it exists.

**Watch the auto-generated description.** Ours advertised 117 facets with
their values — 24,655 characters, roughly 6,000 tokens on every single turn,
including the four the agent was forbidden to use. Auto-generated context is
still context. It costs latency, it costs money, and it can actively
contradict your prompt.

---

## 5. For a small model, the example is the rule

A frontier model reads your rule and treats the example as illustration. A
small model does the reverse.

**The clearest case we measured.** The rule said to separate a heading's two
halves with a middle dot. The example, written by hand, used a full stop:

```
rule:    separated by a middle dot
example: "Sparkle in Silver . November 3rd"
result:  6 of 6 runs used a full stop
```

Fixing the example — one character — gave 18 of 18 correct. The rule text
never changed.

**The default prompt we inherited had the same disease.** Our follow-up
suggestion chips kept proposing things we do not sell. The suggestion prompt
was the platform default, and its two worked examples were *"How do I
implement X?"* and *"Can you explain Y further?"* — from a developer
assistant. Nothing in it mentioned our industry. The strongest signal in the
prompt pointed at the wrong shop.

**Your "good" example is the target, not the ceiling.** We wrote *"one to two
sentences, three at the most"* and illustrated it with a three-sentence
example. The model produced three to five. The example was read as the goal.

**Prohibition lists get read as exhaustive.** We banned relative dates by
listing `"3 days ago"` and weekday names. The model started writing
`"yesterday"` — not on the list. Enumerations invite the model to find the
gap. State the positive shape and make the ban categorical.

---

## 6. Write rules the model can actually check

**Counting is not a thing a small model can do mid-generation.** `"One to two
sentences, three at the most"` was in bold and was ignored, averaging 5.0
sentences on plain questions and 6.5 on excited ones. Slots work where counts
do not: *one sentence on what came back, one bold question, nothing else.* A
slot is checkable against the text so far. A count is not.

**Conditional logic needs branches, not prose.** A five-sentence paragraph
describing when to search again became "if the result is empty, do exactly
one of these two things." The paragraph contained the same information and
could not be followed.

**Name the negative space.** Rules say what to do; failures come from what
the model does *additionally*. Nothing in our prompt said which parts of a
request should *not* become a filter, so everything looked like a candidate —
including a handbag's colour, filtered through a jewellery-material facet,
returning zero results every time.

---

## 7. Identity in the prompt becomes capability in the agent

Our agent was introduced as *"JTV's jewelry shopping concierge."* Asked for a
branded backpack, it answered:

> I'm JTV's jewelry concierge... Bugatti backpacks aren't in our catalog.

The catalog contains "Bugatti Reborn Backpack in Navy". Measured over five
runs, **three made no tool call at all** — a refusal with no search behind
it. The other two searched, found the product, and then filtered it out with
a jewellery facet.

Two lessons:

- **A role description is read as a scope limit.** If the agent handles
  anything outside its headline noun, say so in the role, or it will
  confidently deny stock you have.
- **Add a rule against unverified denial.** *"Never say we do not carry
  something you have not searched for."* This is the general cure; it covers
  every category you forgot to enumerate.

**And beware fixing this by over-specifying.** The first draft named two
brands — both of which happened to be in the failing test case. The catalog
has 304 brands and 12 that make bags; the two named were third and fourth.
That is fitting the prompt to the eval rather than to the catalog. Name
categories, not instances.

---

## 8. Symptoms mislead. Find the upstream cause.

The complaint was always "the replies are too long." Three rewrites of the
length rules changed nothing. Then we looked at what the long replies had in
common: across 19 turns, **every over-long reply had no products attached**.
The model was compensating in prose for a shelf it never fetched. Fixing the
routing — search the catalog first — took the failure rate from 9 in 10 to 0
in 10. The length rules were never the problem.

The same thing happened again, smaller, in the last week: the hypothesis was
"replies get long when the product isn't found." Measured, and wrong — a miss
and a hit produced the same length. The real driver was that the baseline was
already double the limit, and the shopper's register added more on top.

Both times the guess was reasonable. Both times it was wrong. Measuring cost
less than the edit would have.

---

## 9. Application-side lessons

**Classify at the smallest unit that can be wrong.** Our filter for the
model's process-narration ("Let me search for...") judged each streamed
*block*. One real sentence at the start of a block released everything after
it, narration included. Re-judging per *sentence* fixed it. Whenever a filter
leaks, check whether its unit is bigger than the thing it is filtering.

**Measure the dead air.** Tool calls with buffered input produce a gap where
the UI has nothing to show. Ours was 4.2 seconds of blank panel. The fix was
to keep the existing "Searching..." state visible until the first result
renders — but we only knew it mattered because someone timed it.

**Never assume a selector or a shape.** We wrote a verification script
against `.ais-ChatMessage-text`. The real class was `.ais-ChatMessage-message`,
and the script silently reported zero of everything. Probe the real DOM
before you write assertions against it.

**Expect more than one record shape.** Our product tile read catalog records.
The broadcast index names the same fields differently, and the tile rendered
"Image unavailable" next to a product code. Two shapes, one component, two
tests.

**Keep the agent config portable.** Everything that could live in the agent
rather than the application did, so the whole thing can be lifted into the
client's own environment without the demo storefront attached.

---

## 10. Working with Claude Code on this

**Ask for paste blocks, not API calls.** Agent Studio changes here are made by
hand, deliberately. An agent that can PATCH your config will, and the
resulting state is hard to review. Paste blocks keep a human in the loop and
give you a diff.

**Do not take the assistant's conclusions at face value.** Real corrections
from this project: a claim that twelve of twelve results were plated, when
several were sterling and the matching regex was wrong. A recommendation to
filter on an attribute whose actual values were Brass and Enamel — it cut a
result set from 5,429 to 5. A `grep` reporting a prompt block missing twice,
when the text was hard-wrapped across lines. Ask for the evidence, not the
summary.

**The assistant is good at the probe, not the verdict.** The highest-value
pattern here was: ask it to write a measurement script, run it at n=10, and
read the table yourself.

---

## The short version

1. Read the SDK before you write the feature. Ours shipped the whole panel.
2. Nothing is true at n=5. Measure at ten, before and after.
3. Verify the live prompt matches the one you are editing. Automate it.
4. Check that every instruction is executable against the tool config.
5. Fix the example, not the rule — the example wins.
6. Give the model slots and branches, not counts and paragraphs.
7. A role description is a scope limit. Say what else it handles.
8. When a symptom resists three fixes, it is downstream of the real cause.
