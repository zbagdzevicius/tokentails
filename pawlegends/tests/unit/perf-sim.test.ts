/**
 * Sim performance (POC.md §10, §15 item 6): one full bot match headless in Node, one core, ≤ 1.0 s typical and the
 * 11:00 worst case ≤ 1.5 s. Timed on the bundled sim (tools/lib/sim-bundle.mjs, the same single module the Worker
 * and the backend's vendored copy run): vitest's own module transform routes every cross-module call through a
 * namespace object and runs the sim about 2.5× slower than it ships.
 *
 * "Typical" is the MEDIAN of several runs (seeds 31..35 for the bot match, three runs of the worst case), not the
 * best one. Each run is measured in CPU time of this process (`process.cpuUsage`, user + system), which is what
 * "one core" means and what a loaded machine does not inflate the way it inflates wall time; the wall time and the
 * load average are logged next to it. This file runs in its own vitest project after the unit tests, alone in one
 * fork (vitest.config.ts).
 */
import { loadavg } from 'node:os';
import { beforeAll, describe, expect, it } from 'vitest';
import { CORE_STATS } from '../../src/data/towers';
import { TIMELINE } from '../../src/data/timeline';
import { RANGE } from '../../src/sim/world';
import { heroFor, trickFor } from './bot-helpers';

type Sim = typeof import('../../src/sim/index');
let sim: Sim;

beforeAll(async () => {
  const { importSim } = await import('../../tools/lib/sim-bundle.mjs');
  sim = (await importSim('src/sim/index.ts')) as Sim;
  timed(30); // warm-up: the JIT, not the sim, would otherwise pay for the first match
}, 120000);

interface Run {
  cpu: number;
  wall: number;
  ticks: number;
}

/** One full match on the bundled sim; `prepare` may edit the world first. */
function timed(seed: number, prepare?: (w: { hp: Int32Array }) => void): Run {
  const { picks, tricks } = sim.fillPicks(seed, heroFor(seed), trickFor(seed));
  const m = sim.createMatch({ seed, picks, tricks, difficulty: 'normal' });
  prepare?.((m as unknown as { world: { hp: Int32Array } }).world);
  const bot = sim.createPlayerBot(m as never, 'normal');
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  while (!sim.result(m)) sim.step(m, sim.playerBotCommands(m as never, bot));
  const wall = performance.now() - t0;
  const c = process.cpuUsage(c0);
  return { cpu: (c.user + c.system) / 1000, wall, ticks: sim.result(m)!.ticks };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function report(name: string, runs: Run[]): void {
  const f = (xs: number[]) => xs.map((x) => Math.round(x)).join('/');
  console.log(
    `perf-sim ${name}: cpu ms ${f(runs.map((r) => r.cpu))} (median ${Math.round(median(runs.map((r) => r.cpu)))}), ` +
      `wall ms ${f(runs.map((r) => r.wall))}, load average ${loadavg().map((l) => l.toFixed(1)).join(' ')}`,
  );
}

describe('sim performance (§15 item 6)', { timeout: 300000 }, () => {
  it('a full Normal bot match takes ≤ 1.0 s (median of 5 seeds, CPU time)', () => {
    const runs = [31, 32, 33, 34, 35].map((s) => timed(s));
    report('Normal match', runs);
    expect(median(runs.map((r) => r.cpu))).toBeLessThanOrEqual(1000);
  });

  it('an 11:00 worst case (cores nothing can finish) takes ≤ 1.5 s (median of 3, CPU time)', () => {
    // Sudden Death decay and takedown damage are shares of max HP: HP far above it outlasts them.
    const runs = [0, 1, 2].map(() =>
      timed(32, (w) => {
        for (let c = RANGE.cores; c < RANGE.fountains; c++) w.hp[c] = CORE_STATS.hp * 100;
      }),
    );
    report('11:00 worst case', runs);
    for (const r of runs) expect(r.ticks).toBe(TIMELINE.safetyEnd);
    expect(median(runs.map((r) => r.cpu))).toBeLessThanOrEqual(1500);
  });
});
