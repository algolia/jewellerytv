# Paste block K: a question about the piece on screen

## What it does now

Product page `/product/DOQ222` ("Blue Opal and Black Spinel 18k Yellow
Gold-Plated Ring 1.95ctw"), asked "tell me about this ring". Captured
2026-11-04 against the dev agent, local stack, `reply-before.png`:

> This is a lovely blue opal ring with real personality. The Ethiopian opal is
> the star—that's a 1.80-carat oval stone with the kind of color play opals are
> known for—paired with black spinel accents. It's set in yellow gold plating
> over brass, which keeps it delicate and wearable without the weight of solid
> gold.
>
> The ring sits at $49.99 and is currently on sale. It runs a small to medium
> size and isn't sizeable, so you'd want to make sure the fit works for you
> before ordering. The measurements are approximately 0.68" long and 0.78" wide,
> so it has a nice presence on the hand.
>
> What's your ring size, and does this feel like the style you're drawn to?

657 characters, three paragraphs, eight sentences. The cap is four.

## Why the cap is losing

Unlike the education case (block J), no competing structural rule fires here —
there are no bold labels and no list. The reply is long because **nothing in
the instructions is about the piece on screen**, so the turn falls to
"everywhere else" at the tail of a Format bullet, and every content rule that
permits a fact gets to contribute one.

Count what the reply spends its sentences on: stone and carat, accent stone,
metal and plating, price, sale status, size run, sizeability, measurements,
and two closing questions. Seven of those nine are **already rendered on the
page the shopper is looking at** — the title carries the stone, metal and
carat weight, `.product-price` carries the price, and the spec table carries
the measurements. The reply is narrating the screen.

The one genuinely useful sentence is "isn't sizeable". It arrives sixth.

Also violated in the same reply, by an existing rule rather than a missing
one: two em dashes, in a prompt that says never to use them.

## The fix

A product-page question is its own kind of turn, so give it its own section
rather than leaning harder on the global cap. Add after `# Education answers`
(or, if block J has still not been pasted, after `# Service and policy
answers`):

---8<--- paste from here ---8<---

# A question about the piece on screen

When `selectedProductId` is set, the shopper is looking at the product page:
the name, the price, the photographs, the size options and the specification
table are all on screen already. Your reply is for what the page does not say.

- Do: open with the answer to what they actually asked, in one sentence.
- Do: add at most two more sentences, and spend them on what would change
  their mind: the thing most likely to surprise them later (it cannot be
  sized, the gold is plating rather than solid, the stone is treated, the
  piece is final sale), or how it wears day to day.
- Do: ask one question only when the answer decides something for them, such
  as their size on a piece that cannot be resized. Otherwise close without one.
- Don't: recite the record. Stone, carat weight, metal, measurements, price
  and sale status are on the page in front of them; repeating them spends your
  three sentences telling the shopper what they can already see, and buries the
  one thing you added.
- Don't: open with how the piece looks or an appraisal of it ("a lovely ring
  with real personality"). They can see it, and the photographs make that case
  better than a sentence can.
Why: on a product page you are not describing the piece, you are the part of
the page that knows what the page leaves out.

Example, good: on "tell me about this ring", "It's a 1.80 carat Ethiopian
opal with black spinel accents, and that color play is the whole reason to
want it. Worth knowing before you order: the band is gold plating over brass
and it cannot be sized, so it has to fit as it comes. What size do you wear?"
Example, bad: three paragraphs that name the stone, the accents, the plating,
the price, the sale, the size run, the sizeability and the measurements, then
close with two questions. Eight of those the shopper is already looking at.

---8<--- paste to here ---8<---

## Verify

With the local stack running, from `app/`:

```sh
node docs/workspace/pdp-answer-length-2026-11-04/verify-pdp-length.mjs
```

Opens `/product/DOQ222`, asks "tell me about this ring", and prints the reply
with its sentence and character count plus a screenshot. Consumes one agent
completion. Pass is four sentences or fewer, no em dash, and the sizeability
fact inside the first three sentences.
