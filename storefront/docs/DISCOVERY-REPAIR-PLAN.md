# End-to-end Discovery repair

**Status:** Approved design and execution plan. Implementation and connected acceptance remain open. This portable copy is for GitHub checkouts; the canonical local plan and execution prompt are under the project root `docs/workspace/next-release-2026-10-09/`.

## Goal and rule

For an open-ended product search, the conversation establishes three relevant style directions. Discover shows those directions as three columns, with two distinct, eligible products in each. A third row appears when all three columns have a useful third product. Style names and products come from the current catalogue and shopper brief, never from a fixed list.

A request for one exact item or style is the exception. The Concierge confirms the focus and offers to broaden the view. If the shopper wants only that selection, it presents that selection without claiming to have built a three-style grid.

## Coordinated changes

1. **Conversation and prompt.** Replace the published instructions that currently permit one group for broad exploration. After a useful clarification, the Concierge forms three style directions from the shopper's answers and current catalogue evidence. It explains the differences between those directions and why they fit, while cards carry product-level details. The prompt must not tell the shopper that cards are visible until `present_choices` succeeds and the turn completes. Review the whole relevant prompt section so this rule does not conflict with existing clarification, exact-item or sparse-result instructions.

2. **Style discovery and retrieval.** Extend the existing catalogue retrieval tool with two steps: a read-only, brief-filtered style overview, followed by separate searches for the three chosen style values in one batched request. The overview exposes only currently supported style attributes and values. Its facet counts are candidates, not proof of eligibility: material, fit, condition, availability and other record-level checks still have to pass. Algolia supports retrieving facet values in the context of search filters; use that capability without changing the customer index. See [Algolia's facet-value documentation](https://www.algolia.com/doc/libraries/csharp/v7/methods/search/search-for-facet-values/).

   Keep the base search broad enough to find alternatives. Apply each style as a validated attribute/value filter instead of producing a query such as `diamond fashion ring center design band`. Search up to 12 candidates per style, with one bounded backfill for a deficient style. Return exact records, effective filters, result counts and failure reasons to the Concierge. Never call a timeout or an over-narrow query "no inventory."

3. **Eligibility and curation.** Before presentation, verify every item against the accepted hard requirements and its claimed column value. Normal purchase-oriented Discovery uses current in-stock products; first-quality products take priority unless the shopper's request supports pre-owned pieces. Remove duplicates across columns and near-identical variants that add no choice. The Concierge chooses among the verified candidates using shopper preferences and meaningful differences. The application validates facts and eligibility; it does not choose styles or write the sales conversation.

4. **Presentation contract and panel.** Add explicit `three_style_grid` and `focused_choice` modes to `present_choices`. The grid mode accepts exactly three distinct, record-backed style columns with either two or three items in each; focused mode requires the shopper's exact or confirmed narrow scope in mission state. Reject an incomplete or mismatched grid with a structured reason the Concierge can use to ask a useful follow-up. Do not silently truncate items or render a one-column result as though it fulfilled the grid.

   Carry a contextual heading and short subtitle with the accepted presentation. Derive column labels from validated catalogue values. Preserve the approved compact card design, Discover/Compare/Save tabs, Save and Compare actions, detail access, conversation styling and full-width composer. The desktop layout has three columns; narrower layouts preserve the same style grouping and reading order.

5. **Turn and history consistency.** Stage the entire selection and publish it only after a completed successful turn, as the runtime already intends. If a new search cannot produce a valid grid, ask before replacing the previous selection. Label any retained cards as previous choices; if a changed hard requirement makes them misleading, remove them from active Discover while preserving Saved, Compare and conversation history. A reload must restore the same conversation, brief and last valid presentation.

## Acceptance and release

- Reproduce the reported diamond-fashion-ring journey first. Capture the accepted brief, three chosen style values, separate search filters, rejected candidates, exact product IDs, `present_choices` receipt, final reply and visible grid. The single Center Design card must no longer count as success.
- Run connected journeys for diamond rings, watches and at least one other product type. Vary the wording and shopper answers. Each open-ended journey must produce three supported styles with two eligible items each, or take the agreed shortage path without inventing matches.
- Test exact-item focus, a shopper declining expansion, changed requirements, overlapping style memberships, duplicate variants, unavailable stock, missing style evidence, partial retrieval, timeout and reload. Assert that the reply describes the same three directions shown in the panel.
- Verify schema parity across Agent Studio, SDK callback, server validation and renderer. Compare a byte-exact published-agent readback before and after the coordinated change, preserve rollback, then test the connected app after configuration propagation. Fixture tests and a prompt save are intermediate checks, not end-to-end acceptance.
- Update the older Discovery playbook and status documents where their "up to three" rule conflicts with this decision. Release and production deployment remain separate steps.

## Defaults and boundaries

The three-column rule applies to open-ended product Discovery, not Help answers or exact-item requests. Two products per style is the minimum; show a third row only when all three styles have a useful third product. If the catalogue cannot support three complete styles under the shopper's requirements, the Concierge asks what to revisit before presenting a replacement grid. No customer index changes, hardcoded category values or second conversational agent are required.

The earlier category-first decision remains the baseline for asking one useful clarification. This plan supersedes its "up to three" presentation allowance for open-ended product exploration. Keep proposed, implemented, tested, published and deployed states separate.
