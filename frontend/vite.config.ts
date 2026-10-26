import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    // Mirror nginx.conf.template's same-origin /vscode/ proxy, so the Coder
    // iframe works under `npm run dev` too (otherwise Vite's SPA fallback
    // serves index.html and the app renders inside itself).
    proxy: {
      '/vscode': {
        target: 'http://localhost:8080',
        ws: true,
        // Keep the browser's Host (port included): code-server 403s the
        // websocket when Origin and Host don't match, leaving a blank workbench.
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/vscode/, ''),
        configure: (proxy) => {
          const keepHost = (proxyReq: { setHeader(k: string, v: string): void }, req: { headers: Record<string, string | string[] | undefined> }) => {
            if (typeof req.headers.host === 'string') proxyReq.setHeader('X-Forwarded-Host', req.headers.host);
          };
          proxy.on('proxyReq', keepHost);
          proxy.on('proxyReqWs', keepHost);
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
