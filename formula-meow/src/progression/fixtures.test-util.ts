/** Test helpers for the progression lane (not shipped: only *.test.ts files import this). */
import type { RaceClass, RaceMode, RaceResult, RaceStats } from '../types';
import { emptyStats } from '../core/app/race-stats';
import type { RaceRecord, World } from './record';

export function stats(over: Partial<RaceStats> = {}, kart = 5): RaceStats {
  return { ...emptyStats(kart), ...over };
}

export function result(o: { place?: number; finished?: boolean; cls?: RaceClass; mode?: RaceMode; coins?: number; trackId?: string; bestLap?: number | null; karts?: number; seed?: number } = {}): RaceResult {
  const n = o.karts ?? 8;
  const me = 5;
  const place = o.place ?? 1;
  const time = o.finished === false ? null : 95.5;
  const places: RaceResult['places'] = [];
  // the player at `place`, AI around them
  let p = 1;
  for (let k = 0; k < n; k++) {
    if (k === me) continue;
    if (p === place) p++;
    places.push({ kart: k, name: `Cat ${k}`, place: p, time: 90 + p, bestLap: 30 });
    p++;
  }
  places.push({ kart: me, name: 'You', place, time, bestLap: o.bestLap === undefined ? 31.2 : o.bestLap });
  places.sort((a, b) => a.place - b.place);
  return {
    places,
    player: { kart: me, place, time, bestLap: o.bestLap === undefined ? 31.2 : o.bestLap },
    trackId: o.trackId ?? 'kitchen',
    cls: o.cls ?? 0,
    seed: o.seed ?? 1,
    simVersion: 4,
    mode: o.mode ?? 'race',
    coins: o.coins ?? 0,
    stats: [],
  };
}

export function record(over: Partial<RaceRecord> = {}, r: Parameters<typeof result>[0] = {}, s: Partial<RaceStats> = {}): RaceRecord {
  const res = result(r);
  return {
    result: res,
    stats: stats(s),
    trackId: res.trackId,
    modifiers: 0,
    ugc: false,
    hasBranches: false,
    body: 0,
    distance: 3000,
    maxCoinsHeld: 0,
    ...over,
  };
}

export function world(over: Partial<World> = {}): World {
  return {
    today: 10,
    challengeEnv: { tracks: ['kitchen', 'rooftops'], hasCoins: true, hasBranches: true, hasBattle: true, hasTimeTrial: true },
    branchTracks: ['kitchen'],
    circuits: ['kitchen', 'rooftops'],
    ...over,
  };
}
