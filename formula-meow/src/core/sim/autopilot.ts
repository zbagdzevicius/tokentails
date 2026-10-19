/**
 * Racing-line follower (GDD 5.2): steer toward a point on the racing line 8–18 m ahead (more at higher speed),
 * offset by `bias` (−1..+1 of the usable half width). Used by Zoomies, by finished humans, and as the base of the
 * items-ai lane's drivers. Sim-safe math only.
 */
import type { TickInput } from '../../types';
import { AI } from '../../tuning';
import { atan2L, clamp, cosL, sinL, wrapAngle } from './fixed';
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

/**
 * Steer toward the racing line (+ `bias`) a speed-dependent distance ahead: `speed × AI.lookTime`, clamped to
 * lookMin..lookMax (B15: a fixed long look cut corners into the inside wall on doodle tracks). The target stays
 * `AI.edge` inside the road edge.
 */
export function followLine(ctx: SimContext, idx: number, out: TickInput, bias: number, lookScale = 1): number {
  const t = ctx.track;
  const k = ctx.st.karts[idx];
  const sp = speedOf(k);
  const look = clamp(sp * AI.lookTime, AI.lookMin, AI.lookMax) * lookScale;
  const j = aheadIndex(ctx, k.si, look);
  const lim = Math.max(0.5, t.halfW[j] - AI.edge);
  // steering at a point ahead cuts the chord of a bend by look²·κ/8: aim that much wider so the kart rides the line
  // instead of the inside wall (B15)
  const kap = curvatureAhead(ctx, k.si, 0, look);
  const chord = (look * look * kap) / 8;
  // in a bend the inside limit sits another metre in (the kart overshoots its target toward the apex)
  const inside = Math.max(0.5, lim - 1);
  const lo = kap > 0.012 ? -inside : -lim;
  const hi = kap < -0.012 ? inside : lim;
  const d = clamp(t.line[j] + bias * lim + chord, lo, hi);
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
