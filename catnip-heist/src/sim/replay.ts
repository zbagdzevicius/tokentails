/**
 * Compact input logs (run-length encoded) and replay. This is the format a client would post for
 * server-side replay verification (plan section 6).
 */
import { SIM_VERSION, type Axis, type Input, type LevelDef, type SimState } from '../types';
import { initSim, stepSim } from './sim';

/** One run: [dx, dy, flags, count]. flags: 1 = swap, 2 = interact, 4 = meow. */
export type InputRun = [number, number, number, number];

export interface InputLog {
  levelId: string;
  simVersion: number;
  seed: number;
  catIds: [string, string];
  /** Total ticks in the log. */
  ticks: number;
  runs: InputRun[];
  /** Expected results, filled in by whoever recorded the log (optional for verification). */
  finalHash?: number;
  score?: number;
  spottedCount?: number;
  coins?: number;
}

export const FLAG_SWAP = 1;
export const FLAG_INTERACT = 2;
export const FLAG_MEOW = 4;

export function inputFlags(i: Input): number {
  return (i.swap ? FLAG_SWAP : 0) | (i.interact ? FLAG_INTERACT : 0) | (i.meow ? FLAG_MEOW : 0);
}

export function inputFromRun(r: InputRun): Input {
  return {
    dx: r[0] as Axis,
    dy: r[1] as Axis,
    swap: (r[2] & FLAG_SWAP) !== 0,
    interact: (r[2] & FLAG_INTERACT) !== 0,
    meow: (r[2] & FLAG_MEOW) !== 0,
  };
}

/** Run-length encode per-tick inputs. */
export function encodeInputs(inputs: readonly Input[]): InputRun[] {
  const runs: InputRun[] = [];
  for (const i of inputs) {
    const f = inputFlags(i);
    const last = runs[runs.length - 1];
    if (last && last[0] === i.dx && last[1] === i.dy && last[2] === f) last[3]++;
    else runs.push([i.dx, i.dy, f, 1]);
  }
  return runs;
}

/** Expand runs into per-tick inputs. */
export function decodeInputs(runs: readonly InputRun[]): Input[] {
  const out: Input[] = [];
  for (const r of runs) {
    const i = inputFromRun(r);
    for (let k = 0; k < r[3]; k++) out.push(i);
  }
  return out;
}

export interface ReplayResult {
  final: SimState;
  hashes: number[];
}

/**
 * Replay a log from scratch. Stops early when the run is won. `maxTicks` bounds the work
 * (default 18,000 = 10 minutes).
 */
export function replay(level: LevelDef, log: InputLog, maxTicks = 18000): ReplayResult {
  if (log.levelId !== level.id) throw new Error(`replay: log is for ${log.levelId}, not ${level.id}`);
  if (log.simVersion !== SIM_VERSION) throw new Error(`replay: sim version ${log.simVersion} != ${SIM_VERSION}`);
  let s = initSim(level, log.seed, log.catIds);
  const hashes: number[] = [];
  let n = 0;
  outer: for (const r of log.runs) {
    const input = inputFromRun(r);
    for (let k = 0; k < r[3]; k++) {
      if (n++ >= maxTicks || s.won) break outer;
      s = stepSim(level, s, input);
      hashes.push(s.hash);
    }
  }
  return { final: s, hashes };
}
