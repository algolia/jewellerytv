import type { RecommendItemComponentProps, RecordWithObjectID } from 'instantsearch-ui-components';

/* A `prod_catalog` record as the chat tiles read it. Price is deliberately
 * absent: the agent answers about fit and style, and a stale price next to an
 * answer reads as a quote. */
export type JtvRecord = {
  Catalog_TitleDescription?: string | null;
  Media_Images?: string[] | null;
  /* The on-air indices are a different shape: one record per product per
   * broadcast, named and imaged in their own fields. Their objectID is the
   * catalogue SKU, so the tile still links to the same product page. */
  name?: string | null;
  image?: string | null;
  imageLarge?: string | null;
  Pricing_PriceRange: string | null;
  price: number | null;
  listPrice: number | null;
};

export type JtvHit = RecordWithObjectID<JtvRecord>;

export function ProductCard({ item }: RecommendItemComponentProps<JtvHit>) {
  const title = item.Catalog_TitleDescription || item.name || item.objectID;
  const image = item.Media_Images?.[0] || item.imageLarge || item.image || undefined;
  return (
    <a className="jtv-chat-card" href={`/product/${encodeURIComponent(item.objectID)}`}>
      {/* A record without imagery still has to occupy the same tile box, or the
       * carousel rows jump as results stream in. */}
      <span className="jtv-chat-card-image">
        {image ? <img src={image} alt="" loading="lazy" /> : <span>Image unavailable</span>}
      </span>
      <span className="jtv-chat-card-title">{item.Pricing_PriceRange || item.price || item.listPrice}</span>
    </a>
  );
}

export default ProductCard;
