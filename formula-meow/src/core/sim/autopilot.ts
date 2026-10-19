/**
 * Racing-line follower (GDD 5.2): steer toward a point on the racing line 8–18 m ahead (more at higher speed),
 * offset by `bias` (−1..+1 of the usable half width). Used by Zoomies, by finished humans, and as the base of the
 * items-ai lane's drivers. Sim-safe math only.
 */
import type { TickInput } from '../../types';
import { AI } from '../../tuning';
import { atan2L, clamp, cosL, lerp, sinL, wrapAngle } from './fixed';
import { speedOf } from './kart';
import type { SimContext } from './plugins';

export const STEER_GAIN = 2.4;

/** Sample index `metres` ahead of sample `si`. */
export function aheadIndex(ctx: SimContext, si: number, metres: number): number {
  const t = ctx.track;
  return (si + Math.max(1, Math.round(metres / t.step))) % t.n;
}

/** Average signed curvature over [from, to] metres ahead (1/m, + = left). */
export function curvatureAhead(ctx: SimContext, si: number, from: number, to: number): number {
  const t = ctx.track;
  const a = Math.round(from / t.step);
  const b = Math.max(a + 1, Math.round(to / t.step));
  let s = 0;
  for (let j = a; j <= b; j += 2) s += t.curv[(si + j) % t.n];
  return s / (Math.floor((b - a) / 2) + 1);
}

export function followLine(ctx: SimContext, idx: number, out: TickInput, bias: number, lookScale = 1): number {
  const t = ctx.track;
  const k = ctx.st.karts[idx];
  const sp = speedOf(k);
  const look = lerp(AI.lookMin, AI.lookMax, clamp(sp / ctx.tun.topSpeed, 0, 1)) * lookScale;
  const j = aheadIndex(ctx, k.si, look);
  const lim = t.halfW[j] - 1.4;
  const d = clamp(t.line[j] + bias * lim, -lim, lim);
  const tx = t.px[j] - t.tz[j] * d;
  const tz = t.pz[j] + t.tx[j] * d;
  const want = atan2L(tx - k.x, tz - k.z);
  // while drifting, aim with the travel direction (the body sits at a slip angle)
  const face = k.driftDir !== 0 ? atan2L(k.vx, k.vz) : k.heading;
  const err = wrapAngle(want - face);
  const steer = clamp(-err * STEER_GAIN, -1, 1);
  out.steer = Math.round(steer * 7);
  out.gas = true;
  out.brake = false;
  out.drift = false;
  out.item = false;
  out.itemBack = false;
  // facing the wrong way (after a bounce or a spin): back up while turning, like a three-point turn
  const vf = k.vx * sinL(k.heading) + k.vz * cosL(k.heading);
  if ((Math.abs(err) > 1.9 && sp < 7) || (vf < -0.3 && Math.abs(err) > 0.8)) {
    out.gas = false;
    out.brake = true;
    out.steer = -out.steer;
  }
  return err;
}
