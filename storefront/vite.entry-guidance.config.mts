import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SAMPLE-QUESTIONS lane scratch web config (Craig Task 06, zero paid turns).
// Serves the app on 5178 and proxies /api to this lane's own API on 5177 so
// the shared 5173/5174 stack stays untouched. Never used for /api/chat turns;
// the browser check intercepts and aborts /api/chat before it leaves the page.
export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5178,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:5177' },
  },
  build: { sourcemap: false },
});
