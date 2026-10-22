/*
 * Ask JTV embed loader (simplification plan 5, 2026-10-22).
 *
 * One script tag on the host page:
 *   <script src="https://<concierge-host>/concierge/loader.js"
 *           data-jtv-target="#siteSearchForm"
 *           data-jtv-pdp-template="https://www.jtv.com/product/{id}"
 *           defer></script>
 *
 * No framework, no host CSS dependencies, never throws into the host page.
 * The chip opens the panel iframe on first use (lazy); host and panel talk
 * over postMessage with explicit origins (03-risk-embed.md). Product URLs
 * are resolved here, on the host side, from the PDP template only.
 */

type LoaderConfig = {
  target: string | null;
  pdpTemplate: string;
  panelUrl: string;
  origin: string;
};

type PanelMessage = { source?: string; type?: string; productId?: string; text?: string };

const MESSAGE_SOURCE = 'jtv-concierge';
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

function readConfig(): LoaderConfig | null {
  try {
    const script =
      (document.currentScript as HTMLScriptElement | null) ??
      (document.querySelector('script[src*="loader.js"]') as HTMLScriptElement | null);
    if (!script) return null;
    return {
      target: script.dataset.jtvTarget ?? null,
      pdpTemplate: script.dataset.jtvPdpTemplate ?? '',
      panelUrl: script.dataset.jtvPanelUrl ?? '/frame.html',
      origin: new URL(script.src, location.href).origin,
    };
  } catch {
    return null;
  }
}

function injectStyle(): void {
  const style = document.createElement('style');
  style.textContent = [
    '.jtv-ask-chip{display:inline-flex;align-items:center;background:#eaf4f8;border:1px solid #bcd9e6;',
    'border-radius:30px;color:#0076a9;font:700 13px/1 Arial,sans-serif;min-height:30px;padding:0 16px;',
    'margin:0 8px 0 4px;cursor:pointer;white-space:nowrap}',
    '.jtv-ask-chip:hover{background:#dceef6}',
    '.jtv-ask-chip--floating{position:fixed;left:0;top:45%;z-index:2147483000;border-radius:0 18px 18px 0;',
    'min-height:38px;padding:0 14px 0 10px}',
    '.jtv-embed-frame{position:fixed;top:0;right:0;bottom:0;width:min(520px,100%);z-index:2147483000;',
    'border:0;box-shadow:-8px 0 24px rgba(0,0,0,.18);background:#fff}',
    '@media(max-width:640px){.jtv-embed-frame{width:100%;height:100dvh}}',
  ].join('');
  document.head.appendChild(style);
}

function buildChip(onOpen: (text: string) => void, floating: boolean): HTMLButtonElement {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = floating ? 'jtv-ask-chip jtv-ask-chip--floating' : 'jtv-ask-chip';
  chip.textContent = 'Ask JTV';
  chip.setAttribute('aria-label', 'Ask JTV, the jewelry concierge');
  chip.addEventListener('click', () => {
    const input = document.querySelector(
      '.jtv-ask-chip-anchor input[type="search"], .jtv-ask-chip-anchor input[type="text"]',
    );
    onOpen(input instanceof HTMLInputElement ? input.value : '');
  });
  return chip;
}

function setup(): void {
  const existing = (window as { JTVConcierge?: unknown }).JTVConcierge;
  if (existing) return; /* duplicate script tags are a no-op */
  const config = readConfig();
  if (!config) return;
  injectStyle();

  let frame: HTMLIFrameElement | null = null;
  let ready = false;
  const pending: PanelMessage[] = [];

  const ensureFrame = (): HTMLIFrameElement => {
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.className = 'jtv-embed-frame';
    frame.title = 'Ask JTV';
    frame.loading = 'lazy';
    frame.src = new URL(config.panelUrl, config.origin).href;
    frame.style.display = 'none';
    document.body.appendChild(frame);
    return frame;
  };

  const post = (message: PanelMessage): void => {
    const target = ensureFrame();
    if (!ready) {
      pending.push(message);
      return;
    }
    try {
      target.contentWindow?.postMessage({ source: MESSAGE_SOURCE, ...message }, config.origin);
    } catch {
      /* The panel being gone must never break the host page. */
    }
  };

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== config.origin) return;
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data as PanelMessage | null;
    if (!data || data.source !== MESSAGE_SOURCE) return;
    if (data.type === 'ready') {
      ready = true;
      while (pending.length) post(pending.shift() as PanelMessage);
      return;
    }
    if (data.type === 'product-click') {
      const productId = String(data.productId ?? '');
      if (!PRODUCT_ID_PATTERN.test(productId)) return;
      const url = config.pdpTemplate
        ? config.pdpTemplate.replace('{id}', encodeURIComponent(productId))
        : '';
      try {
        window.dispatchEvent(
          new CustomEvent('jtv:product-click', { detail: { productId, url: url || null } }),
        );
      } catch {
        /* Analytics must never block navigation. */
      }
      if (url) location.href = url; /* navigation is the loader's job, not the panel's */
    }
  });

  const open = (text: string) => {
    const target = ensureFrame();
    target.style.display = '';
    try {
      window.dispatchEvent(new CustomEvent('jtv:concierge:open'));
    } catch {
      /* Ignore hosts with locked-down event handling. */
    }
    post(text.trim() ? { type: 'ask', text: String(text).slice(0, 2000) } : { type: 'open' });
  };
  const close = () => post({ type: 'close' });

  let anchor: HTMLElement | null = null;
  if (config.target) {
    try {
      anchor = document.querySelector(config.target);
    } catch {
      anchor = null; /* an invalid selector must not break the host page */
    }
  }
  if (anchor) {
    anchor.classList.add('jtv-ask-chip-anchor');
    anchor.appendChild(buildChip(open, false));
  } else {
    document.body.appendChild(buildChip(open, true));
  }

  (window as { JTVConcierge?: object }).JTVConcierge = { ask: (text?: string) => open(text ?? ''), open: () => open(''), close };
}

try {
  setup();
} catch (error) {
  /* The loader may log its own failure but must never break the host page. */
  console.warn('Ask JTV loader could not start', error);
}
