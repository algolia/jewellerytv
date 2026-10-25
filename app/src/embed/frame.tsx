import { useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { InstantSearch } from 'react-instantsearch';
import { Concierge, type ConciergeHandle } from '../concierge/Concierge';
import { searchClient } from '../shared/client';
import '../website/styles.css';

/*
 * Embed panel (simplification plan 5.4, 2026-10-22): the same Concierge the
 * demo uses, mounted alone inside the iframe the loader creates on the host
 * page. The host talks to us only through postMessage (see the risk artifact
 * 03-risk-embed.md): the first host message binds the session to that origin,
 * later messages must match it, and nothing here executes host input as code.
 */

const MESSAGE_SOURCE = 'jtv-concierge';
const ASK_TEXT_LIMIT = 2000;
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

type HostMessage = { source?: string; type?: string; text?: string };

function Frame() {
  const handle = useRef<ConciergeHandle>(null);
  const hostOrigin = useRef<string | null>(null);

  const post = (message: Record<string, unknown>, targetOrigin: string) => {
    try {
      window.parent.postMessage({ source: MESSAGE_SOURCE, ...message }, targetOrigin);
    } catch {
      /* A closed or unusable parent must never break the panel. */
    }
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as HostMessage | null;
      if (!data || data.source !== MESSAGE_SOURCE) return;
      if (hostOrigin.current === null) hostOrigin.current = event.origin;
      if (event.origin !== hostOrigin.current) return;
      if (data.type === 'ask') {
        const text = String(data.text ?? '').slice(0, ASK_TEXT_LIMIT);
        handle.current?.ask(text);
      } else if (data.type === 'open') {
        handle.current?.ask('');
      } else if (data.type === 'close') {
        handle.current?.close();
      }
      /* Unknown types are dropped: the contract is a closed enum. */
    };
    window.addEventListener('message', onMessage);
    /* The only '*' post: inert readiness ping, so the host can act on us. */
    window.parent.postMessage({ source: MESSAGE_SOURCE, type: 'ready' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const onProductClick = (event: ReactMouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    if (!anchor) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return; /* external links open in-frame */
    event.preventDefault();
    if (!url.pathname.startsWith('/product/')) return; /* keep the panel, drop the rest */
    const productId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    if (!PRODUCT_ID_PATTERN.test(productId)) return;
    post({ type: 'product-click', productId }, hostOrigin.current ?? '*');
  };

  return (
    <div onClickCapture={onProductClick}>
      {/* The panel's chat hook reads the InstantSearch context, exactly as in
          the demo app, so the frame mounts the same provider around it. */}
      <InstantSearch searchClient={searchClient} indexName="prod_catalog" insights={false}>
        <Concierge
          ref={handle}
          context={() => ({ route: 'embed' })}
          onClose={() => post({ type: 'closed' }, hostOrigin.current ?? '*')}
        />
      </InstantSearch>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Frame />);
