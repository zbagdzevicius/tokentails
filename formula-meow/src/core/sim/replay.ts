/**
 * Replays (GDD 3.1, 8.1): a race is a pure function of its config and the human inputs, so a replay is just the
 * packed input stream (10 bits per tick, see types.ts packInput). The share lane re-simulates from this for clips,
 * ghosts re-sim it in a shadow world, and anti-cheat recomputes the time instead of trusting it.
 */
import { packInput, unpackInput, type RaceConfig, type RaceResult, type TickInput } from '../../types';
import type { SimPlugins } from './plugins';
import { SimWorld } from './world';

export interface Replay {
  /** packed inputs per tick for human 0 */
  inputs: number[];
}

export class ReplayRecorder {
  readonly inputs: number[] = [];
  push(i: TickInput): void {
    this.inputs.push(packInput(i));
  }
  replay(): Replay {
    return { inputs: this.inputs.slice() };
  }
}

export interface SimRun {
  world: SimWorld;
  result: RaceResult;
  /** state hash every 60 ticks */
  hashes: number[];
}

/**
 * Run a full race headless from a replay (or AI-only with no replay). Pass `createSimPlugins(cfg)` so the track's
 * hazards and the mode's rules run exactly as they did live. A replay that runs out keeps the gas held straight on.
 */
export function simulate(cfg: RaceConfig, plugins: SimPlugins, replay?: Replay, maxTicks = 60 * 300): SimRun {
  const w = new SimWorld(cfg, plugins);
  const hashes: number[] = [];
  const buf: TickInput[] = [];
  while (!w.done && w.tick < maxTicks) {
    if (cfg.humans.length > 0) {
      const v = replay?.inputs[w.tick];
      buf[0] = v === undefined ? unpackInput(0x17) : unpackInput(v);
    }
    w.step(buf);
    if (w.tick % 60 === 0) hashes.push(w.hash());
  }
  return { world: w, result: w.result(), hashes };
}
