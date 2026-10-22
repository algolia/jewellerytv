import { useState, useEffect, useRef } from 'react';
import type { Product } from './catalog';
import { productURL } from './routing';
import './product-workspace.css';

/* Simplification 2026-10-22 (decisions D1 to D5): one discovery surface, no
 * tabs. A tile is the image, the name and one price; clicking it opens the
 * product detail page, where stock, sizes and checkout live. Save and Compare
 * are jtv.com features (Love List, cart), not concierge canvas actions. */
export type Discovery = {
  title: string;
  why?: string;
  mode?: 'three_style_grid' | 'focused_choice';
  items: { product: Product; why?: string }[];
};
export type WorkspaceViewModel = {
  discoveries: Discovery[];
  discoveriesStale?: boolean;
  discoveryUnavailable?: boolean;
};
const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
/** H2: what happens after an image fails to load. A transient failure must
 * not be cached as a permanent "Image unavailable": the component falls back
 * to the record's next image, retries the last one once, and only then shows
 * the honest label. Exported pure so the fallback order is testable without
 * a DOM. */
export const IMAGE_RETRY_LIMIT = 1;
export function nextImageCursor(
  imageCount: number,
  cursor: { index: number; attempt: number },
): { index: number; attempt: number; failed: boolean } {
  if (cursor.index < imageCount - 1)
    return { index: cursor.index + 1, attempt: 0, failed: false };
  if (cursor.attempt < IMAGE_RETRY_LIMIT)
    return { ...cursor, attempt: cursor.attempt + 1, failed: false };
  return { ...cursor, failed: true };
}
function ProductImage({ product }: { product: Product }) {
  const images = product.images;
  const [cursor, setCursor] = useState({ index: 0, attempt: 0, failed: false });
  const img = useRef<HTMLImageElement>(null);
  const imagesKey = images.join('\n');
  const source = images[cursor.index];
  useEffect(() => {
    setCursor({ index: 0, attempt: 0, failed: false });
  }, [product.id, imagesKey]);
  return (
    <div className="pw-image">
      {source && !cursor.failed ? (
        <img
          key={`${cursor.index}:${cursor.attempt}`}
          ref={img}
          src={source}
          alt=""
          loading="lazy"
          onError={() => setCursor((current) => nextImageCursor(images.length, current))}
        />
      ) : (
        <span>Image unavailable</span>
      )}
    </div>
  );
}
function DiscoverWelcome({ onStart }: { onStart?: () => void }) {
  return (
    <div className="pw-empty-brand">
      <h2 className="pw-empty-kicker">MAKE IT YOURS</h2>
      <p>Discover a new favorite in every shade, stone and style.</p>
      {onStart ? (
        <button className="pw-empty-cta" type="button" onClick={onStart}>
          SHOP NOW
        </button>
      ) : (
        <a className="pw-empty-cta" href="/search">
          SHOP NOW
        </a>
      )}
    </div>
  );
}
function EmptyProducts({ hint }: { hint: string }) {
  return (
    <div className="pw-empty-brand pw-empty-instruction">
      <p>{hint}</p>
    </div>
  );
}
function Price({ product }: { product: Product }) {
  return (
    <strong className="pw-price">
      {product.price === null ? 'Price unavailable' : money(Math.round(product.price * 100))}
    </strong>
  );
}
export function ProductWorkspace({
  onStart,
  model,
}: {
  onStart?: () => void;
  model?: WorkspaceViewModel;
}) {
  const location = typeof window === 'undefined' ? { pathname: '/', search: '' } : window.location;
  if (!model) return null;
  const mergedDiscoveries = new Map<string, Discovery>();
  for (const group of model.discoveries) {
    const title = group.title.trim();
    const key = title.toLowerCase();
    const existing = mergedDiscoveries.get(key);
    if (existing) existing.items.push(...group.items);
    else mergedDiscoveries.set(key, { ...group, title });
  }
  const seenDiscoveryIds = new Set<string>();
  const groupedDiscoveries = [...mergedDiscoveries.values()].slice(0, 3).flatMap((group) => {
    // Grid mode may carry a meaningful third row; every other presentation keeps
    // the accepted two-variant cap.
    const itemCap = group.mode === 'three_style_grid' ? 3 : 2;
    const items = group.items
      .filter((item) => {
        if (seenDiscoveryIds.has(item.product.id)) return false;
        seenDiscoveryIds.add(item.product.id);
        return true;
      })
      .slice(0, itemCap);
    return items.length ? [{ ...group, items }] : [];
  });
  const discoveredProductTypes = new Set(
    groupedDiscoveries
      .flatMap((group) => group.items.map(({ product }) => product.raw.Catalog_ProductType))
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim().toLocaleLowerCase()),
  );
  const headingFor = (group: Discovery) => {
    // Arijit, 2026-10-22: sub-category headings are one plain line naming the
    // style, never an attribute pipe. "Pearl | Drop & Dangle Earrings"
    // renders as "Pearl Drop & Dangle Earrings".
    const piped = group.title.split('|').map((part) => part.trim()).filter(Boolean);
    if (piped.length > 1) return piped.join(' ');
    const style = /^(.+?) style:\s*(.+)$/i.exec(group.title);
    if (style && discoveredProductTypes.size === 1 && discoveredProductTypes.has(style[1].toLowerCase()))
      return style[2].trim();
    const productType = /^Product type:\s*(.+)$/i.exec(group.title)?.[1]?.trim().toLocaleLowerCase();
    return productType && discoveredProductTypes.size === 1 && discoveredProductTypes.has(productType)
      ? null
      : group.title;
  };
  const completeDiscoveryGrid =
    groupedDiscoveries.length === 3 &&
    new Set(groupedDiscoveries.map((group) => group.title.trim().toLowerCase())).size === 3 &&
    groupedDiscoveries.every((group) => group.items.length === 2);
  return (
    <section className="product-workspace" aria-label="Shopping choices">
      {!groupedDiscoveries.length ? (
        model.discoveryUnavailable ? (
          <EmptyProducts hint="No confirmed matches are ready to show." />
        ) : (
          <DiscoverWelcome onStart={onStart} />
        )
      ) : (
        <>
          {model.discoveriesStale && (
            <p className="pw-previous-note" role="status">
              Showing your previous choices.
            </p>
          )}
          {completeDiscoveryGrid ? (
            <div className="pw-discovery-intro">
              {/* Arijit, 2026-10-22: one short open line replaces the long
                  grid description; the tiles carry the specifics. */}
              <h2 className="pw-discovery-title">Explore the category</h2>
            </div>
          ) : null}
          <div
            className="pw-discovery-groups"
            data-group-count={groupedDiscoveries.length}
            data-grid-complete={String(completeDiscoveryGrid)}
          >
            {groupedDiscoveries.map((group) => {
              const heading = headingFor(group);
              return (
                <div
                  className="pw-discovery-group"
                  key={`${group.title}:${group.items.map((item) => item.product.id).join(',')}`}
                >
                  {heading ? <h3>{heading}</h3> : null}
                  <div className="pw-group-items">
                    {group.items.map(({ product }) => (
                      <article
                        className="pw-product pw-product--discover"
                        key={product.id}
                        data-product-id={product.id}
                      >
                        <a
                          className="pw-product-main"
                          aria-label={`View details for ${product.title}, ${
                            product.price === null
                              ? 'price unavailable'
                              : money(Math.round(product.price * 100))
                          }.`}
                          href={productURL(product.id, location.pathname, location.search)}
                        >
                          <ProductImage product={product} />
                          <span className="pw-product-copy">
                            <span className="pw-product-title">{product.title}</span>
                            <Price product={product} />
                          </span>
                        </a>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
