import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the built site works from any sub path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    proxy: {
      '/ws': { target: 'ws://localhost:8787', ws: true },
      '/healthz': 'http://localhost:8787',
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
} as any);
