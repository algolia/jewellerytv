import { InlineProductCards } from './InlineProductCards';
import type { Product } from '../shared/catalog';
import type { FacetPick } from './nativeResults';

/* Facet chips (2026-10-23): a cascading funnel, one level at a time. The
 * model's ordered displayFacets pick is the funnel order: level 1 renders
 * unlabeled (the values are self-evident), and each tap refines the search —
 * the NEXT level's values come from the refinement response's own facet
 * counts, computed within the selection, exactly like guided navigation.
 * A deeper level earns its label; level 1 does not. */

export type ChipRow = { attribute: string; label: string; values: string[] };

export function humanizeAttribute(attribute: string): string {
  let label = attribute.split('.').pop() ?? attribute;
  label = label.replace(/^Catalog_/, '');
  const spaced = label.replace(/([a-z])([A-Z])/g, '$1 $2');
  const trimmed = spaced.replace(/^(Watch|Jewelry)\s+/i, '');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export const CHIP_VALUES_MAX = 6;

export function buildChipRows(pick: Pick<FacetPick, 'displayFacets' | 'facets'>): ChipRow[] {
  return pick.displayFacets
    .map((attribute) => {
      const counts = pick.facets[attribute] ?? {};
      /* Guided-navigation order: most results first, capped so a deep facet
       * (30 ring types) cannot flood the row. Values stay verbatim. */
      const values = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, CHIP_VALUES_MAX)
        .map(([value]) => value);
      return { attribute, label: humanizeAttribute(attribute), values };
    })
    .filter((row) => row.values.length > 1);
}

export function FacetChips({ row, showLabel, preview, selections, results, loading, onSelect, onClear }: {
  row: ChipRow | null;
  showLabel: boolean;
  preview: Product[];
  selections: { attribute: string; value: string }[];
  results: Product[] | null;
  loading: boolean;
  onSelect: (attribute: string, value: string) => void;
  onClear: () => void;
}) {
  if (!row && !selections.length) return null;
  const last = selections[selections.length - 1] ?? null;
  return (
    <div className="connected-facet-chips">
      {row ? (
        <section key={row.attribute}>
          {showLabel ? <h4 className="connected-facet-label">{row.label}</h4> : null}
          <div className="connected-facet-row">
            {row.values.map((value) => (
              <button
                type="button"
                key={value}
                className="connected-facet-chip"
                aria-pressed={!!last && last.attribute === row.attribute && last.value === value}
                onClick={() => onSelect(row.attribute, value)}
              >
                {value}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {last ? (
        <div className="connected-facet-results">
          <button type="button" className="connected-facet-back" onClick={onClear}>
            ‹ All facets
          </button>
          <p className="connected-inline-results-line" role="status">
            {loading ? 'Loading…' : `${last.value}${row ? ` · ${row.label.toLowerCase()}` : ''}`}
          </p>
          {results && results.length ? (
            <InlineProductCards
              groups={[{ title: 'Selected', items: results.map((product) => ({ product })) }]}
              showHeadings={false}
            />
          ) : null}
        </div>
      ) : preview.length ? (
        <InlineProductCards
          groups={[{ title: 'A few from the top', items: preview.map((product) => ({ product })) }]}
          showHeadings={false}
        />
      ) : null}
    </div>
  );
}
