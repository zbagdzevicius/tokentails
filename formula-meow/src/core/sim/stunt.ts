/**
 * Set-piece sim rules (SIM_VERSION 8, iteration 3; docs/plans/formula-meow/SETPIECES.md section 3). Spectacle with
 * assist: every piece keeps or adds speed, steering still works, nothing can be failed. Called from `stepKart`
 * (core/sim/kart.ts); the pieces themselves are built by core/track/stunt.ts. Sim-safe math only (GDD 3.1).
 *
 * - Loop (rail): crossing a loop's zone start on the main loop attaches the kart to a rail `LOOP_LP` m long. Per tick:
 *   speed as normal but never under `floor × top`, `su += v·DT`, `sd` steers at 0.4× and auto-centres, clamped to
 *   ±maxSd (a soft rail: no event, no speed loss). The planar position follows the shadow at `su × LOOP_K`. Hits,
 *   contacts (except a sideways nudge between two railed karts), slipstream, coins, item use (buffered), the safety
 *   checks and wrong way are off. At `su ≥ LOOP_LP` the kart is set at the zone end with an exit boost.
 * - Wall ride (lane): on `Surface.WallRide` a Stunt boost refreshed every tick and a soft magnet toward the lane centre
 *   (off while steering inward hard); the outer rail is soft (core/sim/kart.ts resolveWall).
 * - Jump gap: crossing the lip launches at ≥ floor × top on an aimed arc that lands `aim` m past the far lip; in the air
 *   a magnet pulls toward the racing line and the heading toward the tangent; a clean landing pays a Stunt boost.
 *   A kart that drops below the far deck (or flies too long) is caught by the net and set down past the far lip.
 */
import { BoostSource, DT, Surface, type KartState, type TickInput } from '../../types';
import { BOOST, DRIFT, PHYS, STUNT, ticks } from '../../tuning';
import { LOOP_K, LOOP_LP, pieceAtSample, type BuiltPiece } from '../track/stunt';
import { queryTrack, type TrackHit } from '../track/query';
import { atan2L, clamp, cosL, pow06, sinL, wrapAngle } from './fixed';
import type { SimContext } from './plugins';
import { advanceDist, applyBoost, endDrift, speedOf } from './kart';

const DEG = Math.PI / 180;
const LIP_ERR = STUNT.jump.lipAngle * DEG;
const CLEAN_ERR = STUNT.jump.cleanAngle * DEG;
const NET_HOLD = ticks(STUNT.jump.netHold);
const NET_AIR = ticks(STUNT.jump.netAir);
const NET_INV = ticks(STUNT.jump.invTime);
const LANE_ENTER = ticks(STUNT.wall.enter);
/** a gap flight this far under the far deck's edge hits its face (the net catches it) */
const LIP_FACE = 0.5;
const DRIFT_BOOST = DRIFT.boost;

const q: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road, wallL: 0, wallR: 0, branch: -1 };

/** Karts on a loop's rail, in a jump gap's flight or held by its net cannot be hit or bumped. */
export function stuntImmune(k: KartState): boolean {
  return k.rail > 0 || k.gapLaunch > 0 || k.netTicks > 0;
}

/** Did the kart cross main sample `at` going forward this tick (from `prevSi` to `si`)? The ramp lip test. */
function crossed(n: number, prevSi: number, si: number, at: number): boolean {
  const before = (at - prevSi + n) % n;
  const after = (si - at + n) % n;
  return before > 0 && before < 6 && after < 6;
}

// ---------------------------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------------------------

/** After the kart moved on the main loop: attach to a loop whose zone start it just crossed. True when attached. */
export function tryAttachRail(ctx: SimContext, idx: number, k: KartState, prevSi: number, hit: TrackHit, top: number): boolean {
  const t = ctx.track;
  if (!t.pieces.length || (hit.branch ?? -1) !== -1) return false;
  const pc = pieceAtSample(t, hit.i);
  if (!pc || pc.kind !== 'loop' || !crossed(t.n, prevSi, hit.i, pc.i0)) return false;
  // a drift ends and pays what it earned at once ("free payout"); hop and drift input are ignored on the rail
  if (k.driftDir !== 0) {
    if (k.driftTier > 0) {
      applyBoost(ctx, idx, DRIFT.level, DRIFT_BOOST[k.driftTier - 1], BoostSource.MiniTurbo);
      ctx.emit({ type: 'miniTurbo', kart: idx, a: k.driftTier });
    }
    ctx.emit({ type: 'driftEnd', kart: idx });
    endDrift(k);
  }
  let ds = hit.s - pc.i0 * t.step;
  if (ds < 0) ds += t.length;
  if (ds > t.length / 2) ds = 0;
  k.rail = pc.id + 1;
  k.su = ds / LOOP_K;
  k.sd = clamp(hit.d, -STUNT.loop.maxSd, STUNT.loop.maxSd);
  k.hopTicks = 0;
  k.armTicks = 0;
  k.air = 0;
  k.airTicks = 0;
  k.lipTicks = -1;
  k.trick = 0;
  k.vy = 0;
  k.wall = 0;
  k.laneTicks = 0;
  const v = Math.max(speedOf(k), STUNT.loop.floor * top);
  ctx.emit({ type: 'stuntEnter', kart: idx, a: pc.k, b: pc.id });
  railPlace(ctx, k, pc, v);
  return true;
}

/**
 * One tick on the rail. `nextV` is the kart's speed rule (gas, boosts, coasting). Returns after the kart was placed;
 * on the exit tick the kart is back on the main loop with the exit boost.
 */
export function stepRail(ctx: SimContext, idx: number, k: KartState, inp: TickInput, nextV: (v: number) => number, top: number, a0: number, stunned: boolean): void {
  const t = ctx.track;
  const pc = t.pieces[k.rail - 1];
  if (!pc || pc.kind !== 'loop') {
    k.rail = 0;
    return;
  }
  // the loop carries the kart at `railLevel` × its own top speed (the ribbon is longer than its shadow: this keeps the
  // loop about lap-time neutral). Its own top: an AI's rubber band still applies, so the loop never evens out the field.
  const want = top * STUNT.loop.railLevel;
  let v = speedOf(k);
  if (v < want) v = Math.min(want, v + a0 * BOOST.accelMult * pow06(1 - v / want) * DT);
  else v = Math.max(want, nextV(v));
  v = Math.max(v, STUNT.loop.floor * top);
  k.su += v * DT;
  // steering: 0.4× the road feel, auto-centre when the stick is near the middle
  const steer = stunned ? 0 : clamp(inp.steer, -7, 7);
  k.sd += (steer / 7) * STUNT.loop.steerRate * DT;
  if (Math.abs(steer) < STUNT.loop.centreSteer) k.sd -= clamp(k.sd, -STUNT.loop.centre * DT, STUNT.loop.centre * DT);
  k.sd = clamp(k.sd, -STUNT.loop.maxSd, STUNT.loop.maxSd);
  k.steer += clamp(steer / 7 - k.steer, -DT / PHYS.steerSmooth, DT / PHYS.steerSmooth);
  if (k.su >= LOOP_LP) {
    // exit: on the main loop at the zone end (plus what the rail overshot), with the exit boost
    const over = (k.su - LOOP_LP) * LOOP_K;
    k.rail = 0;
    k.su = 0;
    const j = (pc.i1 + Math.round(over / t.step)) % t.n;
    const d = k.sd;
    k.sd = 0;
    setOnMain(ctx, k, j, d, v);
    advanceDist(t.length, k, k.s, v * DT + 0.5);
    applyBoost(ctx, idx, STUNT.loop.exitLevel, STUNT.loop.exitTime, BoostSource.Stunt);
    ctx.emit({ type: 'stuntExit', kart: idx, a: pc.k, b: 1 });
    return;
  }
  v = Math.max(v, 0);
  railPlace(ctx, k, pc, v);
}

/** Put a railed kart at its planar spot: the shadow at `su × LOOP_K` metres from the zone start, `sd` to the right. */
function railPlace(ctx: SimContext, k: KartState, pc: BuiltPiece, v: number): void {
  const t = ctx.track;
  const along = clamp(k.su * LOOP_K, 0, pc.lenM);
  const f = along / t.step;
  const fi = Math.floor(f);
  const fr = f - fi;
  const i = (pc.i0 + fi) % t.n;
  const j = (i + 1) % t.n;
  const tx = t.tx[i];
  const tz = t.tz[i];
  k.x = t.px[i] + (t.px[j] - t.px[i]) * fr - tz * k.sd;
  k.z = t.pz[i] + (t.pz[j] - t.pz[i]) * fr + tx * k.sd;
  queryTrack(t, k.x, k.z, k.si, q);
  k.y = q.y;
  k.si = q.i;
  k.s = q.s;
  k.d = q.d;
  k.branch = -1;
  k.surface = Surface.Road;
  k.heading = atan2L(t.tx[q.i], t.tz[q.i]);
  k.vx = t.tx[q.i] * v;
  k.vz = t.tz[q.i] * v;
  k.vy = 0;
  k.wall = 0;
  advanceDist(t.length, k, q.s, v * DT + 0.5);
}

/** Set the kart down on the main loop at sample j, lateral d, facing along the road at speed v. */
function setOnMain(ctx: SimContext, k: KartState, j: number, d: number, v: number): void {
  const t = ctx.track;
  const tx = t.tx[j];
  const tz = t.tz[j];
  k.x = t.px[j] - tz * d;
  k.z = t.pz[j] + tx * d;
  queryTrack(t, k.x, k.z, j, q);
  k.y = q.y;
  k.si = q.i;
  k.s = q.s;
  k.d = q.d;
  k.branch = q.branch ?? -1;
  k.surface = q.surface;
  k.heading = atan2L(tx, tz);
  k.vx = tx * v;
  k.vz = tz * v;
  k.vy = 0;
  k.air = 0;
  k.airTicks = 0;
  k.lipTicks = -1;
}

/** Two railed karts that touch only nudge each other sideways (≤ 0.3 m a tick, no speed loss, no spin). */
export function railNudge(a: KartState, b: KartState): void {
  if (a.rail !== b.rail) return;
  const dsu = b.su - a.su;
  if (dsu > 2.4 || dsu < -2.4) return;
  const dd = b.sd - a.sd;
  const gap = 1.7 - (dd < 0 ? -dd : dd);
  if (gap <= 0) return;
  const push = Math.min(0.3, gap / 2) * (dd >= 0 ? 1 : -1);
  a.sd = clamp(a.sd - push, -STUNT.loop.maxSd, STUNT.loop.maxSd);
  b.sd = clamp(b.sd + push, -STUNT.loop.maxSd, STUNT.loop.maxSd);
}

// ---------------------------------------------------------------------------------------------
// wall ride
// ---------------------------------------------------------------------------------------------

/** Lane width (m) past the road edge on the side of lateral `d` at main sample i (0 = no lane there). */
export function laneAt(t: SimContext['track'], i: number, d: number): number {
  return d > 0 ? t.laneR[i] : t.laneL[i];
}

/**
 * After the kart moved (grounded): the wall lane's boost, magnet and enter / exit events. `hit` is the query at the
 * kart's position; the magnet moves the kart and keeps `hit.d` in step.
 */
export function stepLane(ctx: SimContext, idx: number, k: KartState, inp: TickInput, hit: TrackHit): void {
  const t = ctx.track;
  const on = hit.surface === Surface.WallRide && (hit.branch ?? -1) === -1;
  if (on && !k.air) {
    k.boostTicks = Math.max(k.boostTicks, ticks(STUNT.wall.time));
    k.boostLevel = Math.max(k.boostLevel, STUNT.wall.level);
    const side = hit.d > 0 ? 1 : -1;
    const lane = laneAt(t, hit.i, hit.d);
    // the magnet: toward the lane centre, unless the player steers back onto the road on purpose
    if (!(inp.steer * side <= -STUNT.wall.magnetOff)) {
      const want = side * (t.halfW[hit.i] + lane / 2);
      const delta = clamp(want - hit.d, -STUNT.wall.magnet * DT, STUNT.wall.magnet * DT);
      k.x += -t.tz[hit.i] * delta;
      k.z += t.tx[hit.i] * delta;
      hit.d += delta;
    }
    if (++k.laneTicks === LANE_ENTER) {
      const pc = pieceAtSample(t, hit.i);
      ctx.emit({ type: 'stuntEnter', kart: idx, a: 1, b: pc ? pc.id : -1 });
    }
  } else if (!k.air && k.laneTicks > 0) {
    if (k.laneTicks >= LANE_ENTER) {
      const pc = pieceAtSample(t, k.si);
      const ridden = k.laneTicks * DT * speedOf(k);
      ctx.emit({ type: 'stuntExit', kart: idx, a: 1, b: pc && ridden >= STUNT.wall.clean * (pc.lenM - 2 * STUNT.wall.taper) ? 1 : 0 });
    }
    k.laneTicks = 0;
  }
}

// ---------------------------------------------------------------------------------------------
// jump gap
// ---------------------------------------------------------------------------------------------

/** The jump whose lip the kart crossed this tick (main loop only), or null. */
export function lipCrossed(ctx: SimContext, prevSi: number, hit: TrackHit): BuiltPiece | null {
  const t = ctx.track;
  if (!t.pieces.length || (hit.branch ?? -1) !== -1) return null;
  const pc = pieceAtSample(t, hit.i) ?? pieceAtSample(t, prevSi);
  if (!pc || pc.kind !== 'jump' || pc.gap <= 0 || !crossed(t.n, prevSi, hit.i, pc.i0)) return null;
  return pc;
}

/**
 * Launch over a jump gap (or off a kicker): at least `floor × top`, the heading within ±10° of the road, and `vy` so
 * the arc lands `aim` m past the far lip (fast karts fly at least `tMin` s and land further, inside the window).
 */
export function launch(ctx: SimContext, idx: number, k: KartState, pc: BuiltPiece, top: number): void {
  const t = ctx.track;
  const i = pc.i0;
  const tan = atan2L(t.tx[i], t.tz[i]);
  const err = clamp(wrapAngle(k.heading - tan), -LIP_ERR, LIP_ERR);
  k.heading = wrapAngle(tan + err);
  const vh = Math.max(speedOf(k), STUNT.jump.floor * top);
  k.vx = sinL(k.heading) * vh;
  k.vz = cosL(k.heading) * vh;
  const aim = pc.gap + STUNT.jump.aim;
  const T = clamp(aim / vh, STUNT.jump.tMin, STUNT.jump.tMax);
  const drop = k.y - pc.landY;
  const g = PHYS.gravity;
  // + g·DT/2: the semi-implicit Euler step lands that much early otherwise
  k.vy = (g * T * T * 0.5 - drop) / T + g * DT * 0.5;
  k.air = 1;
  k.airTicks = 0;
  k.lipTicks = 0;
  k.trick = 0;
  k.gapLaunch = pc.id + 1;
  if (k.driftDir !== 0) {
    ctx.emit({ type: 'driftEnd', kart: idx });
    endDrift(k);
  }
  ctx.emit({ type: 'ramp', kart: idx });
  ctx.emit({ type: 'stuntEnter', kart: idx, a: pc.k, b: pc.id });
}

/** In the air after a gap launch: the magnet toward the racing line and the heading toward the road. */
export function airAssist(ctx: SimContext, k: KartState, hit: TrackHit): void {
  const t = ctx.track;
  const i = hit.i;
  const lim = Math.max(0.5, t.halfW[i] - 1.5);
  const want = clamp(t.line[i], -lim, lim);
  const delta = clamp(want - hit.d, -STUNT.jump.magnet * DT, STUNT.jump.magnet * DT);
  k.x += -t.tz[i] * delta;
  k.z += t.tx[i] * delta;
  hit.d += delta;
  const tan = atan2L(t.tx[i], t.tz[i]);
  const dh = clamp(wrapAngle(tan - k.heading), -STUNT.jump.turn * DT, STUNT.jump.turn * DT);
  if (dh !== 0) {
    k.heading = wrapAngle(k.heading + dh);
    // the flight path turns with the nose (the kart is "steered" by the assist, not skidding)
    const c = cosL(dh);
    const s = sinL(dh);
    const vx = k.vx * c + k.vz * s;
    const vz = -k.vx * s + k.vz * c;
    k.vx = vx;
    k.vz = vz;
  }
}

/** On touchdown after a gap launch: the clean-landing boost and events. */
export function landed(ctx: SimContext, idx: number, k: KartState, airTicks: number, hit: TrackHit): void {
  const t = ctx.track;
  const pc = t.pieces[k.gapLaunch - 1];
  k.gapLaunch = 0;
  if (!pc) return;
  const tan = atan2L(t.tx[hit.i], t.tz[hit.i]);
  const clean = Math.abs(wrapAngle(k.heading - tan)) <= CLEAN_ERR && k.spinTicks === 0 && k.leapTicks === 0;
  if (clean) {
    applyBoost(ctx, idx, STUNT.jump.landLevel, STUNT.jump.landTime, BoostSource.Stunt);
    ctx.emit({ type: 'stuntLand', kart: idx, a: airTicks, b: pc.id });
  }
  ctx.emit({ type: 'stuntExit', kart: idx, a: pc.k, b: clean ? 1 : 0 });
}

/**
 * The catch net (always-safe fallback): over a gap and below the far deck by `netBelow` m, or in a gap flight for too
 * long. Freezes the kart for `netHold` s. True when it caught the kart.
 */
export function checkNet(ctx: SimContext, idx: number, k: KartState): boolean {
  const t = ctx.track;
  if (!t.pieces.length || k.netTicks > 0 || k.branch !== -1) return false;
  const pc = pieceAtSample(t, k.si);
  if (!pc || pc.kind !== 'jump' || pc.gap <= 0) return false;
  const over = t.gapMask[k.si] === 1;
  const low = over && k.y < pc.landY - STUNT.jump.netBelow;
  const long = k.gapLaunch > 0 && k.air === 1 && k.airTicks > NET_AIR;
  if (!low && !long) return false;
  catchNet(ctx, idx, k, pc);
  return true;
}

/**
 * A gap flight that reaches the far deck from below its edge (it would hit the lip's face): the net, not a pop-up
 * onto the deck. Call before the landing test with the ground height under the kart. True when it caught the kart.
 */
export function hitsLipFace(ctx: SimContext, idx: number, k: KartState, hit: TrackHit, groundY: number): boolean {
  if (k.gapLaunch <= 0 || k.netTicks > 0 || ctx.track.gapMask[hit.i] === 1 || k.y >= groundY - LIP_FACE) return false;
  const pc = ctx.track.pieces[k.gapLaunch - 1];
  if (!pc) return false;
  catchNet(ctx, idx, k, pc);
  return true;
}

/** The net takes the kart: frozen for `netHold` s in the net under the gap, then set down past the far lip. */
function catchNet(ctx: SimContext, idx: number, k: KartState, pc: BuiltPiece): void {
  const t = ctx.track;
  // held at the middle of the gap (the net's sag), so the release finds the piece again
  const mid = (pc.i0 + Math.round((pc.i1 - pc.i0 + (pc.i1 < pc.i0 ? t.n : 0)) / 2)) % t.n;
  const d = clamp(k.d, -t.halfW[mid], t.halfW[mid]);
  k.si = mid;
  k.x = t.px[mid] - t.tz[mid] * d;
  k.z = t.pz[mid] + t.tx[mid] * d;
  k.netTicks = NET_HOLD;
  k.gapLaunch = 0;
  k.vx = 0;
  k.vz = 0;
  k.vy = 0;
  k.air = 0;
  k.airTicks = 0;
  k.lipTicks = -1;
  k.trick = 0;
  k.y = Math.min(pc.lipY, pc.landY) - 2.4;
  if (k.driftDir !== 0) {
    ctx.emit({ type: 'driftEnd', kart: idx });
    endDrift(k);
  }
  ctx.emit({ type: 'netCatch', kart: idx, b: pc.id });
}

/** While the net holds the kart: count down, then set it down past the far lip. */
export function stepNet(ctx: SimContext, k: KartState, top: number): void {
  const t = ctx.track;
  if (--k.netTicks > 0) return;
  const pc = pieceAtSample(t, k.si);
  const j = pc ? (pc.i1 + Math.round(STUNT.jump.netPlace / t.step)) % t.n : k.si;
  const lim = Math.max(0.5, Math.min(2, t.halfW[j] - 1.5));
  setOnMain(ctx, k, j, clamp(t.line[j], -lim, lim), STUNT.jump.netSpeed * top);
  k.invTicks = Math.max(k.invTicks, NET_INV);
  k.progDist = k.dist;
  k.stuckTicks = 0;
  k.wrongTicks = 0;
}
