import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: '.vitest',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
