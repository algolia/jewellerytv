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

  /* The label is the price now. An on-air record has none, which is what
   * distinguishes the two shapes, so it keeps its name. */
  it('labels a catalogue piece with its price and an on-air piece with its name', () => {
    const catalogue = render({
      objectID: 'XTP21',
      Catalog_TitleDescription: 'Sterling Silver Chain',
      Media_Images: ['https://img/xtp21.jpg'],
      Pricing_ActivePrice: 158.99,
    } as unknown as JtvHit);
    expect(catalogue).toContain('>$158.99<');
    /* The name is not lost — it carries the tile's accessible name, since the
     * label alone would tell a reader who cannot see the photograph only what
     * the piece costs. */
    expect(catalogue).toContain('alt="Sterling Silver Chain"');

    const onAir = render({
      objectID: 'MFP125',
      name: 'Moissanite Platineve Ring',
      imageLarge: 'https://img/mfp125.jpg',
    } as JtvHit);
    expect(onAir).toContain('>Moissanite Platineve Ring<');
  });

  it('formats a whole amount without empty cents', () => {
    const html = render({
      objectID: 'R1',
      Catalog_TitleDescription: 'Band',
      Pricing_ActivePrice: 129,
    } as unknown as JtvHit);
    expect(html).toContain('>$129<');
  });

  /* Truthiness would swallow this one and label it with its title. */
  it('labels a zero-priced piece with its price, not its name', () => {
    const html = render({
      objectID: 'Z1',
      Catalog_TitleDescription: 'Gift With Purchase',
      Pricing_ActivePrice: 0,
    } as unknown as JtvHit);
    expect(html).toContain('>$0<');
  });

  /* The gate refuses imageless pieces whose record it has, but a record still
   * streaming reaches the tile. It has to hold its box rather than collapse
   * the carousel row. */
  it('holds the tile box when a record arrives with no image', () => {
    const html = render({ objectID: 'C3', Catalog_TitleDescription: 'Imageless' } as JtvHit);
    expect(html).toContain('jtv-chat-card-image');
    expect(html).toContain('Image unavailable');
    expect(html).toContain('Imageless');
  });

  it('falls back to the objectID when a record has no name at all', () => {
    const html = render({ objectID: 'ZNBR29' } as JtvHit);
    expect(html).toContain('ZNBR29');
  });
});
