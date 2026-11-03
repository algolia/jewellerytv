import type { RecommendItemComponentProps, RecordWithObjectID } from 'instantsearch-ui-components';

/* A `prod_catalog` record as the chat tiles read it.
 *
 * The label under a catalogue tile is the price band, not the name. JTV's
 * names are catalogue descriptions — "Ethiopian Opal Rhodium Over 14K White
 * Gold Ring 2.50ctw" — which truncate mid-phrase at this width and tell a
 * shopper less than the photograph already does; the band is short, scannable
 * and the thing they are deciding on.
 *
 * A band rather than the exact price on purpose. An exact figure beside an
 * answer about fit and style reads as a quote and goes stale between the
 * search and the glance; a band stays true far longer and promises less.
 *
 * On-air records have no price of their own, so they keep their name. That is
 * also the test for which shape a record is: no `Pricing_PriceRange`, no
 * band. */
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
  Pricing_ActivePrice: number | null;
  price: number | null;
  listPrice: number | null;
};

export type JtvHit = RecordWithObjectID<JtvRecord>;

/* A bare `57.97` next to a photograph is not a price, and `129` beside it
 * reads as a different kind of number again. Whole amounts lose the cents so
 * a shelf does not fill with ".00"; anything else keeps them. */
const WHOLE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
function money(value: number): string {
  return Number.isInteger(value) ? WHOLE.format(value) : CENTS.format(value);
}

export function ProductCard({ item }: RecommendItemComponentProps<JtvHit>) {
  const image = item.Media_Images?.[0] || item.imageLarge || item.image || undefined;
  /* Falls back to the name when there is no band — an on-air piece, or a
   * catalogue record whose retrieved attributes do not include
   * `Pricing_PriceRange`. A tile with no label at all is worse than a long
   * one. */
  const name = item.Catalog_TitleDescription || item.name || '';
  /* `|| name` would swallow a zero-priced piece and label it with its title
   * instead, so the test is for a number rather than for truthiness. */
  const label = typeof item.Pricing_ActivePrice === 'number' ? money(item.Pricing_ActivePrice) : name;
  return (
    <a className="jtv-chat-card" href={`/product/${encodeURIComponent(item.objectID)}`}>
      {/* A record without imagery still has to occupy the same tile box, or the
       * carousel rows jump as results stream in.
       *
       * The image carries the name. With the band as the visible label, the
       * link's accessible name would otherwise be "$25 - $50" and nothing
       * else — the one reader who cannot see the photograph would be the one
       * told least about the piece. */}
      <span className="jtv-chat-card-image">
        {image ? <img src={image} alt={name} loading="lazy" /> : <span>Image unavailable</span>}
      </span>
      <span className="jtv-chat-card-title">{label}</span>
    </a>
  );
}

export default ProductCard;
