import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    // Node by default. A DOM test opts in with `// @vitest-environment happy-dom` on its first line.
    environment: 'node',
  },
});
