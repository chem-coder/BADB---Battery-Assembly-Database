// Vitest config for client-web (Vue 3 frontend).
//
// Tests live in __tests__/ next to package.json. Path alias `@` matches
// the production vite.config.js so `import x from '@/utils/y'` works in
// tests the same way it works in dev/prod.
//
// jsdom environment because component tests need a DOM (mount, render,
// querySelector). Pure utility tests don't strictly need jsdom but it's
// cheap and uniform.
//
// To run: `npm test` (one-off) or `npm run test:watch` (watch mode).
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Versioned project contracts (repo root /contracts) — must match
      // vite.config.js so the metrics registry resolves in tests too.
      '@contracts': fileURLToPath(new URL('../contracts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['__tests__/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules/**', 'dist/**'],
    globals: false,
  },
});
