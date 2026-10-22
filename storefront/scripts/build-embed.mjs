import { build } from 'esbuild';

/*
 * Builds the Ask JTV embed loader (src/embed/loader.ts) into
 * public/concierge/loader.js: an IIFE with no imports, safe to serve as a
 * plain script tag from any host page. The panel itself (src/embed/frame.html)
 * is built by vite as a second entry; run `npm run build` afterwards.
 */
await build({
  entryPoints: ['src/embed/loader.ts'],
  outfile: 'public/concierge/loader.js',
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2019'],
  logLevel: 'info',
});
