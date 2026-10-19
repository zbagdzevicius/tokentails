// Copied from catnip-heist/src/sim/hash.ts (copy, never import), plus a float helper and the state hash.
/** FNV-1a 32-bit over a stream of 32-bit integers (each fed as 4 little-endian bytes). */
import type { KartState, RaceState } from '../../types';

export const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnvInt(h: number, v: number): number {
  let x = v | 0;
  for (let i = 0; i < 4; i++) {
    h ^= x & 0xff;
    h = Math.imul(h, FNV_PRIME);
    x >>>= 8;
  }
  return h >>> 0;
}

export function fnvInts(h: number, vs: readonly number[]): number {
  for (let i = 0; i < vs.length; i++) h = fnvInt(h, vs[i]);
  return h;
}

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
/** Hash a double by its exact bits. */
export function fnvFloat(h: number, v: number): number {
  F64[0] = v;
  return fnvInt(fnvInt(h, U32[0]), U32[1]);
}

export function fnvString(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = fnvInt(h, s.charCodeAt(i));
  return h;
}

const KART_FIELDS: readonly (keyof KartState)[] = [
  'x', 'y', 'z', 'heading', 'vx', 'vy', 'vz', 'steer', 'air', 'airTicks', 'hopTicks', 'armTicks', 'pinTicks', 'driftDir', 'driftCharge', 'driftTier',
  'boostTicks', 'boostLevel', 'spinTicks', 'leapTicks', 'wobbleTicks', 'chaseTicks', 'shieldTicks', 'autoTicks', 'invTicks',
  'stallTicks', 'respawnTicks', 'lipTicks', 'trick', 'slipTicks', 'si', 's', 'd', 'dist', 'surface', 'wall', 'pGas', 'pDrift',
  'pItem', 'startJudged', 'itemCount', 'rouletteTicks', 'rngItems', 'rngAi', 'lap', 'lapStartTick', 'bestLapTicks', 'finished',
  'finishTime', 'place', 'stuckTicks', 'progDist', 'topScale',
  // SIM_VERSION 4 (6: battle score fields are hashed by the mode rules)
  'lapMax', 'lapStartPrev', 'coins', 'balloons', 'out', 'itemBuf', 'itemBufBack', 'wrongTicks', 'branch',
];

/** Full race-state hash (GDD 3.1: every 60 ticks; tests assert golden values). The items lane hashes its own slot. */
export function hashState(st: RaceState, extra?: (h: number) => number): number {
  let h = fnvInt(FNV_OFFSET, st.tick);
  for (const k of st.karts) {
    for (const f of KART_FIELDS) h = fnvFloat(h, k[f] as number);
    h = fnvString(h, k.item ?? '-');
  }
  for (const b of st.boxes) h = fnvInt(h, b.respawn);
  h = fnvInt(h, st.rngHazards);
  if (st.coins) for (const c of st.coins) h = fnvInt(h, c);
  if (st.pairs) for (const a of [st.pairs.bump, st.pairs.overtake, st.pairs.blocked, st.pairs.lead]) for (const v of a) h = fnvInt(h, v);
  return extra ? extra(h) >>> 0 : h;
}
