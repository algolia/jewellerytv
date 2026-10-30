#!/usr/bin/env python3
"""Apply the single round-3 addition (division of labor) to the fresh live dev pull.
Everything else from the walkthrough is already live (verified by grep). Asserts
exactly one occurrence, writes candidate-instructions.md, does NOT touch the agent."""
import sys, pathlib

WS = pathlib.Path("/Users/arijitchowdhury/Dropbox/AI-Development/jewellerytv/docs/workspace/prompt-review-2026-10-26")
t = (WS / "live/dev-instructions.md").read_text()

old = "The price bands are mechanics: when a band is coarser than the shopper's number, pieces over the ceiling are simply dropped, and the shopper never hears about the bands, the ceiling check, or the pieces that did not survive it."
new = old + " The enforcing is the display tool's: declare the ceiling once in the display call, and never re-check prices or narrate the check yourself."

if "The enforcing is the display tool's" in t:
    print("skip: already applied")
    sys.exit(0)
n = t.count(old)
if n != 1:
    sys.exit(f"FAIL: anchor found {n} times")
t = t.replace(old, new)
out = WS / "candidate-instructions.md"
out.write_text(t)
print(f"wrote {out} ({len(t)} chars; live was {len((WS / 'live/dev-instructions.md').read_text())})")
