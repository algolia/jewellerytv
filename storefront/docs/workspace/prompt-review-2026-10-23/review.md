# JTV Concierge prompt review — 2026-10-23

Scope: live Dev agent 8129ad66 (instructions 09449b31, 29,933ch; systemPrompt 39f9d09f, 8,652ch; model claude-sonnet-5; updatedAt 2026-10-24T00:12:36Z). Production 0bdf59fe (28b97166 / d90b149d) read for reconcile context only.

Base research: vault `Knowledge/frontier-lab-engineering-guidance` — anthropic-claude-prompting-best-practices, anthropic-prompting-claude-sonnet-5-5, anthropic-prompting-claude-fable-5-1, plus the distilled rules in `~/.claude/skills/prompt-shaper/reference/`.

## Verdict

The prompt is in better shape than "way too complicated" suggests. The prior sanitize rewrite already removed the accretion; what remains is mostly distinct rules. The real defects are: one unresolved internal contradiction, cross-prompt contradictions with the system prompt, rule paragraphs too dense for reliable retrieval, and a handful of rules stated 2–4 times. Prompt-Review's C1 draft fixes most of this and is the right base. My findings below grade C1, fix one C1 regression, and review the system prompt C1 did not touch.

## Findings

### F1. Internal contradiction: three-moves vs bulleted-directions (CONFIRMED, real)
Format (instructions line 39) says a browse reply names "no direction list, no product name and no price range the display already shows". But the cross-necklace good example (lines 78–82) names directions in prose ("diamond crosses in gold and silver, gemstone crosses from tourmaline to topaz") and a price ("under $50"). The model gets two shapes for the same turn type. C1 resolves toward three-moves — correct, it matches the Oct 21 bar (bold only on closing CTA) and the chips-era app.
NOTE on C1's changelog: it cites dev text "The timeless pick: … about $680 to $730" as evidence. That string exists in NEITHER dev 09449b31 NOR prod 28b97166 (verified by grep on both dumps). The contradiction is real; the cited evidence was fabricated or recalled from an older version. The real evidence is the cross-necklace example above. Also, C1's claim that dev "had added" a "Close with a next step" section is wrong — that section exists only in PROD (line 114). C1 borrowed prod's section (plus the variant-dedup rule, prod line 144, and the Bella Luce expansion, prod line 170) without saying so. The borrows are fine — prod is live and tested — but they make C1 a dev+prod reconcile, not a pure dev consolidation, and Arijit should know that before approving.

### F2. C1 regression: displayFacets rule dropped (CONFIRMED)
Dev's "Showing products" carries the only copy of the displayFacets selection rule: which facets to set (1–3, from real facet counts, skip single-value/hardware/spec-sheet attributes), when to omit, and the single-scope guard (only on a one-query discovery search; multi-direction turns narrow by conversation). C1 removed it. Production has no displayFacets rule at all, so C1-as-written would ship a draft with the chips feature's prompt support deleted. Restored in my draft (selection judgment + single-scope guard in instructions; render semantics already live once in the system prompt "Display" section).

### F3. Cross-prompt contradiction: naming one piece in prose (CONFIRMED, needs Arijit's read)
System prompt "Display" says: "Name one specific piece in prose by its card name as a Markdown link…". Instructions Format says a browse reply "names no product name… the display shows". Two readings: (a) the link rule is for a piece the conversation is about (saved, settled, refreshed, compared) — then it contradicts nothing but is worded ambiguously; (b) it permits naming a displayed piece — then it contradicts three-moves directly. My system prompt draft disambiguates to reading (a). Flag for Arijit: confirm (a) is the intended behavior.

### F4. Dense rule paragraphs (CONFIRMED)
"Continuity and requirements" paragraphs 2–3 and "Evidence and sources" paragraph 3 pack 10–15 rules each into single blocks. Sonnet retrieves rules from structured lists more reliably than from running prose; the research (best-practices study: clear direction, XML/structure; one rule per line) supports splitting. C1 splits the While-you-work mega-bullet but leaves Continuity and Evidence as dense paragraphs. My draft keeps C1's structure (do not churn further without eval cover) — the split of these two sections is logged as a lever, not applied.

### F5. Dedup already done by C1 (verified sound)
One-question rule, counts rule, display-tool mandate, model-memory rule: C1 gives each one home. Verified against base — no rule lost in these merges.

### F6. Examples (C1's cut is right, with one caveat)
8 worked examples → 4. The four kept (celebration+budget, personal gift two-turn, education, service) each teach a multi-turn flow the table cannot. Cut examples' content is verifiably absorbed into the decision table rows (stuck-routes, cannot-say fallback, out-of-stock fallback) — checked. Caveat: the 24x3 battery must run before/after; example cuts are the highest-risk class of removal.

### F7. Prod/dev divergence (decision for Arijit, not this session)
Prod (35,929ch) still carries the bulleted bolded-directions browse shape ("The gentle entry: everyday pieces from under $50…") and a "Close with a next step" section dev lacks; dev carries the chips-era three-moves shape and the displayFacets rule prod lacks. The two agents now disagree on the most shopper-visible behavior in the product. C1 effectively reconciles dev toward prod for close/variant rules while keeping dev's chips shape — that direction is right (dev is the edit lane; prod gets it on promotion). Decision needed from Arijit at promotion time, not now.

### F8. Additions C1 made (labeled, since C1 claims "no behavior added")
- Variant-dedup model rule + huggie examples (from prod 144–146; matches Arijit's option-B decision in the fix queue — inclusion is correct, but it IS an addition relative to dev 09449b31).
- "Close with a next step" Don'ts: "generic budget or metal question", "values the catalog cannot tell apart" (from prod 118–119).
- Bella Luce explanatory examples "Italian for 'beautiful light'", travel-simulant (from prod 170).
- Role: purpose hoisted from Deciding each turn.
None are new behavior invented by Prompt-Review; all trace to live prod text. Kept in my draft.

### F9. Research-rule violations in the current prompt (from the on-disk studies)
- Reasons behind rules: present in "How you talk" ("Why:" lines — good, keep) but absent in Continuity, Evidence, Showing products. Adding them costs size; only add where a past failure shows the model needs the reason. Not applied wholesale.
- Positive phrasing: the prompt is Don't-heavy in While you work and Showing products, but each Don't is a named failure class from measured sessions (double-yes, counts, narration). Converting to positive phrasing would lose the failure-class specificity. Verdict: keep; the research preference yields to measured failure classes.
- Examples format: consistent within groups (good/bad inline; Do/Do-not worked). Compliant.
- Decision table: exactly the pattern the research recommends for classification-type guidance; the "this table is the complete rule" scoping line is exemplary.
- No anti-laziness scaffolding found. No reasoning-echo requests. No MUST-shouting.

### F10. System prompt (39f9d09f) — reviewed, light-touch draft
It is the contract layer and is already tight (post-sanitize). Issues found:
1. F3's naming contradiction (fixed in draft).
2. displayFacets render semantics appear once (correct home). Keep.
3. "Source and claim rules" overlaps instructions "Evidence and sources" but the split is real: contract (what a source can prove) vs shopper behavior (how to phrase). Merging across prompts risks losing the distinction; deeper dedup logged as a lever requiring eval cover, not applied.
4. Tool scenario 4 (rejected call) becomes the only home for silent-fix teaching once C1 cuts Example 6 — kept.
5. Budget band mechanics ($500 - $1000 bands, inclusivity flags) — mechanics, correct in system prompt. Keep.
Net system prompt change: one paragraph clarified. That is the honest result, not a size cut.

## What this session produced

- `draft-instructions.md` — C1 + displayFacets restoration (F2). No other deviation from C1.
- `draft-systemprompt.md` — live system prompt + F3 disambiguation.
- `decision-log.md` — every rule kept/cut/merged/moved with reason.
- `self-critique.md` — graded defects in my own draft.
- Nothing applied to any agent. Drafts are files.
