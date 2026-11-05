# Class battery, checklist present — 2026-11-05

The §11 A/B needs a before. This is it: the 14-class battery
(`agent-lane-fix4-2026-11-04/run-full-battery3.mjs`) against the dev agent
running the restructured prompt, §11 checklist in place. 17 turns.

Receipts and screenshots:
`agent-lane-fix4-2026-11-04/battery-full3-2026-11-05T16-09-32/`.

One change to the runner to get it going: it launched a downloaded Chromium
that is not installed here, so it now uses the system Chrome with
`channel: 'chrome'`, which is what every other probe in this repo does.

**It does not capture turn duration**, so this baseline can answer whether
removing §11 changes compliance, not whether it changes latency. That is the
half worth knowing: if compliance is flat, seven checks per turn are cost
with no return regardless of how much latency they add.

## Prose length against §3's own limits

| Journey | Sentences | Prose | Verdict |
| --- | --- | --- | --- |
| C1 broad browse | 1 | 152ch | ✓ |
| C2 style brief | 1 | 105ch | ✓ |
| C4 correction (t1/t2) | 1 / 2 | 134 / 257ch | ✓ |
| C5 budget | 1 | 205ch | ✓ |
| C6 thin honesty | 3 | 187ch | ✓ |
| C7 two meanings | 2 | 275ch | ✓ |
| C9 brand | 1 | 141ch | ✓ |
| C13 trending trap | 2 | 335ch | ✓ |
| C3 gift + recipient | 4 | 333ch | ✗ over 3 |
| C8 facet trap | 5 | 537ch | ✗ over 3 |
| C10 education | 5 | 962ch | ✗ §3 says 1 to 3 |
| C14 product question (t3) | 3 | 552ch | ✗ §8 says 1 to 2 |
| C11 policy | 3 | 941ch | ✓ (length is allowed here) |
| C12 on-air | 2 | 798ch | ✓ on count, long sentences |

**Discovery turns are compliant.** Eight of eight shopping replies land inside
the limit, most at one sentence. That is the restructure working, and it is a
real improvement on what the four-sentence rule was getting.

**Education and product questions are not.** C10 is 962 characters of pearl
care across five sentences where §3 asks for one to three, and C14's product
question is 552 characters where §8 asks for one to two. Those are the two
classes this week's complaints were about, still over, under the new prompt.

## Two failures worth more than the length table

**C3 told the shopper about pieces that are not on screen.** Zero tiles, zero
groups, and two paragraphs of text (`C3-gift-recipient-t1.png`):

> I'd love to help you find something special for her. Let me show you some
> festive options that work well for seven-year-olds—jewelry she can actually
> wear and enjoy.
>
> Perfect! Here are some festive gifts designed for a seven-year-old, from fun
> charm bracelets to sparkly earring sets. All of these are made to last and
> come gift-ready.

§7 names this exact failure with its own measured example, and §5 says gift
requests get options shown. The turn did neither, and the second paragraph is
the display tool's intro standing in as the voice for a shelf that never
arrived — so the shopper reads a confident description of nothing.

**And the narration filter missed a sentence it was built for.** "Let me show
you some festive options…" rendered. The transport drops text blocks whole,
and this block is 180 characters, over the 160 the classifier allows, so the
narration survived by being bundled with a human sentence in front of it.

That is the known cost of the merge resolution: the transport cannot drop half
a block. The branch's render-side filter would have caught this one by
dropping the sentence and keeping "I'd love to help you find something special
for her." The fix, if we want it, is to make the drop sentence-level inside
the transport rather than to reinstate a second definition of narration at
render.

## What this baseline is for

Re-run after removing §11's "Before every response, check" block in Agent
Studio:

```sh
NODE_USE_SYSTEM_CA=1 node docs/workspace/agent-lane-fix4-2026-11-04/run-full-battery3.mjs
```

Compare the length table and the two failures above. If the four over-length
classes stay over and C3 still ships words without tiles, the checklist is not
buying compliance and can go.
