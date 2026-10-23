/**
 * Free-roam helpers for arenas (iteration 2 contract, used by the modes lane's battle AI): no racing line there, so
 * the AI steers at points and karts. Sim-safe math only.
 */
import type { KartState } from '../../types';
import { atan2L, wrapAngle } from './fixed';
import type { SimContext } from './plugins';

/** Nearest other kart that passes `filter` (default: not out, not respawning), or -1. */
export function nearestKart(ctx: SimContext, from: number, filter?: (k: KartState, i: number) => boolean): number {
  const ks = ctx.st.karts;
  const me = ks[from];
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < ks.length; i++) {
    if (i === from) continue;
    const k = ks[i];
    if (filter ? !filter(k, i) : k.out || k.respawnTicks > 0) continue;
    const dx = k.x - me.x;
    const dz = k.z - me.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD) {
      bestD = d2;
      best = i;
    }
  }
  return best;
}

/** Signed heading error from kart `from`'s facing to point (x, z), radians (+ = the point is to the left). */
export function dirTo(ctx: SimContext, from: number, x: number, z: number): number {
  const k = ctx.st.karts[from];
  return wrapAngle(atan2L(x - k.x, z - k.z) - k.heading);
}

/** Squared planar distance between two karts. */
export function dist2(ctx: SimContext, a: number, b: number): number {
  const ka = ctx.st.karts[a];
  const kb = ctx.st.karts[b];
  const dx = ka.x - kb.x;
  const dz = ka.z - kb.z;
  return dx * dx + dz * dz;
}
