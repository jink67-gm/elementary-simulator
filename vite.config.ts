import { defineConfig } from 'vitest/config';

// GitHub Pages: https://<user>.github.io/elementary-simulator/
export default defineConfig({
  base: '/elementary-simulator/',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
