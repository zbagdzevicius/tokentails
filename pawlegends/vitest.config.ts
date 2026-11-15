import { defineConfig } from 'vitest/config';

/**
 * Two projects. `unit` runs every test in parallel. `perf` (tests/unit/perf-sim.test.ts, POC.md §15 item 6, and the
 * measurement harness in tests/perf/, BENCHMARKS.md) runs after it (a later sequence group), alone in one fork, so the
 * other test files do not compete for the cores it times.
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
          // A time limit, not a budget: many tests play whole matches on the transformed sim (seconds when idle), and a
          // loaded machine stretched those past vitest's 5 s default (skins-determinism at load 50, Nov 15, 2026).
          // Tests that time something assert it themselves (perf-sim, perf-ff).
          testTimeout: 120_000,
          hookTimeout: 120_000,
          sequence: { groupOrder: 0 },
        },
      },
      {
        test: {
          name: 'perf',
          include: ['tests/unit/perf-sim.test.ts', 'tests/perf/**/*.test.ts'],
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
