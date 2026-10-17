import { defineConfig } from 'vitest/config';

/**
 * Two projects. `unit` runs every test in parallel. `perf` (tests/unit/perf-sim.test.ts, POC.md §15 item 6) runs
 * after it (a later sequence group), alone in one fork, so the other test files do not compete for the cores it
 * times.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tools/**/*.test.mjs'],
          exclude: ['tests/unit/perf-sim.test.ts'],
          // Node by default. A DOM test opts in with `// @vitest-environment happy-dom` on its first line.
          environment: 'node',
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'perf',
          include: ['tests/unit/perf-sim.test.ts'],
          environment: 'node',
          pool: 'forks',
          maxWorkers: 1,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
