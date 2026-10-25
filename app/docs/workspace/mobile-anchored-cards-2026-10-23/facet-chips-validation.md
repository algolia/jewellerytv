# Facet-chip two-step concierge — validation against the 35-question pool

2026-10-23. Proposal: agent searches once, shows real facet groups as touchable
chips; shopper taps a chip to see its products (two-step). Facet data below is
measured live from the prod_catalog index today (19 queries probed, counts real).
Question pool: the 35 starter questions in `src/concierge/starterQuestions.ts`.

## The experience being validated

Turn 1: agent acknowledges, searches, writes 1-2 sentences, and the reply carries
a chip row of real facet values with real counts ("Chronograph (43) · Dive (31) ·
Dress (86)"). Tap → products under that value render inline instantly (client-side
refinement, no agent turn). Tap again to narrow or switch.

## Verdict per question

| # | Question | Step 1 user sees | Chips shown (real counts) | Tap → | Verdict |
|---|----------|------------------|---------------------------|-------|---------|
| 1 | I'm buying a gift | Agent asks occasion/recipient in 1-2 lines | none needed yet (no query) | — | Works; chips appear after first direction is known |
| 2 | Wedding ring sets | First cut of the two meanings | Brand values: Moissanite Fire (152), Bella Luce (60), Prazana (29) | narrows within 285 hits | Works |
| 3 | What's new in the collection? | Newest-arrival grid | Type chips over new arrivals | narrows | Works (newest index) |
| 4 | What's new for the holidays? | Same | Same | same | Works |
| 5 | A watch for dad | Opener + chips | Band color/material is weak; needs the type facet of watches — probe shows no watch-type attribute surfaced (1607 hits) | — | Needs the display-attribute decision (below); without it, chips here are noise |
| 6 | Mothers ring for my mom | 169 hits, no type facet — brand only (Prazana 44, Pacific Style 18) | weak chips | — | Degrades gracefully: no chips, straight to products + conversation |
| 7 | Show me moissanite rings | 3,015 hits | Brand: Moissanite Fire (2,487) dominates — one chip is pointless; type facets needed | — | Needs display-attribute decision |
| 8 | Show me opal jewelry | 1,234 hits | Rich: earring backings, bead gemstones, Fire Opal (3)… but values are jewelry-internal (Push Back, Leverback) | — | Real risk: facet values are catalog-hardware, not shopper categories |
| 9 | Do you have gold hoop earrings? | 5,334 hits, direct grid immediately | Backing (Hinge 795, Fish Hook 525), Brand (Bella Luce 53) | refines after seeing grid | Works; chips are secondary to instant grid |
| 10 | Show me pearl earrings | 1,782 hits | Backing, Brand, ChainLink | refines | Works |
| 11 | Show me cross necklaces | 2,136 hits | ChainLink: Cable (306), Curb (95); Brand: Bella Luce (126) | strong | Works well — real differences |
| 12 | Show me tanzanite rings | 984 hits | Brand (Bella Luce 232), Collection (Wrapped in Gold 67) | decent | Works |
| 13 | Help me build a ring stack | Agent conversation, pieces picked | type chips may help (rings → bands/midi/statement) | — | Works; chips optional |
| 14 | Show me Southwest Style jewelry | 856 hits | BraceletType: Cuff (35), Stretch (13) | good | Works |
| 15 | Show me Judith Ripka | 433 hits, brand-locked | Type chips within brand | good | Works |
| 16 | Show me Gems en Vogue | 854 hits, Brand facet = single value | Type chips (ChainLink Cable 186…) | good | Works — brand facet correctly suppressed |
| 17 | Help me find my birthstone | 4,670 hits | Gemstone chips (this is the one query where a stone facet is the star) | strong | Works if gemstone attribute is chosen |
| 18 | I only wear white gold | 11,766 hits | Material values messy: colorGroup White (3) vs NavigationName Base Metal — vocabulary gap the prompt already warns about | risky | Needs the material attribute resolved first (purity vs color, standing issue) |
| 19 | Show me clearance jewelry | 20,358 hits | Facet flood: hardware values dominate | — | Needs display-attribute decision + cap |
| 20 | Engagement rings under $1,000 | Budget applied by tool; 2,396 pre-filter | Price bands (real facet) + Brand (Moissanite Fire 854, Prazana 367) | strong | Works well — budget + type chips together |
| 21 | How do I clean my jewelry? | Education answer + link | none | — | Two-step N/A, correctly shows nothing |
| 22 | How do auctions work? | Policy answer | none | — | N/A |
| 23 | How can I watch JTV live? | Service answer + link | none | — | N/A |
| 24 | How do returns work? | Service answer | none | — | N/A |
| 25 | Surprise me | Agent picks, shows a cut | chips after first cut | fine | Works |
| 26 | Treat myself | Agent engages, then first cut | chips after | fine | Works |
| 27 | I have a $200 budget | Search across bands under $200 | Type + price-band chips | strong | Works |
| 28 | Lab-grown or natural? | Education answer, then offer | stone-creation chips if the attribute exists (unprobed) | applies filter | Likely works; needs one probe |
| 29 | Vintage or modern? | Education/clarify | era is mostly NOT a facet — agent conversation | — | Degrades gracefully |
| 30 | What goes with gold hoops? | Complete-look conversation | — | — | N/A (conversation) |
| 31 | Show me something bold | Vague taste: agent asks meaning, may show cut | chips could BE the menu of meanings (color groups with counts!) | interesting | Works — chips as clarify-shortcut |
| 32 | I'm buying a gift | same as 1 | | | Works |
| 33 | I'm looking for wedding ring sets | same as 2 | | | Works |
| 34-35 | What's new ×2 | same as 3-4 | | | Works |

Tally: 20 work cleanly, 5 degrade gracefully (no chips — straight to products or
conversation), 4 hinge on the display-attribute decision (#5, 7, 8, 19),
3 N/A (service/education), 3 need one more probe or the material resolution.
No question breaks the model. The failure mode is never "chips lie"; it is
"chips are noise" — solved by suppression, not by the old custom layer.

## The one real design problem the probes surfaced

CORRECTED same evening, on the deeper probe: **`Catalog_ProductType` does exist**
(Ring 6726 on "diamond rings"; Wrist Watch 2,971 / Watch Band 1,264 / Pocket
Watch 74 on "watches"; Earrings 409 / Ring 353 / Necklace 178 under the
anniversary-budget filter). The earlier claim of "no single product-type facet"
was an artifact of alphabetical attribute slicing in the first probe. It stays
a design choice, not a default: on some queries the type facet is degenerate
(single value) and hardware attributes still flood the list, so the model
picking the display attribute per turn remains the recommendation. Price bands
also turn out to be countable: the live attribute is `Pricing_PriceRange`
(the tool sheet's `facet_Pricing_PriceRange` name does not return counts), so
budget chips are honest. The original finding is kept below for the record.

**There is no single "product type" facet.** Types live in per-form attributes
(BraceletType, ChainLinkType, BackingType, BagTypes…), and the facet list is
hundreds of attributes deep, most carrying jewelry-hardware values (Push Back
1,293). Naively "show the facets" would drown shoppers in backing types.

So each turn must choose 1-2 display attributes. Options:

- **A. The model chooses the display attribute** in its reply (it already reads
  facet counts when aiming). One field in its structured output: which facet the
  chips show. Values and counts still live from the index — no value whitelists,
  consistent with the standing order. The model is good at exactly this judgment
  ("for watches, band material matters; for moissanite rings, brand is pointless").
- **B. Fixed display attribute** (e.g. always productType) — simple but there is
  no such attribute to use, and it contradicts the index-derived standing order.

Recommendation: A. It is one field, it reuses judgment the agent already
exercises, and it keeps every value index-derived.

## The other things the probes settled

1. **Suppression rule works**: single-value facets (Gems En Vogue 864 of 854)
   and hardware attributes get suppressed; when only one chip row is honest,
   the row is skipped and the grid shows immediately (gold hoops: grid first,
   chips secondary).
2. **Budget + chips compose**: price bands are themselves a facet, so "under
   $1,000" shows bands + brands together. No custom budget display needed.
3. **Latency**: chips and tap-refine are client-side (the site's own search
   client already queries this index). Follow-up exploration stops costing
   15-20s agent turns — the transcript's performance complaint, solved by
   removing the agent from the loop step.
4. **What gets deleted** if this ships: arrange_groups tool + schema + surplus
   reporting, the three-direction aiming rules, bullet-direction format rules,
   the F1 hydration/grouping pipeline, the closed-attribute-list bug class, and
   most of the instructions file's display sections. The sanitization rewrite
   and this change converge: the rewrite should NOT be done first at full cost —
   sections that this change deletes should be deleted, not rewritten.

## What still needs an answer before building

1. The display-attribute choice (A above) — Arijit's call.
2. One more probe: lab-grown/natural facet (#28) and a watch-type attribute (#5).
3. Whether tap-refine uses the site search client directly (recommended) or a
   new endpoint.
4. The replacement contract for the agent's tool sheet (drop arrange_groups) —
   production change, gated on Arijit after Dev battery.
