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
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/vscode/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
