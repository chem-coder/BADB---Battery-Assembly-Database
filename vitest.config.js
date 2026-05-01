// Vitest config for backend (Node.js + Express + services).
//
// Tests live in __tests__/ at repo root, mirroring the production code
// structure underneath (e.g. __tests__/services/foo.test.js tests
// services/foo.js).
//
// We run in 'node' environment since backend code uses Node-only APIs
// (fs, path, child_process, pg pool). No jsdom needed.
//
// To run: `npm test` (one-off) or `npm run test:watch` (watch mode).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.js'],
    // Don't pull in client-web tests — frontend has its own vitest config.
    exclude: ['node_modules/**', 'client-web/**', 'public-vue/**'],
    globals: false,
  },
});
