# Starter question provenance

The welcome screen shows five short prompts selected from a curated pool for each new chat. The pool maps to aggregate search-demand themes from Algolia Analytics, not catalogue inventory counts. Each displayed label stays fixed UI text and continues through the existing composer send path.

## Analytics window and limits

The primary window is July 16 to October 14, 2026. The comparison window is October 15, 2025 to October 14, 2026. Read-only Analytics API access succeeded for `prod_catalog`, `prod_catalog_featured`, `prod_catalog_newest`, `blog`, and `help_content`.

Product search produced a broad set of recurring themes. The 90-day featured-index leaders included pre-owned pearls (8,195 searches), green tourmaline (6,537), Sweet 16 (4,147), lab-created rings (3,455), and yellow-gold diamond earrings (2,543). Query counts from separate indices are not added together and do not represent unique shoppers.

The current app disables Algolia analytics for its own searches, so these figures are not Concierge chat-message counts. Search queries also lack reliable channel, bot, and internal-test attribution. Algolia documents that `analytics:false` excludes a request from Search Analytics. See the [Analytics API top-search reference](https://www.algolia.com/doc/rest-api/analytics/get-top-searches/) and [guidance on `analytics:false`](https://support.algolia.com/hc/en-us/articles/4406981861009-Can-I-disable-the-Analytics-for-some-queries).

The `blog` index returned 10 searches in six query strings across both windows. The `help_content` index returned 65 searches in 49 strings. Those small samples overlap project validation wording, including auction and live-viewer queries, so the pool does not rank demand from the blog or Help indices. The three cross-source prompts below come from product-index search terms and have matching blog or Help records. No claim is made that the cross-source query itself originated in that content index.

## Curated pool

The label is the shopper-facing prompt. `Observed query` and `searches` preserve its aggregate demand basis. `Answer source` names the source the Concierge should use when the prompt is educational or support-related.

| Prompt                                        | Observed query                    |  Index and window | Searches | Answer source                                 |
| --------------------------------------------- | --------------------------------- | ----------------: | -------: | --------------------------------------------- |
| Show me moissanite rings                      | moissanite rings in platineve     |     featured, 90d |    1,709 | prod_catalog                                  |
| What lab-created diamond rings can I see?     | lab created ring                  |     featured, 90d |    3,455 | prod_catalog                                  |
| Show me green tourmaline jewelry              | green tourmaline                  |     featured, 90d |    6,537 | prod_catalog                                  |
| Find pre-owned pearls                         | pre owned pearls                  |     featured, 90d |    8,195 | prod_catalog                                  |
| Show me yellow-gold diamond earrings          | yellow gold diamond earrings      |     featured, 90d |    2,543 | prod_catalog                                  |
| Find white-gold hoop earrings                 | white gold hoop earrings          |     featured, 90d |    2,342 | prod_catalog                                  |
| Show me large hoop earrings                   | large hoop earrings               |     featured, 90d |    1,900 | prod_catalog                                  |
| Can I see bead bracelets?                     | bead bracelet                     |     featured, 90d |    2,738 | prod_catalog                                  |
| Show me 14k gold necklaces                    | 14kt gold necklace                |     featured, 90d |    2,688 | prod_catalog                                  |
| Can I see sterling-silver chains?             | sterling silver chain             |     featured, 12m |   27,201 | prod_catalog                                  |
| I'm looking for men's diamond jewelry         | men s diamond jewelry             |     featured, 12m |   16,011 | prod_catalog                                  |
| I need a Sweet 16 gift                        | sweet 16                          |     featured, 90d |    4,147 | prod_catalog                                  |
| Show me clearance rings                       | rings on clearance and sale       |     featured, 90d |    1,232 | prod_catalog                                  |
| Can I see a size 11 ring?                     | ring size 11                      |     featured, 90d |      994 | prod_catalog                                  |
| Show me a 3-carat moissanite solitaire        | 3 carat moissanite solitaire ring |     featured, 90d |      999 | prod_catalog                                  |
| I'm looking for a 16-inch necklace            | 16 inch necklace                  |     featured, 90d |    1,598 | prod_catalog                                  |
| Show me pink tourmaline jewelry               | pink tourmaline                   |     featured, 90d |      969 | prod_catalog                                  |
| What turquoise and gold pieces can I explore? | turquoise and gold                |     featured, 90d |      808 | prod_catalog                                  |
| Show me multi-color rings                     | multi color ring                  |     featured, 90d |    1,551 | prod_catalog                                  |
| I'm looking for a moissanite engagement ring  | moissanite engagement ring        |     featured, 90d |      227 | prod_catalog                                  |
| Show me moissanite wedding sets               | moissanite wedding sets           |     featured, 90d |      647 | prod_catalog                                  |
| I'm looking for a moissanite anniversary ring | moissanite anniversary ring       |     featured, 90d |      210 | prod_catalog                                  |
| What's November's birthstone?                 | november birthstone               |     featured, 90d |      221 | blog: November Birthstones: Citrine and Topaz |
| How does StretchPay work?                     | stretch pay                       | prod_catalog, 90d |       69 | help: StretchPay FAQ                          |
| What does free shipping cover?                | free shipping                     | prod_catalog, 90d |       76 | help: Shipping Policy                         |

All product labels returned catalogue matches in a read-only `prod_catalog` query. The observed response counts ranged from 11 to 11,381. These are matching records, not stock, eligibility, or availability guarantees.

## Rotation and scope

The selector returns five distinct prompts, limits repeated themes and sentence forms when the pool permits, and tracks shown labels in tab-scoped session storage. Every label appears before the pool cycles; when fewer than five remain, the final set includes those fresh labels plus fillers. After a full cycle, it avoids repeating the last set. Starting a new chat selects the next varied set. Storage failure leaves the welcome screen working with randomized selection.

The pool adds no analytics calls, tracking, agent instructions, API, index writes, or separate conversation path. The Concierge still generates every reply. The generic Discover helper and the category-specific Discover title/subtitle are unchanged by this feature.
