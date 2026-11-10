import { defineConfig } from 'vitest/config';

/** Diagnose-only: the chase harness (not in `npm test`). */
export default defineConfig({
  test: { include: ['tools/chase-harness/*.test.ts'], environment: 'node' },
});
