/**
 * Kart-kart contact (GDD 3.2, B7): each kart is two circles of radius 0.75 m at ±0.8 m along its heading (the toy
 * karts are longer than wide), so karts no longer pass through each other nose to tail. The closest circle pair of
 * two karts is resolved with a positional push-out and a velocity exchange along its normal. A boosting kart pushes
 * 2× harder; Zoomies (autopilot) and the box shield push 6×; the body's weight (content/karts.ts) scales it.
 * `bump` fires at most once per pair every 20 ticks (B8); pushed karts are re-clamped to the walls (B9).
 * Slipstream (GDD 3.5) is charged here too, since it is a pairwise check.
 */
import { BoostSource, type KartState } from '../../types';
import { BOOST, PHYS, ticks } from '../../tuning';
import { applyBoost, settleAfterPush, speedOf } from './kart';
import { cosL, sinL } from './fixed';
import { bodyStats } from '../../content/karts';
import type { SimContext } from './plugins';

const R = PHYS.kartRadius;
const OFF = PHYS.kartCircleOffset;
const R2 = (2 * R) ** 2;
/** two karts cannot touch when their centres are further apart than this */
const REACH2 = (2 * R + 2 * OFF) ** 2;
const SLIP_CHARGE = ticks(BOOST.slip.charge);
const SLIP_RANGE2 = BOOST.slip.range ** 2;
const SLIP_COS = 0.9659258262890683; // cos 15°

/** Scratch: which karts a contact moved this tick. */
let moved: Uint8Array = new Uint8Array(8);

export function stepContacts(ctx: SimContext): void {
  const ks = ctx.st.karts;
  const n = ks.length;
  if (moved.length < n) moved = new Uint8Array(n);
  moved.fill(0);
  const bumpCd = ctx.st.pairs?.bump;
  for (let i = 0; i < n; i++) {
    const a = ks[i];
    if (a.respawnTicks > 0 || a.out) continue;
    for (let j = i + 1; j < n; j++) {
      const b = ks[j];
      if (b.respawnTicks > 0 || b.out) continue;
      const cx = b.x - a.x;
      const cz = b.z - a.z;
      if (cx * cx + cz * cz >= REACH2 || Math.abs(b.y - a.y) > 1.6) continue;
      // closest pair of the two circles of each kart
      const afx = sinL(a.heading) * OFF;
      const afz = cosL(a.heading) * OFF;
      const bfx = sinL(b.heading) * OFF;
      const bfz = cosL(b.heading) * OFF;
      let best = Infinity;
      let dx = 0;
      let dz = 0;
      for (let sa = -1; sa <= 1; sa += 2)
        for (let sb = -1; sb <= 1; sb += 2) {
          const ex = cx + bfx * sb - afx * sa;
          const ez = cz + bfz * sb - afz * sa;
          const e2 = ex * ex + ez * ez;
          if (e2 < best) {
            best = e2;
            dx = ex;
            dz = ez;
          }
        }
      if (best >= R2) continue;
      const d = Math.sqrt(best) || 1e-6;
      const nx = best > 1e-12 ? dx / d : 1;
      const nz = best > 1e-12 ? dz / d : 0;
      const wa = weight(ctx, i, a);
      const wb = weight(ctx, j, b);
      const over = 2 * R - d;
      const sa = wb / (wa + wb);
      const sb = wa / (wa + wb);
      a.x -= nx * over * sa;
      a.z -= nz * over * sa;
      b.x += nx * over * sb;
      b.z += nz * over * sb;
      moved[i] = 1;
      moved[j] = 1;
      // relative normal velocity (b relative to a); separate only when approaching
      const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vrel < 0) {
        const imp = -vrel * 1.25; // restitution 0.25
        a.vx -= nx * imp * sa;
        a.vz -= nz * imp * sa;
        b.vx += nx * imp * sb;
        b.vz += nz * imp * sb;
        if (vrel < -1.5) {
          const p = i * n + j;
          if (!bumpCd || bumpCd[p] === 0) {
            if (bumpCd) bumpCd[p] = PHYS.bumpCooldownTicks;
            ctx.emit({ type: 'bump', kart: i, b: j });
          }
        }
        ctx.plugins?.mode?.onBump?.(ctx, i, j, -vrel);
      }
    }
  }
  for (let i = 0; i < n; i++) if (moved[i]) settleAfterPush(ctx, i);
}

/**
 * Gap between two karts' hulls in metres (closest pair of their contact circles, minus both radii): 0 = touching.
 * Items that touch karts (Zoomies) use this, so they agree with what the contacts allow.
 */
export function hullGap(a: KartState, b: KartState): number {
  const cx = b.x - a.x;
  const cz = b.z - a.z;
  const afx = sinL(a.heading) * OFF;
  const afz = cosL(a.heading) * OFF;
  const bfx = sinL(b.heading) * OFF;
  const bfz = cosL(b.heading) * OFF;
  let best = Infinity;
  for (let sa = -1; sa <= 1; sa += 2)
    for (let sb = -1; sb <= 1; sb += 2) {
      const ex = cx + bfx * sb - afx * sa;
      const ez = cz + bfz * sb - afz * sa;
      const e2 = ex * ex + ez * ez;
      if (e2 < best) best = e2;
    }
  return Math.sqrt(best) - 2 * R;
}

function weight(ctx: SimContext, idx: number, k: KartState): number {
  const w = bodyStats(ctx.cfg.racers[idx]?.kart.body).weight;
  if (k.autoTicks > 0 || k.shieldTicks > 0) return 6 * w;
  return (k.boostTicks > 0 ? 2 : 1) * w;
}

/** Slipstream: 1.2 s inside a 15° cone within 8 m behind a rival charges it; leaving the cone releases the boost. */
export function stepSlipstream(ctx: SimContext): void {
  const ks = ctx.st.karts;
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    if (k.finished || k.air || k.respawnTicks > 0) {
      k.slipTicks = 0;
      continue;
    }
    const fx = sinL(k.heading);
    const fz = cosL(k.heading);
    let inCone = false;
    if (speedOf(k) > 10) {
      for (let j = 0; j < ks.length && !inCone; j++) {
        if (j === i) continue;
        const o = ks[j];
        const dx = o.x - k.x;
        const dz = o.z - k.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > SLIP_RANGE2 || d2 < 1) continue;
        const d = Math.sqrt(d2);
        if ((dx * fx + dz * fz) / d >= SLIP_COS) inCone = true;
      }
    }
    if (inCone) {
      if (k.slipTicks < SLIP_CHARGE + 1) k.slipTicks++;
    } else {
      if (k.slipTicks >= SLIP_CHARGE) applyBoost(ctx, i, BOOST.slip.level, BOOST.slip.time, BoostSource.Slipstream);
      k.slipTicks = 0;
    }
  }
}
