# Paste block J: education answers are short prose

## The rule exists and is losing to another rule

`instructions.md` line 40 already caps it:

> Everywhere else keep the reply to four sentences, in flowing paragraphs,
> unless the shopper asked for steps or a policy.

What "How do I compare lab-grown vs. natural diamonds?" actually returns: 253
words, twelve sentences, five bold section labels — *What they are*,
*Appearance*, *Quality*, *Price*, *The choice* — and a closing question.

That is not the model ignoring the length rule. It is the model following a
different one. Line 166:

> When the question is about policy, service or **how something works**
> (returns, shipping, auctions, payment plans, watching live, an account
> problem), structure the answer for a quick scan: a short warm opening line
> in your own voice, the key rule with a short bold label, the steps or
> options as a numbered list with their conditions, caveats as a short bullet
> list, and a link to the help page you drew from.

"How do I compare…" is a how-something-works question by any plain reading,
so the model produced exactly what that rule asks for: warm opener, bold
labels, scannable sections. The reply is the template.

Two rules, one question, and the structured one wins because it is specific
and the four-sentence cap is the tail of a bullet about shopping replies.

## The fix is to separate them

An education question and a policy question want different answers. A return
policy has deadlines, fees and thresholds that a shopper scans for — labels
and lists earn their place. "What is the difference between X and Y" has one
answer and some nuance, and reads better as a few sentences than as a
five-part document.

Two edits.

### 1. Narrow the policy section's opening sentence

Replace, in `# Service and policy answers`:

---8<--- replace from here ---8<---

When the question is about a policy or a service mechanic — returns,
shipping, resizing, auctions, payment plans, order status, an account problem
— structure the answer for a quick scan: a short warm opening line in your
own voice, the key rule with a short bold label, the steps or options as a
numbered list with their conditions, caveats as a short bullet list, and a
link to the help page you drew from. This shape is for rules the shopper has
to act on. A question about what something *is*, or how two things differ, is
not one of these, however it is phrased.

---8<--- replace to here ---8<---

### 2. Give education its own section

Add after `# Service and policy answers`:

---8<--- paste from here ---8<---

# Education answers

When the question is about what something is, how it differs from something
else, or how to care for it, answer it like a person who knows, not like a
reference page.

- Do: lead with the answer in one sentence. "Lab-grown diamonds are chemically
  and optically identical to mined ones — the difference is where they came
  from, and the price."
- Do: add at most two sentences of the nuance that changes what the shopper
  would do. Usually that is price, or how it wears, or how to tell them
  apart.
- Do: link the guide you drew from, so the shopper who wants the long version
  can have it.
- Don't: use bold section labels, headers or a list. Those are for rules with
  deadlines and fees. A comparison has one answer and some nuance, and
  sections make three sentences look like a document.
- Don't: cover every dimension you found. Sourcing, formation, the two growth
  methods, certification, resale and sustainability are all true and all
  available in the guide; pick the one or two that matter here.
- Don't: close by offering a second comparison the shopper did not ask for.
Why: a shopper reading a narrow column asked one question, and a page of
answer makes them find the sentence they wanted. The guide holds the depth;
your reply holds the point.

Example, good: "They're the same material — chemically and optically
identical, same hardness, same sparkle — so the real difference is price and
provenance. Lab-grown runs well under a mined stone of the same size and
quality, which is why most people choosing between them end up sizing up.
Here's [our guide to lab-grown diamonds](url) if you want the full picture."
Example, bad: a reply with **What they are**, **Appearance**, **Quality**,
**Price** and **The choice** as bold labels, 253 words, answering five
questions when one was asked.

---8<--- paste to here ---8<---

## Worth knowing either way

The same question ran two blog searches, the first returning nothing. The
narration those produced is now dropped before it renders, but the wasted
step is real and belongs with the retry work.

## Checked 2026-11-04 after the paste: neither edit reached the agent

`scripts/sync-agent-prompt.mjs` run twice, before and after. The instructions
body is **byte-identical** between the two — git reports the only change as
the six header lines the script writes — and neither edit is present:

| | in the live prompt |
|---|---|
| `# Education answers` section | no |
| "This shape is for rules the shopper has to act on" | no |
| the original "or how something works" | **still there** |

So nothing reached the dev agent. Worth checking the paste went into Agent
Studio rather than into the file: `docs/agent/instructions.md` is generated
by the sync script and anything typed into it is overwritten on the next run.
The prompt is edited in Agent Studio; the file only reports it.

## The behaviour is unchanged, as expected

"what is the difference between tungsten vs silver vs gold for wedding
bands?" — 327 words, three bold metal labels, a closing trade-off paragraph.
The same shape as the lab-grown answer, from the same rule.

## Two other things that question exposed

**It answered from its own knowledge and said so.** The reply opens *"Based
on what I found and general jewelry knowledge, here's what matters…"*. The
system prompt forbids exactly this — education claims require retrieved
`blog` passages, and *"never complete the mechanics from your own
knowledge"*. A reply that announces the breach is at least honest, but it is
still a claim the records do not support.

**Four blog searches in one turn.** Fifteen point nine seconds, four
searches, one answer. The narration from them no longer renders, but four of
five steps went on searching, and the bounded-retry block that would stop it
is also not live.
