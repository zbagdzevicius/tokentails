/** Test helpers: a long oval for physics checks and a one-call race setup. */
import type { RaceClass, RaceConfig, TrackDef } from '../types';
import { buildField, createSimPlugins } from '../items-ai';
import { SimWorld } from '../core/sim/world';

/** A 2 × 200 m straight oval (wide, flat) with an optional feature list. */
export function ovalTrack(features: TrackDef['features'] = []): TrackDef {
  return {
    v: 1,
    id: 'test-oval',
    name: 'Test Oval',
    theme: 0,
    timeOfDay: 0,
    laps: 3,
    points: [
      { x: -40, z: -100, h: 0, w: 3 },
      { x: -40, z: 0, h: 0, w: 3 },
      { x: -40, z: 100, h: 0, w: 3 },
      { x: -20, z: 124, h: 0, w: 3 },
      { x: 20, z: 124, h: 0, w: 3 },
      { x: 40, z: 100, h: 0, w: 3 },
      { x: 40, z: 0, h: 0, w: 3 },
      { x: 40, z: -100, h: 0, w: 3 },
      { x: 20, z: -124, h: 0, w: 3 },
      { x: -20, z: -124, h: 0, w: 3 },
    ],
    features: [{ s: 0, kind: 'start' }, ...features],
  };
}

export function raceConfig(track: TrackDef, opts: { seed?: number; cls?: RaceClass; humans?: number[]; solo?: boolean; forgiving?: boolean } = {}): RaceConfig {
  const seed = opts.seed ?? 1;
  const cls = opts.cls ?? 0;
  const humans = opts.humans ?? [];
  let racers = buildField({ seed, cls, playerSlot: humans[0] ?? -1 });
  if (opts.solo) racers = racers.slice(0, 1);
  return { track, seed, cls, modifiers: 0, racers, humans: opts.solo && humans.length ? [0] : humans, forgiving: opts.forgiving ?? false };
}

export function world(cfg: RaceConfig): SimWorld {
  return new SimWorld(cfg, createSimPlugins(cfg));
}

/**
 * "Stunt lab" (SIM_VERSION 8, set pieces): the test oval with one of each set piece, the Engine step's deterministic
 * reference for the lanes. Lap ≈ 620 m (≈ 2.4 m per lap unit). First straight (+z): a 10 m jump gap with a 1.5 m drop,
 * then a tunnel; the first bend: a wall ride on its outer side (auto); the back straight: a loop.
 */
export function stuntLab(over: Partial<TrackDef> = {}): TrackDef {
  return {
    ...ovalTrack([{ s: 140, kind: 'items' }]),
    id: 'stunt-lab',
    name: 'Stunt Lab',
    lineCoins: false,
    setPieces: [
      { kind: 'jump', s: 24, gap: 10, drop: 1.5 },
      { kind: 'tunnel', s: 50, len: 16 },
      { kind: 'wall', s: 92, len: 18 },
      { kind: 'loop', s: 160 },
    ],
    ...over,
  };
}
