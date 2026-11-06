# The follow-up suggestions have no JTV in them

The chips under a reply come from a different place than the reply does:
`config.suggestions` on the agent, with its own model (`gpt-4.1-mini`) and its
own system prompt. That prompt is the platform default, untouched:

> Based on the conversation, suggest up to 3 follow-up questions or requests
> that the USER might want to ask next.
> Write them from the user's perspective, as if the user is typing them.
> Keep each suggestion under 8 words.
> Respond with a JSON array of strings, for example: ["How do I implement
> X?", "Can you explain Y further?"].
> Do not include any explanation or extra text, only output the JSON array.
> Do not include suggestions regarding specific IDs.

Nothing in it says jewelry, JTV, or catalog. The only concrete guidance it
gives is two worked examples — **"How do I implement X?"** and **"Can you
explain Y further?"** — which are from a developer assistant. Examples are
the strongest signal in a short prompt, and these point at generic
software-flavoured phrasing, which is the likeliest reason a gift
conversation produces "Gifts for tech lovers".

Two things follow. The suggestion model has never been told what we sell, and
the one thing it has been shown is the wrong shop.

## What we actually sell

Facet counts from `prod_catalog`, 2026-11-06: the catalog is overwhelmingly
gold jewelry by category — 10kt and 14kt rings, earrings, necklaces,
bracelets and chains — alongside silver, gemstones and pearls. The on-air
indices add watches, jewelry-making supplies and beauty. There is no
electronics, no apparel, no homeware. A suggestion naming any of those is
unanswerable by every tool the agent has.

## The replacement

Same contract as the default — user's voice, three of them, under eight
words, bare JSON array — because the platform parses the output and the
UI sizes the chips. Only the domain and the examples change.

---8<--- replace `config.suggestions.systemPrompt` with ---8<---

Suggest up to 3 follow-up questions the shopper might type next at JTV, an
online jewelry retailer.

Every suggestion must be answerable from JTV's own catalog and services:
rings, earrings, necklaces, bracelets, chains and pendants in gold and
silver, gemstones and pearls, watches, jewelry-making supplies, beauty, plus
our shows, shipping, returns and payment plans. Never suggest a product
category JTV does not sell — no electronics, clothing, homeware, toys or
experiences — however naturally the conversation leads there. For a gift
question, stay in jewelry: ask about the recipient, the occasion, the metal,
the stone or the budget, not about the recipient's hobbies.

Write them in the shopper's voice, as if they are typing. Keep each under 8
words. Vary them: a narrowing, a different direction, and a question about
one piece or about buying.

Good: ["Show these in white gold", "Something under $200?", "Is this one
sizeable?"]
Bad: ["Gifts for tech lovers", "What about a smartwatch?", "Explain your
API"]

Respond with a JSON array of strings and nothing else. No explanation, no
product IDs or SKUs.

---8<--- replace to here ---8<---

## Where it goes

Agent Studio, the agent's **Suggestions** configuration — not the
instructions field. Everything else in that block stays: `enabled: true`,
`model: gpt-4.1-mini`, `maxCount: 3`, `maxWords: 8`.

## Checking it

There is no sampler for this one: suggestions are generated per turn and
arrive on the stream as a data part rather than in the reply text. The
cheapest check is the panel — ask a gift question, read the three chips, and
repeat it four or five times, since this is the same bimodal behaviour the
reply-length work ran into and one good set of chips proves nothing.

"I'm buying a gift for my brother" is the turn that produced the complaint;
"What should I get my niece for Christmas?" is the battery's own gift
journey (C3) and worth trying for the same reason.
