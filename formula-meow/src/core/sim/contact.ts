/**
 * Kart-kart contact (GDD 3.2): circles of radius 0.9 m with a positional push-out and a velocity exchange along the
 * contact normal. A boosting kart pushes 2× harder; Zoomies (autopilot) and the box shield push 6×. Pairs are
 * processed in kart-index order. Slipstream (GDD 3.5) is charged here too, since it is a pairwise check.
 */
import { BoostSource } from '../../types';
import { BOOST, PHYS, ticks } from '../../tuning';
import { applyBoost, speedOf } from './kart';
import { cosL, sinL } from './fixed';
import type { SimContext } from './plugins';

const R2 = (PHYS.kartRadius * 2) ** 2;
const SLIP_CHARGE = ticks(BOOST.slip.charge);
const SLIP_RANGE2 = BOOST.slip.range ** 2;
const SLIP_COS = 0.9659258262890683; // cos 15°

export function stepContacts(ctx: SimContext): void {
  const ks = ctx.st.karts;
  for (let i = 0; i < ks.length; i++) {
    const a = ks[i];
    if (a.respawnTicks > 0) continue;
    for (let j = i + 1; j < ks.length; j++) {
      const b = ks[j];
      if (b.respawnTicks > 0) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R2 || Math.abs(b.y - a.y) > 1.6) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = d2 > 1e-12 ? dx / d : 1;
      const nz = d2 > 1e-12 ? dz / d : 0;
      const wa = weight(a);
      const wb = weight(b);
      const over = PHYS.kartRadius * 2 - d;
      const sa = wb / (wa + wb);
      const sb = wa / (wa + wb);
      a.x -= nx * over * sa;
      a.z -= nz * over * sa;
      b.x += nx * over * sb;
      b.z += nz * over * sb;
      // relative normal velocity (b relative to a); separate only when approaching
      const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vrel < 0) {
        const hard = vrel < -1.5;
        const imp = -vrel * 1.25; // restitution 0.25
        a.vx -= nx * imp * sa;
        a.vz -= nz * imp * sa;
        b.vx += nx * imp * sb;
        b.vz += nz * imp * sb;
        if (hard) ctx.emit({ type: 'bump', kart: i, b: j });
      }
    }
  }
}

function weight(k: { boostTicks: number; autoTicks: number; shieldTicks: number }): number {
  if (k.autoTicks > 0 || k.shieldTicks > 0) return 6;
  return k.boostTicks > 0 ? 2 : 1;
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
