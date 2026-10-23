import { useMemo } from 'react';
import type { Product } from '../catalog';
import { InlineProductCards } from './InlineProductCards';
import type { FacetPick } from './nativeResults';

/* Facet chips spike (2026-10-23): renders the model's displayFacets pick as
 * label rows (values verbatim from the index, no counts), a top-relevancy
 * preview grid from the same streamed response, and tap-refined results.
 * Single-select; a message without a pick never renders this component. */

export type ChipRow = { attribute: string; label: string; values: string[] };

export function humanizeAttribute(attribute: string): string {
  let label = attribute.split('.').pop() ?? attribute;
  label = label.replace(/^Catalog_/, '');
  const spaced = label.replace(/([a-z])([A-Z])/g, '$1 $2');
  const trimmed = spaced.replace(/^(Watch|Jewelry)\s+/i, '');
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export const CHIP_VALUES_MAX = 6;

export function buildChipRows(pick: FacetPick): ChipRow[] {
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

export function FacetChips({
  pick,
  preview,
  active,
  results,
  loading,
  onSelect,
  onClear,
}: {
  pick: FacetPick;
  preview: Product[];
  active: { attribute: string; value: string } | null;
  results: Product[] | null;
  loading: boolean;
  onSelect: (attribute: string, value: string) => void;
  onClear: () => void;
}) {
  const rows = useMemo(() => buildChipRows(pick), [pick]);
  if (!rows.length) return null;
  return (
    <div className="connected-facet-chips">
      {rows.map((row) => (
        <section key={row.attribute}>
          <h4 className="connected-facet-label">{row.label}</h4>
          <div className="connected-facet-row">
            {row.values.map((value) => (
              <button
                type="button"
                key={value}
                className="connected-facet-chip"
                aria-pressed={
                  !!active && active.attribute === row.attribute && active.value === value
                }
                onClick={() => onSelect(row.attribute, value)}
              >
                {value}
              </button>
            ))}
          </div>
        </section>
      ))}
      {active ? (
        <div className="connected-facet-results">
          <button type="button" className="connected-facet-back" onClick={onClear}>
            ‹ All facets
          </button>
          <p className="connected-inline-results-line" role="status">
            {loading
              ? 'Loading…'
              : `${active.value} ${rowLabel(rows, active.attribute).toLowerCase()}`}
          </p>
          {results && results.length ? (
            <InlineProductCards
              groups={[
                {
                  title: `${active.value} ${rowLabel(rows, active.attribute)}`,
                  items: results.map((product) => ({ product })),
                },
              ]}
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

function rowLabel(rows: ChipRow[], attribute: string): string {
  return rows.find((row) => row.attribute === attribute)?.label ?? attribute;
}
