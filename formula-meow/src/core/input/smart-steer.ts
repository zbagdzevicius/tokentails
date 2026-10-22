/**
 * Smart Steer (iteration 4, F2): the touch steering assist and the touch stick curve. Pure functions, read by the mux
 * and the touch source; the mux applies the assist before the TickInput is latched, so replays and ghosts record the
 * assisted steer and stay deterministic.
 *
 * The assist reads only `MuxContext` (the shell fills the 0.5 s edge look-ahead every frame). When the projected point
 * comes within `margin` metres of a road edge, the stick is blended toward the steer that lines the kart up with the
 * road there (plus a small push back from the edge), ramped by how far the point overshoots, by at most `max` of full
 * lock, and only away from that edge. It never acts before GO, on a loop's rail, in the air, or while the kart drifts
 * with the stick held into the drift (a deliberate line is never pulled out).
 */
import type { MuxContext } from './mux';

export const SMART_STEER = {
  /** metres inside the road edge where the assist starts */
  margin: 0.6,
  /** overshoot (metres past `margin`) that reaches the full blend */
  ramp: 1.4,
  /** the most the assist moves the stick, fraction of full lock */
  max: 0.35,
  /** stick per radian of heading error (road heading vs travel heading at the projected point) */
  headGain: 2.2,
  /** extra stick per metre of overshoot, back toward the road */
  sideGain: 0.22,
  /** a held drift is left alone unless the road ahead heads this many radians the other way (spun past the bend) */
  overRotate: 0.25,
};

/** Touch stick response: dead zone and power curve (iteration 4: x^1.4 → x^1.15, dead zone 6 → 4 px). */
export const STICK = { dead: 4, full: 70, curve: 1.15 };

/** Stick offset in px → steer −1..1 through the dead zone and the response curve. */
export function stickSteer(dx: number, dead: number = STICK.dead, curve: number = STICK.curve, full: number = STICK.full): number {
  const a = Math.abs(dx);
  if (a < dead) return 0;
  const u = Math.min(1, (a - dead) / (full - dead));
  return Math.sign(dx) * Math.pow(u, curve);
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** True when the assist may act this frame (it is still bounded and edge-gated inside `smartSteer`). */
export function smartSteerActive(steer: number, ctx: MuxContext): boolean {
  if (!ctx.racing || ctx.onRail || ctx.air) return false;
  const dd = ctx.driftDir ?? (ctx.drifting ? Math.sign(steer) : 0);
  // a drift with the stick held into it is a deliberate line: hands off while the road ahead still bends that way.
  // Once the drift has turned the kart past the bend (the road at the projected point heads the other way by more
  // than `overRotate`), it is spinning into the inside wall and may be helped; a counter-steer may always be helped.
  if (dd !== 0 && steer * dd >= 0 && (ctx.edgeHeading ?? 0) * dd <= SMART_STEER.overRotate) return false;
  return true;
}

/**
 * The assisted steer (−1..1). `steer` is the device's analog steer after its own curve; the result differs from it by
 * at most `SMART_STEER.max`.
 */
export function smartSteer(steer: number, ctx: MuxContext): number {
  if (!smartSteerActive(steer, ctx)) return steer;
  const eL = ctx.edgeL ?? 99;
  const eR = ctx.edgeR ?? 99;
  const m = SMART_STEER.margin;
  // the edge the path is closing on (+1 = right edge, push left; −1 = left edge, push right)
  let side = 0;
  let over = 0;
  if (eR < m && eR <= eL) {
    side = 1;
    over = m - eR;
  } else if (eL < m) {
    side = -1;
    over = m - eL;
  }
  if (side === 0) return steer;
  const w = Math.min(1, over / SMART_STEER.ramp);
  // steer + = right; edgeHeading + = the road turns left of the travel direction, so it wants a left (negative) steer
  const target = clamp(-(ctx.edgeHeading ?? 0) * SMART_STEER.headGain - side * SMART_STEER.sideGain * over, -1, 1);
  let delta = (target - steer) * w;
  // only ever away from the edge it is closing on
  delta = side > 0 ? Math.min(0, delta) : Math.max(0, delta);
  delta = clamp(delta, -SMART_STEER.max, SMART_STEER.max);
  return clamp(steer + delta, -1, 1);
}
