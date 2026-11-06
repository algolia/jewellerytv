import { describe, expect, it } from 'vitest';
import { linkIntent } from '../../src/concierge/chat/linkTarget';

const HOST = 'shop.example.com';
const plain = { defaultPrevented: false, button: 0 };
const anchor = (href: string, host = HOST) => ({
  getAttribute: () => href,
  host,
  href: /^https?:/i.test(href) ? href : `https://${HOST}${href}`,
});

describe('where a click inside the panel goes', () => {
  /* The measured regression: a tile is a plain anchor, so the click reloaded
   * the storefront and the panel came back closed and empty. */
  it('routes a product tile through the host', () => {
    expect(linkIntent(plain, anchor('/product/DOQ222'), HOST)).toEqual({
      kind: 'internal',
      path: '/product/DOQ222',
    });
  });

  it('routes a same-host absolute link, keeping path and query', () => {
    expect(linkIntent(plain, anchor(`https://${HOST}/search?q=opal`), HOST)).toEqual({
      kind: 'internal',
      path: '/search?q=opal',
    });
  });

  it('opens an outbound link away from the storefront', () => {
    const out = anchor('https://www.jtv.com/live', 'www.jtv.com');
    expect(linkIntent(plain, out, HOST)).toEqual({
      kind: 'external',
      href: 'https://www.jtv.com/live',
    });
  });

  /* The browser already does the right thing with these, and taking them
   * over would break opening a piece in a new tab. */
  it('leaves modified and non-primary clicks alone', () => {
    for (const event of [
      { ...plain, metaKey: true },
      { ...plain, ctrlKey: true },
      { ...plain, shiftKey: true },
      { ...plain, altKey: true },
      { ...plain, button: 1 },
      { defaultPrevented: true, button: 0 },
    ]) {
      expect(linkIntent(event, anchor('/product/DOQ222'), HOST).kind, JSON.stringify(event)).toBe(
        'ignore',
      );
    }
  });

  it('leaves fragments and non-navigating schemes alone', () => {
    for (const href of ['#top', 'mailto:help@jtv.com', 'tel:+18005508393']) {
      expect(linkIntent(plain, anchor(href), HOST).kind, href).toBe('ignore');
    }
  });

  it('ignores a click on nothing', () => {
    expect(linkIntent(plain, null, HOST).kind).toBe('ignore');
    expect(linkIntent(plain, anchor(''), HOST).kind).toBe('ignore');
  });
});
