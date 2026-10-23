import type { MouseEvent } from 'react';
import type { Product } from '../catalog';
import { productURL } from '../routing';
import type { WorkspaceGroup } from '../workspaceResults';

/* Mobile anchored cards (2026-10-23): product cards rendered inside the
 * conversation, directly under the assistant answer whose grouped tool call
 * found them. Compact two-column tiles; tapping opens the product detail page
 * through the same verified-link path as the workspace tiles. The wrapper is
 * hidden on desktop (≥768px), where the side-by-side workspace stays. */

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/* The workspace tiles read the global `location` directly; that is unavailable
 * under static server rendering, so the href falls back to the plain PDP path. */
function cardHref(id: string): string {
  if (typeof location === 'undefined') return `/product/${encodeURIComponent(id)}`;
  return productURL(id, location.pathname, location.search);
}

export function InlineProductCards({
  groups,
  onProductLink,
}: {
  groups: WorkspaceGroup[];
  onProductLink?: (id: string, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  if (!groups.length) return null;
  return (
    <div className="connected-inline-cards">
      {groups.map((group) => (
        <section
          className="connected-inline-group"
          key={`${group.title}:${group.items.map((item) => item.product.id).join(',')}`}
        >
          <h4>{group.title}</h4>
          <div className="connected-inline-grid">
            {group.items.map(({ product }: { product: Product; why?: string }) => (
              <a
                className="connected-inline-card"
                key={product.id}
                data-product-id={product.id}
                href={cardHref(product.id)}
                aria-label={`View details for ${product.title}, ${
                  product.price === null
                    ? 'price unavailable'
                    : money(Math.round(product.price * 100))
                }.`}
                onClick={onProductLink ? (event) => onProductLink(product.id, event) : undefined}
              >
                <span className="connected-inline-image">
                  {product.images[0] ? (
                    <img src={product.images[0]} alt="" loading="lazy" />
                  ) : (
                    <span>Image unavailable</span>
                  )}
                </span>
                <span className="connected-inline-copy">
                  <span className="connected-inline-title">{product.title}</span>
                  <span className="connected-inline-price">
                    {product.price === null
                      ? 'Price unavailable'
                      : money(Math.round(product.price * 100))}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
