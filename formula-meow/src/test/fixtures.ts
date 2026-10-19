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
  return new SimWorld(cfg, createSimPlugins());
}
