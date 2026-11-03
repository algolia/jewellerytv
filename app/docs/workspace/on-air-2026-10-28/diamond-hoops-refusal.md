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

**3. It asserted a policy that is not true.** "We don't offer pre-owned
jewelry" is a claim about the business, made from the absence of pre-owned
pieces in a search it had just filtered. The system prompt already forbids
this — *"never manufacture missing evidence, infer negative facts from
absence"* — so it is a rule that needs sharpening rather than adding.

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

**Prompt**, as paste block H below.

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
confidently keep below $1,000, and we don't offer pre-owned jewelry" — said
with twelve first-quality diamond hoops between $89.99 and $953.99 in hand,
about a store holding 8,371 pre-owned pieces.
