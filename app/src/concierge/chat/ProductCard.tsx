import type { RecommendItemComponentProps, RecordWithObjectID } from 'instantsearch-ui-components';

/* A catalogue record as the chat tiles read it.
 *
 * The tile is the photograph and nothing else (2026-11-06). It carried a
 * price under it before, and before that a name; JTV asked for neither. A
 * name here is a catalogue description — "Ethiopian Opal Rhodium Over 14K
 * White Gold Ring 2.50ctw" — that truncates mid-phrase at this width, and a
 * price beside an answer about fit or style reads as a quote and goes stale
 * between the search and the glance. The photograph outperforms both, and
 * the product page carries the rest.
 *
 * The name is still read: it is the image's alt text, which is the only
 * thing a shopper who cannot see the photograph has. */
export type JtvRecord = {
  Catalog_TitleDescription?: string | null;
  Media_Images?: string[] | null;
  /* The on-air indices are a different shape: one record per product per
   * broadcast, named and imaged in their own fields. Their objectID is the
   * catalogue SKU, so the tile still links to the same product page. */
  name?: string | null;
  image?: string | null;
  imageLarge?: string | null;
};

export type JtvHit = RecordWithObjectID<JtvRecord>;

export function ProductCard({ item }: RecommendItemComponentProps<JtvHit>) {
  /* On-air records are a different shape — `image`/`imageLarge` rather than
   * `Media_Images` — so all three are tried before the tile gives up. */
  const image = item.Media_Images?.[0] || item.imageLarge || item.image || undefined;
  const name = item.Catalog_TitleDescription || item.name || '';
  return (
    <a
      className="jtv-chat-card"
      href={`/product/${encodeURIComponent(item.objectID)}`}
      /* The tile has no visible text, so the link needs its name here. The
       * alt text covers the case where an image rendered; this covers the
       * case where one did not, which would otherwise be a link announcing
       * nothing but its URL. */
      aria-label={name || item.objectID}
    >
      {/* A record without imagery still has to occupy the same tile box, or
       * the shelf reflows as pieces stream in.
       *
       * The alt text is the whole accessible name of the link, since there is
       * no visible text in the tile at all: without it the one reader who
       * cannot see the photograph would be told nothing about the piece. */}
      <span className="jtv-chat-card-image">
        {image ? <img src={image} alt={name} loading="lazy" /> : <span>Image unavailable</span>}
      </span>
    </a>
  );
}

export default ProductCard;
