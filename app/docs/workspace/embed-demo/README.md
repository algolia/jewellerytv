# Looking at the embed locally

The embed is two static files, both already served by the dev server:

- `http://localhost:5173/concierge/loader.js` — the 1.5 kB script a host page
  includes. Rebuild it with `node scripts/build-embed.mjs` after changing
  `src/embed/loader.ts`; it is not rebuilt by `npm run dev`.
- `http://localhost:5173/src/embed/frame.html` — the panel on its own, which
  is what the iframe loads. Open this directly to see the panel without a
  host around it.

`host.html` here is a stand-in for a page we do not own. It is deliberately
not the JTV storefront: the only thing connecting it to the panel is the one
script tag at the bottom.

Serve it from a **different origin** than the panel, so the postMessage
origin checks are exercised the way they would be on jtv.com:

```sh
npm run dev                                   # panel on :5173
npx serve docs/workspace/embed-demo -l 8080   # host page on :8080
```

Then open `http://localhost:8080/host.html` and click the Ask JTV chip the
loader injects into the search form.

## What to look at

1. **Nothing loads until you click.** Only `loader.js` is on the host page.
2. **The chip** is injected next to `data-jtv-target`, styled by the loader,
   not by the host.
3. **Typing in the host search box first** and then clicking the chip hands
   that text over as a draft (`ask`).
4. **Clicking a product tile** navigates the *host* page, via the PDP
   template — the panel never learns their routing.
5. **Collapsing the panel**, which is where it currently breaks: the loader
   only hides the iframe on close and never resizes it, so the chevron leaves
   a white full-height column over the host page.
