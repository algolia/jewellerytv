/**
 * Replay harness for the turn-recovery fix (JOB B, 2026-10-21).
 *
 * Serves the REAL application (vite dev) for browser-level replay: the
 * validator installs Playwright routes that fulfill /api/chat with the raw
 * SSE captured in the exact24 temp4 run (q10, q23, q24) and /api/products/:id
 * with the hits extracted from those same captures. No agent is contacted and
 * no index call is needed, so the replay is not a paid turn. The captured
 * streams are byte-for-byte what /api/chat returned when the app discarded
 * these turns, so a rendered answer text plus product tiles proves the
 * recovery path end to end in a real browser.
 *
 * Why the proxy is not part of the loop: the /api/chat origin allowlist in
 * server/api.ts accepts only the 5173 origins, and 5173 is the main
 * checkout's running dev server, so a second instance cannot pass the guard.
 * Browser-level routes avoid the guard without touching app source.
 *
 * Port 5273 so this never collides with the main checkout's dev servers on
 * 5173/5174 or the frozen test apps.
 *
 * Usage: npx tsx scripts/replay-turn-recovery.mts
 * Then in the browser: install the routes (captures from the exact24 temp4
 * dir), open http://localhost:5273, send each captured question literal.
 */
import { createServer as createViteServer } from 'vite';
import { resolve } from 'node:path';

const vite = await createViteServer({
  root: resolve(import.meta.dirname, '..'),
  server: { host: 'localhost', port: 5273, strictPort: true },
});
await vite.listen();
console.log('replay web on http://localhost:5273');

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    vite.close();
    process.exit(0);
  });
