/* Where a click inside the panel should go.
 *
 * Two kinds of link appear in a reply, and neither can be left to the
 * browser's default. An outbound one (the live stream, a show's replay page)
 * would navigate the storefront away and take the conversation with it. An
 * inbound one — a product tile, `/product/XYZ` — is worse, because it reads
 * as harmless: it is a plain anchor, so the click is a full page load, the
 * storefront remounts, and the panel comes back closed and empty. Measured
 * 2026-11-05: tapping a tile lost the whole transcript.
 *
 * So outbound links open in a new tab, and inbound ones are handed to the
 * host's router if it gave us one. The panel does not import a router
 * itself: it is embedded standalone in `src/embed`, where there is no router
 * to import, and the point of this file is that the decision is the host's. */

export type LinkIntent =
  { kind: 'ignore' } | { kind: 'external'; href: string } | { kind: 'internal'; path: string };

type ClickLike = {
  defaultPrevented?: boolean;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

type AnchorLike = { getAttribute(name: string): string | null; host?: string; href?: string };

/** The browser already opens a modified or non-primary click in a new tab or
 * window, and that is the behaviour a shopper asked for. */
function isPlainClick(event: ClickLike): boolean {
  if (event.defaultPrevented) return false;
  if (typeof event.button === 'number' && event.button !== 0) return false;
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

export function linkIntent(
  event: ClickLike,
  anchor: AnchorLike | null | undefined,
  currentHost: string,
): LinkIntent {
  if (!isPlainClick(event) || !anchor) return { kind: 'ignore' };
  const raw = anchor.getAttribute('href') ?? '';
  if (!raw) return { kind: 'ignore' };
  /* A fragment or a non-navigating scheme is the page's own business. */
  if (raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) return { kind: 'ignore' };
  const absolute = /^https?:/i.test(raw);
  if (absolute && anchor.host && anchor.host !== currentHost) {
    return { kind: 'external', href: anchor.href ?? raw };
  }
  /* Same host, or a relative path: a route in the storefront. Absolute URLs
   * keep only their path, which is what a router takes. */
  const path = absolute
    ? new URL(anchor.href ?? raw).pathname + new URL(anchor.href ?? raw).search
    : raw;
  return { kind: 'internal', path };
}
