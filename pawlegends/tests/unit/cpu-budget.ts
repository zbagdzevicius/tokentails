/**
 * CPU budgets on a busy machine (perf-sim.test.ts, net-rejoin.test.ts perf-ff).
 *
 * The budgets are CPU time of one core (`process.cpuUsage`), which waiting for a core does not inflate. Which core
 * does: when the machine has more runnable work than cores, a Mac moves the test onto its efficiency cores and the
 * same work costs more CPU time. Measured on Nov 15, 2026 on an M3 Pro (6 performance + 6 efficiency cores) at load
 * 60 to 160: Normal matches of 842 to 957 ms next to 1,442 to 1,600 ms in the same file (1.6x to 1.7x), the 11:00
 * worst case 1,542 to 1,870 ms against a 1,500 ms budget, perf-ff 1,664 to 2,281 ms against 1,500 ms. Timing the
 * work in slices with a calibration kernel between them did not tell the cores apart reliably at that load, so:
 *
 * - while the 1-minute load average is at most the core count, the budget is the budget;
 * - above it (an overloaded machine), the budget is `LOADED_FACTOR` times larger, which still fails a sim that got
 *   twice as slow; the test logs which budget it used.
 */
import { availableParallelism, loadavg } from 'node:os';

/** Efficiency cores cost up to 1.7x (measured above); 2x leaves margin and still catches a doubled cost. */
export const LOADED_FACTOR = 2;

export interface CpuBudget {
  ms: number;
  overloaded: boolean;
  /** For the log line. */
  note: string;
}

/** The budget to check CPU ms against now: `ms`, or `ms * LOADED_FACTOR` on an overloaded machine. */
export function cpuBudget(ms: number): CpuBudget {
  const load = loadavg()[0];
  const cores = availableParallelism();
  const overloaded = load > cores;
  return {
    ms: overloaded ? ms * LOADED_FACTOR : ms,
    overloaded,
    note: overloaded
      ? `overloaded (load ${load.toFixed(1)} on ${cores} cores): budget ${ms} ms x ${LOADED_FACTOR}`
      : `budget ${ms} ms (load ${load.toFixed(1)} on ${cores} cores)`,
  };
}

/**
 * CPU ms of this thread (Node 23.9+ `process.threadCpuUsage`), else of the process. A thread's CPU time leaves out the
 * garbage collector's and the compiler's helper threads, so on an idle machine it is about the wall time of a
 * single-threaded loop, which is what a wall-clock budget measured before.
 */
export function threadCpuMs(): number {
  const p = process as unknown as { threadCpuUsage?: () => NodeJS.CpuUsage };
  const c = p.threadCpuUsage ? p.threadCpuUsage() : process.cpuUsage();
  return (c.user + c.system) / 1000;
}

/**
 * How many times longer the time limits are now: 1 while the 1-minute load average is at most the core count, else
 * the load per core rounded up (at most 8). A limit is not a budget: it only ends a test that hangs, and a hang still
 * ends, later. Measured Nov 15, 2026 at load 45 to 75 on 12 cores (other agents' builds and browsers): whole seeded
 * matches, the sim bundle and the replay checks ran 3x to 6x their idle time, and 14 tests in the full suite hit
 * their fixed 30 to 300 s limits while still making progress. Tests that time something keep `cpuBudget` instead.
 * The e2e config and the touch, clip and progression specs use it too (Nov 16, 2026, load 330 on 12 cores: a match
 * took over 60 s to go live and a minimap walk over 20 s). Their checks are in game ticks or drawn frames.
 */
export function loadScale(): number {
  const perCore = loadavg()[0] / availableParallelism();
  return Math.min(8, Math.max(1, Math.ceil(perCore)));
}

/** A time limit (`it(..., limit(ms))`, `{ timeout: limit(ms) }`), stretched by `loadScale()`. */
export function limit(ms: number): number {
  return ms * loadScale();
}
