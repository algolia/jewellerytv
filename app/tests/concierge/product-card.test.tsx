import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProductCard, type JtvHit } from '../../src/concierge/chat/ProductCard';

/* One tile renders two record shapes. The catalogue indices name a piece in
 * Catalog_TitleDescription with Media_Images; the on-air indices carry `name`
 * and `image` with the catalogue SKU as objectID. Reading only the first shape
 * is what put "Image unavailable | MFP125" on an on-air shelf. */

/* sendEvent is required by the library's item-component contract and unused
 * by this tile; the no-op keeps the test honest to the real signature. */
const render = (item: JtvHit) =>
  renderToStaticMarkup(<ProductCard item={item} sendEvent={() => undefined} />);

describe('the product tile', () => {
  it('renders a catalogue record', () => {
    const html = render({
      objectID: 'XTP21',
      Catalog_TitleDescription: 'Sterling Silver Chain',
      Media_Images: ['https://img/xtp21.jpg'],
    } as JtvHit);
    expect(html).toContain('Sterling Silver Chain');
    expect(html).toContain('https://img/xtp21.jpg');
    expect(html).toContain('/product/XTP21');
  });

  it('renders an on-air record, which names its fields differently', () => {
    const html = render({
      objectID: 'MFP125',
      name: 'Moissanite Platineve Ring',
      imageLarge: 'https://img/mfp125.jpg',
    } as JtvHit);
    expect(html).toContain('Moissanite Platineve Ring');
    expect(html).toContain('https://img/mfp125.jpg');
  });

  /* The tile is the photograph and nothing else (2026-11-06): no price, no
   * name under it. What a tile must still guarantee is that the piece is
   * identifiable without seeing the picture. */
  it('carries the piece name without printing it', () => {
    const html = render({
      objectID: 'XTP21',
      Catalog_TitleDescription: 'Sterling Silver Chain',
      Media_Images: ['https://img/xtp21.jpg'],
      Pricing_ActivePrice: 158.99,
    } as unknown as JtvHit);
    expect(html).toContain('alt="Sterling Silver Chain"');
    expect(html).toContain('aria-label="Sterling Silver Chain"');
  });

  it('prints no price, whatever the record carries', () => {
    for (const price of [158.99, 129, 0]) {
      const html = render({
        objectID: 'R1',
        Catalog_TitleDescription: 'Band',
        Pricing_ActivePrice: price,
      } as unknown as JtvHit);
      expect(html, String(price)).not.toContain('$');
    }
  });

  /* The gate refuses imageless pieces whose record it has, but a record still
   * streaming reaches the tile. It has to hold its box rather than collapse
   * the row, and still say which piece it is. */
  it('holds the tile box when a record arrives with no image', () => {
    const html = render({ objectID: 'C3', Catalog_TitleDescription: 'Imageless' } as JtvHit);
    expect(html).toContain('jtv-chat-card-image');
    expect(html).toContain('Image unavailable');
    expect(html).toContain('aria-label="Imageless"');
  });

  it('falls back to the objectID when a record has no name at all', () => {
    const html = render({ objectID: 'ZNBR29' } as JtvHit);
    expect(html).toContain('ZNBR29');
  });
});
