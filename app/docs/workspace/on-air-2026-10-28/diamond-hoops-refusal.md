# Why the diamond hoops answer refused

> "I don't have a new, first-quality diamond hoop option I can confidently
> keep below $1,000 right now, and we don't offer pre-owned jewelry."

Both halves are false, and the agent had the answer in hand when it wrote
them.

## The facts

| Claim | Reality |
|---|---|
| "we don't offer pre-owned jewelry" | `Catalog_Condition`: First Quality 90,436, **Pre-Owned 8,371** |
| "no first-quality diamond hoop below $1,000" | **1,395** of them, reachable with exactly the band filter the agent has |

## What actually happened

Two searches, both successful:

```
search 1  "diamond hoop earrings"      -> 12 hits, every title begins "Pre-Owned …"
search 2  "new diamond hoop earrings"  -> 12 hits, none pre-owned:
            $89.99, $476.99, $476.99, $599.99, $953.99 …
```

Search 2 is the answer to the question. The agent ran it, received it, and
then said it had nothing.

## Three separate defects

**1. `Catalog_Condition` is not retrieved.** The attributes coming back are
`Catalog_TitleDescription`, `Catalog_LongDescription`, `Media_Images`,
`Pricing_ActivePrice`, `Pricing_PriceRange`,
`Catalog_ConsumerProductCategoryDisplayNames`, `_enrichments`, `objectID`.
No condition field, so the agent can only tell a pre-owned piece from its
title. It can notice "Pre-Owned" when the words are there; it can never
*confirm* that a piece is first quality. Asked for something it could not
verify, it refused rather than showed.

It is not in the facet list either. The nine currently configured:

| attribute | values | coverage |
|---|---|---|
| `Catalog_TargetConsumer` | 4 | 152.1% |
| `Pricing_PriceRange` | 7 | 127.3% |
| `Pricing_DiscountPercentRange` | 10 | 123.1% |
| `Catalog_JewelryMaterialNavigationColor` | 16 | 112.3% |
| `Catalog_BasicMaterialInformationPrimary.BasicMaterialColor` | 64 | **1.7%** |
| `Catalog_BagTypes` | 21 | **0.4%** |
| `Inventory_InStock` | 0 | **0.0%** |
| *(not configured)* `Catalog_Condition` | 2 | **127.3%** |

`Catalog_BagTypes` covers four records in a thousand. `Inventory_InStock` is
`filterOnly`, so it returns no values at all and occupies a slot for nothing.
`Catalog_Condition` is two values at 127% coverage and is the exact attribute
this question turned on.

**2. It invented a requirement.** The shopper asked for popular styles under
$1,000. "New" and "first-quality" are the agent's words, added to the brief
and then failed by it.

**3. It was told to say that.** Corrected after this note was first written:
"we don't offer pre-owned jewelry" is not an inference from absence, it is
close to a quotation. `instructions.md` line 127:

> Pre-owned is out of scope entirely: we deal in new, first-quality pieces.
> If the shopper asks for pre-owned, pre-loved or second-hand jewelry, say so
> plainly in one line and show the closest thing we do carry instead — never
> a pre-owned piece, and never an offer to browse one.

The agent followed its instructions exactly. The "new" it insisted on is the
rule's word, not an assumption that a gift must be new.

That makes this a scope decision rather than a model defect, and it is
probably the right decision — the catalogue holds 8,371 pre-owned pieces that
the concierge may well not be meant to sell. But it is implemented in the
wrong place:

- **It costs a step.** A plain "diamond hoop earrings" query returns twelve
  pre-owned titles, so the agent searches again with "new" prepended. Two
  searches of the five-step budget to work around its own catalogue.
- **It leaks as a false statement about the business.** "We don't offer
  pre-owned jewelry" is true of the concierge and false of JTV, and the
  shopper cannot tell which one is speaking.
- **It is unenforceable.** Without `Catalog_Condition` retrieved, the rule can
  only be applied by reading "Pre-Owned" out of a title.

The fix is a search parameter rather than a sentence:
`Catalog_Condition:First Quality` on the `prod_catalog` index entry, the way
stock is filtered. Pre-owned pieces then never reach the agent, the second
search disappears, and the instruction can shrink to one line about what to
say if a shopper asks for pre-owned directly.

## Fixes

**Index and tool config, in order of value:**

1. Add `Catalog_Condition` to the retrieved attributes. Without it the agent
   cannot answer a new-versus-pre-owned question at all.
2. Add `Catalog_Condition` to the facet list, replacing `Catalog_BagTypes`.
   Then "first quality only" is a filter rather than a guess from titles.
3. Drop `Inventory_InStock` from the facet list — `filterOnly`, so it returns
   nothing. Stock belongs in the index entry's search parameters instead.
4. Consider dropping `Catalog_BasicMaterialInformationPrimary.BasicMaterialColor`
   at 1.7%; `Catalog_JewelryMaterialNavigationColor` already covers colour at
   112%.

**Prompt.** With the search parameter in place, line 127 keeps only its
second half — what to say when a shopper asks for pre-owned directly — and
the two bullets below still earn their place, since inventing a requirement
and reporting the store's scope as the catalogue's contents are general
failures rather than pre-owned ones.

---8<--- paste from here ---8<---

- Don't: say the store does not carry something because your search did not
  return it. A search is a question with filters on it, not an inventory. If
  you did not find it, say you did not find it — "I'm not seeing any in that
  range" — never "we don't offer those".
- Don't: add a requirement the shopper did not give you and then report
  failing it. They asked for hoops under $1,000; new, first-quality and
  certified are your words. Show what matches what they actually said, and
  name any caveat beside the pieces rather than instead of them.

---8<--- paste to here ---8<---

Example, bad: "I don't have a new, first-quality diamond hoop option I can
confidently keep below $1,000" — said with twelve first-quality diamond hoops
between $89.99 and $953.99 in hand. The pre-owned half of that sentence is
the instruction working as written; this half is the defect.
