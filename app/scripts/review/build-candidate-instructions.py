#!/usr/bin/env python3
"""Build candidate-instructions.md for the 2026-10-26 prompt review.
Reads the live pull (docs/workspace/prompt-review-2026-10-26/live/prod-instructions.md),
applies ONLY the walkthrough-accepted changes, writes candidate-instructions.md next to it.
Every replacement asserts its old string exists, so a drifted live file fails loudly."""
import sys, pathlib

WS = pathlib.Path(__file__).resolve().parents[3] / "docs/workspace/prompt-review-2026-10-26"
# Base = the FRESH dev pull (dcaf3a00, includes the other lane's tool-verdict Don't from tonight).
# The builder asserts every old string, so any further drift fails loudly instead of reverting it.
src = (WS / "live/dev-instructions.md").read_text()
t = src

def sub(old, new, label):
    global t
    if old in t:
        if t.count(old) != 1:
            sys.exit(f"FAIL: old string not unique for [{label}] ({t.count(old)} hits)")
        t = t.replace(old, new)
        print(f"ok: {label}")
        return
    # Idempotent rebase: the live text may already carry this change (another
    # apply, or the other lane building on top). Verify the applied marker.
    marker = new if new else old
    if new and new in t:
        print(f"skip (already applied): {label}")
        return
    if not new and old not in t:
        print(f"skip (already applied): {label}")
        return
    sys.exit(f"FAIL: old string not found and applied marker absent for [{label}]:\n{old[:120]}")

# 1. While you work -> While you search (Arijit rename)
sub("## While you work", "## While you search", "rename while-you-work")

# 2. While you search: drop the two redundant count mentions (count law canonical in Deciding)
sub(
    "After your last tool result, the first sentence names what the shopper is looking at or the meaning behind it, never a count of how many, never a sentence about having found, picked or searched",
    "After your last tool result, the first sentence names what the shopper is looking at or the meaning behind it, never a sentence about having found, picked or searched",
    "while-you-search count clause",
)
sub("- Don't: quote an exact or facet count anywhere in a reply, including as color.\n", "", "while-you-search count line")

# 3. Deciding: stale out-of-stock clause (tool has filtered Inventory_InStock:true since Oct 22)
sub(
    "| Only a handful of matches | Say how few in plain words, show what exists, and ask whether to widen. If none are in stock, say so and offer the closest in stock. Never widen silently. |",
    "| Only a handful of matches | Say how few in plain words, show what exists, and ask whether to widen. Never widen silently. |",
    "deciding row-9 stale clause",
)

# 4. Deciding grammar
sub("and never repeats the same overview, opening or sentence frame", "and never repeat the same overview, opening or sentence frame", "deciding grammar")

# 5. Curating: cut tool-narration sentence (tool description's job)
sub(
    " The tool reads the shopper's own words for the named material or stone, checks every piece's material fields against them and drops what contradicts, so a gold-plated piece can never display for a sterling silver ask.",
    "",
    "curating tool-narration cut",
)

# 6. Curating: honest omit semantics (Arijit-approved wording; app derives when omitted)
sub(
    "when nothing meaningfully splits the results, omit the facets entirely",
    "when nothing meaningfully splits the results, you may omit the facets; the app then picks from the search's own counts",
    "curating omit-facets line",
)

# 7. Curating: trim tool-mechanics enumeration, keep the behavioral contract
sub(
    "The tool verifies every piece (in stock, priced, photographed, not a same-design twin of one already showing) and returns the verified list with names and prices: write your reply from that list, and never describe a piece it dropped.",
    "The tool returns the verified list with names and prices: write your reply from that list, and never describe a piece it dropped.",
    "curating verify-sentence trim",
)

# 8. THE REPLY SHAPE (Arijit decision 2026-10-27): two blocks per shopping turn.
#    Kills the narration slot (between-tools line) and the re-opened opening.
sub(
    "- Do: in a shopping reply keep the text to three moves: an opening line, one line that carries what the tiles cannot (how you read the request, what the category runs deep in, what you left out), and one question. The tiles carry every piece, name and price; the selectable options carry the ways to narrow. Your text names no piece, no price and no list of options the display already shows. Everywhere else, stay in flowing paragraphs.",
    "- Do: in a shopping reply you speak twice, and only twice. Before your first tool call, one line that acknowledges the request with its topic in it. After your last tool result, one paragraph that carries what the tiles cannot (how you read the request, what the category runs deep in, what you left out), ending on the closing question as its last sentence, in bold. One paragraph, not two: the meaning and the question stay together. Nothing between tool steps; the paragraph never re-opens the turn with a second acknowledgment or a line about the work. The tiles carry every piece, name and price; the selectable options carry the ways to narrow. Your text names no piece, no price and no list of options the display already shows. Everywhere else, stay in flowing paragraphs.",
    "reply shape: two blocks",
)
sub(
    '- Do: between tool steps, at most one short progress line ("Let me pull those up"), and only when the shopper is left waiting.\n',
    "",
    "reply shape: progress-line license removed",
)
sub(
    "- Do: acknowledge the request in your opening line, before your first tool call, with the topic in it: what they asked for, your take, and why you are searching. Never a generic filler line that could open any reply.",
    "- Do: your pre-search line acknowledges the request with the topic in it: what they asked for and your take. Never a generic filler line that could open any reply.",
    "reply shape: pre-search line aligned",
)

# 8.5 FIX ROUND (battery findings 2026-10-27 morning): bold CTA regression, one-paragraph rule,
#     no product codes in shopper text, explicit between-tools silence.
sub(
    "After your last tool result, one paragraph that carries what the tiles cannot (how you read the request, what the category runs deep in, what you left out), ending on the closing question in that same paragraph.",
    "After your last tool result, one paragraph that carries what the tiles cannot (how you read the request, what the category runs deep in, what you left out), ending on the closing question as its last sentence, in bold. One paragraph, not two: the meaning and the question stay together.",
    "shape: bold + one paragraph",
)
sub(
    "- Don't: use em dashes; use a comma or a full stop, including when you paraphrase retrieved text.",
    "- Don't: use em dashes; use a comma or a full stop, including when you paraphrase retrieved text.\n- Don't: write a product code, SKU, style number or objectID in shopper text; the tiles carry identity.",
    "format: no product codes",
)
sub(
    "- Don't: narrate building, correcting, filling, choosing or searching; if a line only makes sense before the products exist, do not say it.",
    "- Don't: narrate building, correcting, filling, choosing or searching; if a line only makes sense before the products exist, do not say it. After your first tool call there is no text until your last tool result: no line between tool calls, not even a short one.",
    "while-you-search: hard between-tools silence",
)

# 8.6 ROUND 2 (confirmation battery findings): silent over-ceiling drops, no naming dropped
#     pieces, and the question-split bad example.
sub(
    "Never describe a piece priced over the stated ceiling as within budget, and do not relax a budget without saying so.",
    "Never describe a piece priced over the stated ceiling as within budget, and do not relax a budget without saying so. The price bands are mechanics: when a band is coarser than the shopper's number, pieces over the ceiling are simply dropped, and the shopper never hears about the bands, the ceiling check, or the pieces that did not survive it.",
    "money: silent over-ceiling drops",
)
sub(
    "Leave out a direct contradiction; if the results contradict the request so broadly that too little survives, search again with a facet filter rather than showing pieces you know are wrong.",
    "Leave out a direct contradiction; if the results contradict the request so broadly that too little survives, search again with a facet filter rather than showing pieces you know are wrong. Never name, count or list the pieces you dropped, in any explanation, with or without their codes and prices.",
    "curating: no naming drops",
)
sub(
    'Example, verbose (the shape to avoid; a flowing reply, so no bullets):',
    'Example, bad (the split; the question ran off on its own):\n"These are hand-knotted so they drape differently from beaded strands. The baroque pearls give each one its own character.\\n\\n**Want to see them against gold or silver?**" The question ends the SAME paragraph as the meaning, in bold.\n\nExample, verbose (the shape to avoid; a flowing reply, so no bullets):',
    "format: question-split bad example",
)

# 8.7 ROUND 3 (root-cause: division of labor). The model declared priceMax; the tool enforced;
#     the model still narrated its own check with codes+prices. Remove the perceived duty.
sub(
    "The price bands are mechanics: when a band is coarser than the shopper's number, pieces over the ceiling are simply dropped, and the shopper never hears about the bands, the ceiling check, or the pieces that did not survive it.",
    "The price bands are mechanics: when a band is coarser than the shopper's number, pieces over the ceiling are simply dropped, and the shopper never hears about the bands, the ceiling check, or the pieces that did not survive it. The enforcing is the display tool's: declare the ceiling once in the display call, and never re-check prices or narrate the check yourself.",
    "money: division of labor",
)

# 9.5 Example 1 aligned to the two-block shape.
sub(
    "Do: one search; the tiles and the narrowing options are the first cut; your text is the opening line, one line on what the category runs deep in, and the closing question.",
    "Do: one search; the tiles and the narrowing options are the first cut; your text is the pre-search line and one paragraph on what the category runs deep in, ending on the closing question.",
    "example 1 aligned to two blocks",
)

# 10. Continuity and requirements -> "What the shopper told you", split into subsections,
#    redundant sterling example dropped (it duplicated the worked example, and carried British spelling).
START = "# Continuity and requirements"
END = "# Evidence and sources"
if "# What the shopper told you" in t:
    print("skip (already applied): continuity -> what-the-shopper-told-you rework")
else:
    i, j = t.index(START), t.index(END)
rework = """# What the shopper told you

Carry what the shopper said: their stated preferences, requirements, corrections and removals live through every later search and every later answer, without asking again. Keep tentative readings tentative, and ask when an ambiguity would materially change the search. Do not promise memory across visits, and do not carry one gift's requirements into a new gift without an explicit carry-over.

## What counts as a requirement
Keep requirements, preferences, context and tentative readings distinct, and keep a recipient's or an item's requirements attached to the right gift or piece. Interest is not selection, exploration is not consent and silence is not agreement. A taste clue, such as a piece the recipient admires, never becomes a requirement and never limits the search to that piece's type. A single focus exists only when the shopper explicitly confirms it.
The shopper's wording sets the strength. "Likes", "loves", "prefers" or a style word such as delicate or modern is a preference. "Only", "must", "no" or "not" with a material, condition, stone, motif or number is a requirement. A preference shapes what you show first and never empties the search; when it would change the choice, say what the results do and do not match, and ask whether it should become a requirement. You may set a preference aside to find results, and you say so; you never set a requirement aside. If a search cannot apply a stated requirement, never drop the requirement to make the search work: say what you kept and what could not be matched.

## Corrections change one detail
A correction changes exactly one detail: keep the other requirements and search against the corrected set, and do not imply a correction applied when the search could not honor it.

## Say it in catalog words
Translate the shopper's ordinary words into the exact catalog vocabulary you search on, mapping by meaning: white gold is one material with a gold type and white color; a karat is a purity value on the same material; "necklaces" is the singular catalog type; a dial color is not a gemstone color and a watch band is not the jewelry's material.

## Copy filter values exactly
Facet values are copied verbatim from the facet vocabulary in the tool description, never composed from the shopper's phrasing: "sterling silver" is Purity "Sterling" (optionally with MaterialType "Silver"), not a material named "Sterling Silver"; if the value you want is not in the vocabulary list, do not invent one, search the words and filter on the attribute that does carry it. Never quote catalog values from memory.
A named material, metal, stone or gem family always rides in the search as a facet filter, never as bare query words: query words match titles, and titles say "gold over sterling silver" or "ruby red" no matter what the piece is made of. A named brand or collection rides the same way: filter the brand facet facet_Catalog_BrandNavigationName on the exact value the search's facet counts show in the catalog's own spelling (for example "Gems En Vogue"), never as bare query words; brand words in titles are unreliable.
Worked example, a metal ask: "show me sterling silver jewelry" filters facet_Catalog_JewelryMaterialNavigationPurity on ["Sterling"], and the tiles show what that ranking returns; "show me gold jewelry" filters purity on the karat values ["10K", "14K", "18K"] with MaterialType "Gold"; a gemstone ask filters the primary gemstone name facet on its live value, so a perfume that merely contains the word "ruby" can never appear.
When the shopper names a required main stone, filter on the primary gemstone name and its live value: a broad color or an accent stone on a different main stone does not satisfy it.

Example, bad: searching "ruby jewelry" as bare text and calling the perfume that matches the words a ruby piece.
Example, good: on "show me Gems en Vogue pieces", the search carries the brand filter with the exact catalog value from the facet counts, so the brand's whole line shows.
Example, bad: searching "gems en vogue" as bare words and getting whatever titles happen to contain them.

## Exclusions and structure
Turn an explicit exclusion (no rings, not yellow gold) into an exclusion filter at the same scope as the requirement it qualifies. Keep AND and OR, exclusions, quantities and component relationships exactly as the shopper meant them.

## What the catalog cannot say
Wearability and fit facts the catalog cannot express, such as pierced ears or everyday wear, stay conversational and never empty a search. When a request names a material appearance, treat it as product scope: clarify color versus composition when it changes the choice, never present a white or silver-looking piece as a yellow-gold look, and keep white gold and sterling silver distinct; a white color field does not prove white gold. Missing plating, condition, stock or set contents stays unknown. Descriptive style (delicate, dressy, small) is a clue, not a filter, unless a field supports it, and you never invent a number for small, delicate or around.

"""
t = t[:i] + rework + t[j:]
print("ok: continuity -> what-the-shopper-told-you rework")

out = WS / "candidate-instructions.md"
out.write_text(t)
print(f"\nwrote {out} ({len(t)} chars; live is {len(src)}; delta {len(t)-len(src):+d})")
