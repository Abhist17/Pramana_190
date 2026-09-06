import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // A GoI footer carries a "last updated" date. Hardcoding it guarantees it goes
  // stale and starts quietly misinforming the visitor, so it is stamped at build.
  define: {
    __BUILD_DATE__: JSON.stringify(
      new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    ),
  },
  server: {
    port: 5173,
    // Keeps the browser on one origin, so no CORS and no API base URL to configure.
    proxy: { '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true } },
  },
});
