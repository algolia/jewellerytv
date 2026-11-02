# Tile layout variants

Three renderings of the same four `prod_catalog` records in the real panel at
1440 desktop, caching off, so the only difference is the tile layout.

| File | Layout | Label |
|---|---|---|
| `a-4across-price-only.png` | 4 columns, ~104px tiles | price only — **what ships today** |
| `b-3across-name-and-price.png` | 3 columns, ~140px tiles | name over price |
| `c-2across-name-and-price.png` | 2 columns, ~215px tiles | name over price |

## What they show

**A** is dense and anonymous. Four rings labelled $1267.99, $72.99, $253.29
and $164.99, with nothing to say which is which.

**B** is a half-measure: room to show a name, not enough to show a useful one
— "Ethiopian Opal Rhodium Over 14K White Gold Ring…" still truncates
mid-phrase. It also re-creates the stranded tile, since four pieces in three
columns is a row of three and one alone.

**C** is the only one where the name is readable in full. The images are large
enough to judge the stone, and the price reads as the price rather than as the
tile's identity.

## The point

The label was never the problem. Four tiles across a 480px rail leaves about
104px each, and nothing meaningful fits in 104px — which is why the price
looked like an improvement on the title. It is the only field short enough to
be true at that width.

Cost of C: four pieces per screen instead of eight. A group is capped at four,
so one group is one screen, and the rail has vertical space going spare.

If C is adopted, the `COLUMNS` constant in `gatedGroupedResults.tsx` has to
move with the grid or the orphan rule starts stranding tiles at the wrong
count.

Regenerate by re-adding the throwaway spec described in the commit that
introduced this folder; it is deliberately not kept in `tests/e2e`, since it
asserts nothing.
