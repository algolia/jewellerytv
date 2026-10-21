import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Check, Copy, Heart, X } from 'lucide-react';
import { useShopping, type PinnedProduct } from './ShoppingProvider';
import { type Product } from './catalog';
import { productURL } from './routing';
import './product-workspace.css';
import { markWorkspace, markWorkspaceImage, type WorkspaceTraceBinding } from './telemetry';
import { checkBriefConflicts } from '../shared/briefConstraints';
import { useCatalogVocabulary } from './concierge/useCatalogVocabulary';
import type { ProductRefreshOutcome } from './concierge/exactProductRefresh';
export type View = 'discover' | 'compare' | 'saved';
type PresentationModeName = 'three_style_grid' | 'focused_choice';
type Discovery = {
  title: string;
  why?: string;
  mode?: PresentationModeName;
  items: { product: Product; why?: string; assessment?: 'compliant' | 'unknown' }[];
};
export type WorkspaceViewModel = {
  products: PinnedProduct[];
  selectionRecords: Product[];
  discoveries: Discovery[];
  discoveriesStale?: boolean;
  discoveryUnavailable?: boolean;
  proposedLooks?: {
    title: string;
    lines: { product: Product; why: string; quantity: number }[];
    itemSubtotalCents: number | null;
  }[];
  displayIntro?: string;
  comparisonIntro?: string;
  activeView: View;
  setView: (v: View) => void;
  compareIds: string[];
  toggleCompare: (id: string) => void;
  pin: (raw: unknown) => void;
  remove: (id: string) => void;
  refreshProducts: (ids: string[]) => Promise<ProductRefreshOutcome>;
  refreshing: boolean;
  refreshError: string;
  assessment?: (product: Product, retrievalStatus?: 'compliant' | 'unknown') => ReactNode;
};
type ProductShopping = WorkspaceViewModel & { brief?: import('../shared/briefSchema').BriefState };
const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function workspaceSaveAction(model: WorkspaceViewModel, product: Product) {
  return model.products.some((item) => item.product.id === product.id)
    ? model.remove(product.id)
    : model.pin(product.raw);
}
export function workspaceCompareAction(model: WorkspaceViewModel, product: Product) {
  return model.toggleCompare(product.id);
}
function PlainText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*)/g)
        .map((part, i) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : (
            part
          ),
        )}
    </>
  );
}
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
function ProductImage({
  product,
  binding,
  decorative = false,
}: {
  product: Product;
  binding?: WorkspaceTraceBinding;
  decorative?: boolean;
}) {
  const images = product.images;
  const [cursor, setCursor] = useState({ index: 0, attempt: 0, failed: false });
  const img = useRef<HTMLImageElement>(null);
  const imagesKey = images.join('\n');
  const source = images[cursor.index];
  const report = (outcome: 'loaded' | 'failed') => {
    if (binding) markWorkspaceImage(binding, `${product.id}:${source}`, outcome);
  };
  useEffect(() => {
    setCursor({ index: 0, attempt: 0, failed: false });
  }, [product.id, imagesKey]);
  useEffect(() => {
    if (img.current?.complete && source) report(img.current.naturalWidth > 0 ? 'loaded' : 'failed');
  }, [source, cursor.attempt, binding?.requestId]);
  return (
    <div className="pw-image">
      {source && !cursor.failed ? (
        <img
          key={`${cursor.index}:${cursor.attempt}`}
          ref={img}
          src={source}
          alt={decorative ? '' : product.title}
          loading="lazy"
          onLoad={() => report('loaded')}
          onError={() => {
            report('failed');
            setCursor((current) => nextImageCursor(images.length, current));
          }}
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

/**
 * One scannable spec line for Discover tiles: fit sizes with their catalogue
 * unit labels ("18 Inch", "Size 6") plus metal color and purity so a chain
 * length is never misread as a karat. Values come verbatim from the record;
 * nothing here repeats the title or invents a claim.
 */
function compactSpecs(p: Product): string | null {
  const parts: string[] = [];
  const sizeLabels = p.sizes.map((size) => size.label);
  const numeric = sizeLabels.filter((label) => /^\d+(\.\d+)?$/.test(label));
  if (numeric.length > 1) {
    parts.push(`Sizes ${numeric[0]}-${numeric[numeric.length - 1]}`);
  } else if (sizeLabels.length === 1) {
    parts.push(sizeLabels[0]);
  } else if (sizeLabels.length > 1) {
    parts.push(sizeLabels.slice(0, 2).join(', '));
  }
  for (const label of ['Material color', 'Material purity'] as const) {
    const value = p.attributes.find((attribute) => attribute.label === label)?.value;
    if (value) parts.push(value);
  }
  return parts.length ? parts.join(' • ') : null;
}

export function ProductWorkspace({
  onAsk,
  onStart,
  model,
  focusProductId,
  focusProductRequest,
  onPreviewClose,
}: {
  onAsk?: (text: string) => void;
  onStart?: () => void;
  model?: WorkspaceViewModel;
  focusProductId?: string | null;
  focusProductRequest?: number;
  onPreviewClose?: () => void;
}) {
  const legacy = useShopping();
  const location = typeof window === 'undefined' ? { pathname: '/', search: '' } : window.location;
  const raw = model ?? legacy;
  const supplied = !!model;
  const vocabulary = useCatalogVocabulary();
  const [previewId, setPreviewId] = useState<string | null>(null);
  useEffect(() => {
    if (!previewId || !raw) return;
    const exists =
      raw.products.some((p) => p.product.id === previewId) ||
      raw.selectionRecords.some((p) => p.id === previewId) ||
      raw.discoveries.some((g) => g.items.some((i) => i.product.id === previewId));
    if (!exists) setPreviewId(null);
  }, [previewId, raw?.products, raw?.selectionRecords, raw?.discoveries]);
  const displayBinding = legacy?.displayTrace;
  const displayCount = raw?.discoveries.reduce((n, g) => n + g.items.length, 0) ?? 0;
  useLayoutEffect(() => {
    if (!displayBinding || !displayCount) return;
    markWorkspace(displayBinding, 'commit', displayCount);
    let afterPaint = 0;
    const beforePaint = requestAnimationFrame(() => {
      afterPaint = requestAnimationFrame(() =>
        markWorkspace(displayBinding, 'paint-observed', displayCount),
      );
    });
    return () => {
      cancelAnimationFrame(beforePaint);
      cancelAnimationFrame(afterPaint);
    };
  }, [displayBinding?.requestId, displayBinding?.revision, displayCount]);
  useEffect(() => {
    if (!focusProductId || !raw) return;
    const exists =
      raw.products.some((p) => p.product.id === focusProductId) ||
      raw.selectionRecords.some((p) => p.id === focusProductId) ||
      raw.discoveries.some((g) => g.items.some((i) => i.product.id === focusProductId));
    if (exists) setPreviewId(focusProductId);
  }, [focusProductId, focusProductRequest, raw?.products, raw?.selectionRecords, raw?.discoveries]);
  if (!raw) return null;
  // This view consumes the provider contract; the provider remains the sole state owner.
  const s = raw as ProductShopping;
  const discoveries = s.discoveries ?? [];
  const view = s.activeView ?? 'discover';
  const byId = new Map<string, Product>();
  /* Store records are set after the discovery copies so a refreshed record
   * (H2: price/stock from the exact read) wins over the copy staged with the
   * presentation; saved products still resolve last. */
  discoveries.forEach((g) => g.items.forEach((i) => byId.set(i.product.id, i.product)));
  s.selectionRecords.forEach((p) => byId.set(p.id, p));
  s.products.forEach((p) => byId.set(p.product.id, p.product));
  const activePreview = previewId && byId.has(previewId) ? previewId : null;
  const selectedIds = s.compareIds;
  const selected = selectedIds.flatMap((id) => {
    const product = byId.get(id);
    return product ? [{ product }] : [];
  });
  const comparisonValues = selected.map(({ product }) => {
    const facts = new Map<string, string>();
    if (product.brand) facts.set('Brand', product.brand);
    product.attributes.forEach((attribute) => {
      if (attribute.value.trim()) facts.set(attribute.label, attribute.value);
    });
    return facts;
  });
  const comparisonLabels = Array.from(
    new Set(comparisonValues.flatMap((facts) => [...facts.keys()])),
  );
  const comparisonFacts = comparisonLabels.map((label) => ({
    label,
    values: comparisonValues.map((facts) => facts.get(label) ?? null),
  }));
  const missing = selectedIds.filter((id) => !byId.has(id)).length;
  function imageBinding(p: Product) {
    return discoveries.some((g) => g.items.some((i) => i.product.id === p.id))
      ? displayBinding
      : undefined;
  }
  function assessment(p: Product, retrievalStatus?: 'compliant' | 'unknown') {
    if (supplied && s.assessment) return s.assessment(p, retrievalStatus);
    if (retrievalStatus !== undefined)
      return retrievalStatus === 'unknown' ? (
        <details className="pw-status">
          <summary>Needs verification</summary>
        </details>
      ) : null;
    if (supplied || !s.brief) return null;
    const result = checkBriefConflicts(s.brief, p.raw, vocabulary?.values);
    if (result.status === 'compliant') return null;
    return (
      <details className={result.status === 'conflict' ? 'pw-error' : 'pw-status'}>
        <summary>
          {result.status === 'conflict' ? 'Check against your brief' : 'Needs verification'}
        </summary>
        {result.reasons.length > 0 && (
          <ul>
            {result.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {result.status === 'conflict' && onAsk && (
          <button
            onClick={() =>
              onAsk(`Find an alternative to ${p.title} (${p.id}) that fits my current brief.`)
            }
          >
            Find an alternative
          </button>
        )}
      </details>
    );
  }
  async function changeView(next: View) {
    setPreviewId(null);
    s.setView(next);
    const ids =
      next === 'compare'
        ? s.compareIds
        : next === 'saved'
          ? s.products.map((p) => p.product.id)
          : [];
    if (ids.length) await s.refreshProducts(ids);
  }
  function actions(p: Product) {
    const saved = s.products.some((x) => x.product.id === p.id);
    const comparing = s.compareIds.includes(p.id);
    return (
      <div className="pw-actions">
        <button
          type="button"
          aria-label={saved ? `Remove ${p.title} from saved` : `Save ${p.title}`}
          title={saved ? 'Remove from saved' : 'Save'}
          aria-pressed={saved}
          onClick={() => workspaceSaveAction(s, p)}
        >
          <Heart size={18} aria-hidden="true" fill={saved ? 'currentColor' : 'none'} />
          <span>{saved ? 'Saved' : 'Save'}</span>
        </button>
        <button
          type="button"
          aria-label={comparing ? `Remove ${p.title} from comparison` : `Compare ${p.title}`}
          title={comparing ? 'Remove from comparison' : 'Compare'}
          aria-pressed={comparing}
          disabled={!comparing && s.compareIds.length >= 3}
          onClick={() => workspaceCompareAction(s, p)}
        >
          {comparing ? (
            <Check size={18} aria-hidden="true" />
          ) : (
            <Copy size={18} aria-hidden="true" />
          )}
          <span>{comparing ? 'Comparing' : 'Compare'}</span>
        </button>
      </div>
    );
  }
  function tile(
    p: Product,
    why?: string,
    direction?: string,
    retrievalStatus?: 'compliant' | 'unknown',
    compact = false,
    showAssessment = false,
  ) {
    if (compact) {
      const stockLabel =
        p.inStock === true
          ? 'In stock'
          : p.inStock === false
            ? 'Out of stock'
            : 'Stock unavailable';
      const specs = compactSpecs(p);
      return (
        <article className="pw-product pw-product--discover" key={p.id} data-product-id={p.id}>
          <button
            type="button"
            className="pw-product-main"
            aria-label={`View details for ${p.title}, ${p.price === null ? 'price unavailable' : money(Math.round(p.price * 100))}; ${stockLabel}.`}
            onClick={() => {
              setPreviewId(p.id);
              void s.refreshProducts([p.id]);
            }}
          >
            <ProductImage product={p} binding={imageBinding(p)} decorative />
            <span className="pw-product-copy">
              <span className="pw-product-title">{p.title}</span>
              <span className="pw-price-stock">
                <Price product={p} />
                <span
                  className="pw-stock"
                  data-stock={p.inStock === null ? 'unknown' : String(p.inStock)}
                >
                  <span className="pw-stock-dot" aria-hidden="true" />
                  {stockLabel}
                </span>
              </span>
              {specs && <span className="pw-product-specs">{specs}</span>}
            </span>
          </button>
          {actions(p)}
          {showAssessment && (
            <div className="pw-evidence pw-saved-assessment">{assessment(p, retrievalStatus)}</div>
          )}
        </article>
      );
    }
    return (
      <article className="pw-product" key={p.id} data-product-id={p.id} tabIndex={-1}>
        <p className="pw-direction">{direction || ''}</p>
        <button
          className="pw-image-button"
          aria-label={`View details: ${p.title}`}
          onClick={() => {
            setPreviewId(p.id);
            void s.refreshProducts([p.id]);
          }}
        >
          <ProductImage product={p} binding={imageBinding(p)} />
        </button>
        <div className="pw-product-copy">
          <h3>{p.title}</h3>
          <Price product={p} />
          <p className="pw-why">{why && <PlainText text={why} />}</p>
          <div className="pw-evidence">
            <small>
              {p.inStock === true
                ? 'Listed in stock'
                : p.inStock === false
                  ? 'Listed unavailable'
                  : 'Availability not recorded'}
            </small>
            {assessment(p, retrievalStatus)}
          </div>
          {actions(p)}
        </div>
      </article>
    );
  }
  const mergedDiscoveries = new Map<string, Discovery>();
  for (const group of discoveries) {
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
      <nav className="pw-views" aria-label="Product views">
        {(['discover', 'compare', 'saved'] as View[]).map((v) => (
          <button
            key={v}
            aria-current={view === v ? 'page' : undefined}
            onClick={() => void changeView(v)}
          >
            {v === 'discover' ? 'Discover' : v === 'compare' ? 'Compare' : 'Save'}
          </button>
        ))}
      </nav>
      {s.refreshing && (
        <p className="pw-status" role="status">
          Checking the latest catalogue details…
        </p>
      )}
      {s.refreshError && (
        <p className="pw-error" role="alert">
          {s.refreshError}
        </p>
      )}
      {activePreview && (
        <section className="pw-preview" aria-label="Product preview">
          <button
            onClick={() => {
              setPreviewId(null);
              onPreviewClose?.();
            }}
          >
            Back to choices
          </button>
          <ProductImage
            product={byId.get(activePreview!)!}
            binding={imageBinding(byId.get(activePreview!)!)}
          />
          <h3>{byId.get(activePreview!)!.title}</h3>
          <Price product={byId.get(activePreview!)!} />
          <p>{byId.get(activePreview!)!.description}</p>
          <a
            className="pw-pdp-link"
            href={productURL(byId.get(activePreview!)!.id, location.pathname, location.search)}
          >
            View product page
          </a>
          <dl>
            {byId.get(activePreview!)!.attributes.map((a) => (
              <div key={a.label}>
                <dt>{a.label}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
          {actions(byId.get(activePreview!)!)}
        </section>
      )}
      {!activePreview && view === 'discover' && (
        <div className="pw-discover">
          {!discoveries.length ? (
            s.discoveryUnavailable ? (
              <EmptyProducts hint="No confirmed matches are ready to show." />
            ) : (
              <DiscoverWelcome onStart={onStart} />
            )
          ) : (
            <>
              {s.discoveriesStale && (
                <p className="pw-previous-note" role="status">
                  Showing your previous choices.
                </p>
              )}
              {completeDiscoveryGrid ? (
                <div className="pw-discovery-intro">
                  <h2 className="pw-discovery-title">
                    Three different types, two variations of each type.
                  </h2>
                  <p className="pw-discovery-subtitle">
                    Explore each style, then save or compare the pieces you like.
                  </p>
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
                        {group.items.map(({ product }) =>
                          tile(byId.get(product.id) ?? product, undefined, undefined, undefined, true),
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
      {!activePreview && view === 'saved' && (
        <div className="pw-saved">
          {!!s.proposedLooks?.length && (
            <div className="pw-proposed-looks" aria-label="Concierge look options">
              {s.proposedLooks.map((look, index) => (
                <section className="pw-discovery-group" key={`${look.title}-${index}`}>
                  <h3>{look.title}</h3>
                  <div className="pw-group-items">
                    {look.lines.map(({ product, why }) =>
                      tile(
                        product,
                        why,
                        s.products.some((x) => x.product.id === product.id) ? 'Saved ✓' : undefined,
                      ),
                    )}
                  </div>
                  <p className="pw-subtotal">
                    <span>
                      {look.itemSubtotalCents === null ? 'Known item subtotal' : 'Item subtotal'}
                    </span>
                    <strong>
                      {look.itemSubtotalCents === null
                        ? 'Unavailable'
                        : money(look.itemSubtotalCents)}
                    </strong>
                  </p>
                </section>
              ))}
            </div>
          )}
          {s.products.length ? (
            <div className="pw-grid">
              {s.products.map(({ product }) =>
                tile(product, undefined, undefined, undefined, true, true),
              )}
            </div>
          ) : (
            <EmptyProducts hint="Save a piece you like, and keep it here." />
          )}
        </div>
      )}
      {!activePreview && view === 'compare' && (
        <div className="pw-selection">
          {missing > 0 && (
            <p className="pw-error">
              {missing} selected piece{missing > 1 ? 's need' : ' needs'} to be retrieved again
              before we can show a complete comparison.
            </p>
          )}
          {!selected.length ? (
            <EmptyProducts hint="Choose Compare on up to three pieces in Discover or Save." />
          ) : (
            <>
              <p className="pw-intro">
                <PlainText text="The details that make each piece different. A missing detail stays unknown." />
              </p>
              <div
                className="pw-comparison"
                data-count={selected.length}
                data-view="compare"
                style={
                  {
                    '--pw-comparison-row-count': 5 + comparisonFacts.length,
                    '--pw-comparison-fact-count': comparisonFacts.length,
                  } as CSSProperties
                }
              >
                {selected.map(({ product: p }, productIndex) => (
                  <article className="pw-compare-product" key={p.id} data-product-id={p.id}>
                    <button
                      type="button"
                      className="pw-compare-image"
                      aria-label={`View details for ${p.title}`}
                      onClick={() => {
                        setPreviewId(p.id);
                        void s.refreshProducts([p.id]);
                      }}
                    >
                      <ProductImage product={p} binding={imageBinding(p)} decorative />
                    </button>
                    <button
                      type="button"
                      className="pw-compare-title"
                      aria-label={`View details for ${p.title}`}
                      onClick={() => {
                        setPreviewId(p.id);
                        void s.refreshProducts([p.id]);
                      }}
                    >
                      {p.title}
                    </button>
                    <Price product={p} />
                    <div className="pw-compare-assessment">{assessment(p)}</div>
                    {comparisonFacts.length > 0 && (
                      <dl className="pw-compare-attributes">
                        {comparisonFacts.map(({ label, values }) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{values[productIndex] || 'Not recorded'}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <div className="pw-compare-actions">
                      <div className="pw-actions">
                        <button
                          type="button"
                          aria-label={
                            s.products.some((x) => x.product.id === p.id)
                              ? `Remove ${p.title} from saved`
                              : `Save ${p.title}`
                          }
                          title={
                            s.products.some((x) => x.product.id === p.id)
                              ? 'Remove from saved'
                              : 'Save'
                          }
                          aria-pressed={s.products.some((x) => x.product.id === p.id)}
                          onClick={() => workspaceSaveAction(s, p)}
                        >
                          <Heart
                            size={18}
                            aria-hidden="true"
                            fill={
                              s.products.some((x) => x.product.id === p.id)
                                ? 'currentColor'
                                : 'none'
                            }
                          />
                          <span>
                            {s.products.some((x) => x.product.id === p.id) ? 'Saved' : 'Save'}
                          </span>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="pw-compare-remove"
                        aria-label={`Remove ${p.title} from comparison`}
                        title="Remove from comparison"
                        onClick={() => s.toggleCompare(p.id)}
                      >
                        <X size={16} aria-hidden="true" />
                        <span>Remove</span>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <p className="pw-footnote">
                Catalogue prices and details can change. Taxes, shipping and any discounts need
                checking before purchase.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
