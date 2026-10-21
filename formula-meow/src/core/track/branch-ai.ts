/**
 * Alternative routes for the AI (iteration 2, tracks lane). `followLine` (core/sim/autopilot.ts) asks `branchSteer`
 * first: on a branch, or heading for one it has chosen, the kart steers along the branch's racing line (and on past
 * the merge); otherwise the normal line follower runs.
 *
 * The choice is made once per lap and branch, when the fork comes into view, from a hash of (seed, kart, lap, branch)
 * so it costs no draw from any RNG stream, and is kept in `RaceState.hazards.plan` (hashed by the hazard system):
 * - a branch expected to be faster (branch.ts `tBranch` < `tMain`, an off-road one only while boosting, a gap only
 *   when the kart will be fast enough to clear it) is taken by 45 % of skilled cats (skill ≥ 0.6) and 18 % of the rest;
 * - a slower one by 12 % (curious cats), so every route sees traffic.
 * Humans (and the player's bot) never get a plan: they choose with the steering.
 * Set pieces (SIM_VERSION 8, ai-ugc lane) sit on the main road only (the build keeps them out of fork and merge
 * windows), so the main route's expected time counts the pieces between fork and merge (`mainStuntTime`).
 *
 * Sim-safe math only.
 */
import { Surface, type TickInput } from '../../types';
import { AI, PHYS } from '../../tuning';
import type { SimContext } from '../sim/plugins';
import { atan2L, clamp, cosL, sinL, wrapAngle } from '../sim/fixed';
import { fnvInt, FNV_OFFSET } from '../sim/hash';
import { rngFloat, seedRng } from '../sim/rng';
import { branchFoot, fwd, type BuiltBranch, type Foot } from './branch';
import { local, roombaPose, sheetHalfWidth, sheetOffset, steamState, toasterState } from '../../tracks/hazards/geometry';

const STEER_GAIN = 2.4;
/** the plan is made this far before the fork (beyond the look-ahead) */
const DECIDE_AHEAD = 30;
/** a kart that chose the branch keeps aiming at it while the two roads overlap, and this far beyond */
const PAST_FORK = 12;

const foot: Foot = { j: 0, along: 0, d: 0 };

/**
 * Seconds a set piece on the main route adds to it (negative: saves), against driving its shadow flat. Measured on
 * the stunt lab (Engine step, all three classes): a loop is lap-time neutral (rail −0.02 to 0.00 s: its 1.35 rail
 * speed, entry strip and exit boost pay for the longer ribbon); a jump gap's aimed flight is neutral and a clean
 * landing's 1.2 boost for 0.5 s gives back about 0.05 s; a wall lane is optional (its boost balances its longer line);
 * a tunnel has no sim rule.
 */
export const STUNT_ROUTE_TIME = { loop: 0, jump: -0.05, wall: 0, tunnel: 0 } as const;

const stuntMemo = new WeakMap<BuiltBranch, number>();

/** Seconds the set pieces on the main road between branch b's fork and merge add to the main route. */
export function mainStuntTime(t: SimContext['track'], b: BuiltBranch): number {
  const hit = stuntMemo.get(b);
  if (hit !== undefined) return hit;
  let s = 0;
  const span = fwd(b.from, b.to, t.n);
  for (const pc of t.pieces ?? []) {
    if (pc.kind === 'jump' && pc.gap <= 0) continue;
    if (fwd(b.from, pc.i0, t.n) <= span) s += STUNT_ROUTE_TIME[pc.kind];
  }
  stuntMemo.set(b, s);
  return s;
}

const mouthMemo = new WeakMap<BuiltBranch, number>();

/**
 * Main samples from branch b's fork to the end of its mouth: the first sample past the fork where the main road's wall
 * on the branch's side (`sideA`) is no longer widened toward it (`junction`), after it has been. Infinity when the
 * wall is never widened there (nothing to go by: the old overlap window applies).
 */
export function mouthEnd(t: SimContext['track'], b: BuiltBranch): number {
  const hit = mouthMemo.get(b);
  if (hit !== undefined) return hit;
  const bit = b.sideA > 0 ? 2 : 1;
  const max = Math.min(b.span, Math.round((Math.max(PAST_FORK, b.overlap) + 40) / t.step));
  let opened = false;
  let end = Infinity;
  for (let k = 0; k <= max; k++) {
    const on = (t.junction[(b.from + k) % t.n] & bit) !== 0;
    if (on) opened = true;
    else if (opened) {
      end = k;
      break;
    }
  }
  mouthMemo.set(b, end);
  return end;
}

/**
 * The route the last `branchSteer` call steered along, so `curvatureAhead` (asked by the AI's drift and corner-speed
 * logic right after `followLine`, for the same kart) reads the branch's bends instead of the main loop's at the
 * kart's mapped `si`. Plain module scratch: set and read within one kart's drive in one tick, so replays stay exact.
 */
const route = { on: false, st: null as unknown, si: -1, b: null as BuiltBranch | null, u0: 0 };

/** Curvature (1/m, + = left) along the route a kart is steering on, `from`..`to` metres ahead; null = the main loop. */
export function routeCurvature(ctx: SimContext, si: number, from: number, to: number): number | null {
  if (!route.on || route.st !== ctx.st || route.si !== si || !route.b) return null;
  const b = route.b;
  const t = ctx.track;
  // lining up for the branch (until it leaves the main road): no drift, no lift
  if (route.u0 < b.overlap) return 0;
  let sum = 0;
  let c = 0;
  for (let u = route.u0 + from; u <= route.u0 + to; u += 1) {
    if (u < 0) sum += t.curv[(b.from + Math.round(u / t.step) + t.n) % t.n];
    else if (u <= b.length) sum += b.curv[Math.min(b.m - 1, Math.round(u / b.step))];
    else sum += t.curv[(b.to + Math.round((u - b.length) / t.step)) % t.n];
    c++;
  }
  return c ? sum / c : 0;
}

/** Metres left on the branch the last `branchSteer` call routed kart `si` along (null: not on a branch route). */
export function routeRemaining(ctx: SimContext, si: number): number | null {
  if (!route.on || route.st !== ctx.st || route.si !== si || !route.b) return null;
  return route.b.length - route.u0;
}

function planOf(ctx: SimContext): number[] {
  const h = ctx.st.hazards as { plan?: number[] };
  const n = ctx.st.karts.length;
  if (!h.plan || h.plan.length !== n) h.plan = new Array<number>(n).fill(0);
  return h.plan;
}

/** Speed (m/s) a kart needs to clear branch b's gap: the far side is lower, so the flight is sqrt(2 drop / g). */
function gapSpeed(b: BuiltBranch): number {
  const g = b.gap!;
  const len = (g.j1 - g.j0) * b.step;
  const drop = Math.max(0.2, b.py[g.j0] - g.y1);
  return len / Math.sqrt((2 * drop) / PHYS.gravity);
}

/** Will AI kart `idx` take branch `b` this lap? (made once, then remembered in the plan) */
export function takesBranch(ctx: SimContext, idx: number, b: BuiltBranch, botSkill?: number): boolean {
  const k = ctx.st.karts[idx];
  const p = ctx.cfg.racers[idx]?.ai;
  // a human kart (the player's bot asks too, from outside the sim step) never has a plan, and never writes one.
  // [integrator] the scripted player bot (`botSkill`) takes a faster branch like an AI of its skill would, decided
  // from the same (seed, kart, lap, branch) hash and the track alone, so it needs no saved plan
  if (!p) return botSkill !== undefined && botTakes(ctx, idx, b, botSkill);
  const plan = planOf(ctx);
  const key = (k.lapMax * 16 + b.id + 1) * 2;
  if (plan[idx] >> 1 === key >> 1) return (plan[idx] & 1) === 1;
  let take = false;
  {
    const boosting = k.boostTicks > 20;
    let faster = b.tBranch < (b.tMain + mainStuntTime(ctx.track, b)) * 0.995 || (b.surface === Surface.Offroad && boosting && b.length < b.span * ctx.track.step);
    if (b.gap) {
      // a pad on the run-up to the gap boosts every kart that hits it
      const g = b.gap;
      const padded = b.pads.some((pad) => pad.j < g.j0 && (g.j0 - pad.j) * b.step < 40);
      const top = ctx.tun.topSpeed * (boosting || padded ? 1.3 : 1) * Math.min(1, k.topScale);
      if (top * 0.97 < gapSpeed(b)) faster = false;
    }
    const u = rngFloat(seedRng(fnvInt(fnvInt(fnvInt(fnvInt(FNV_OFFSET, ctx.cfg.seed), idx), k.lapMax), b.id)));
    take = faster ? u < (p.skill >= 0.6 ? 0.32 : 0.14) : u < 0.12 && !b.gap;
  }
  plan[idx] = key | (take ? 1 : 0);
  return take;
}

function botTakes(ctx: SimContext, idx: number, b: BuiltBranch, skill: number): boolean {
  if (b.tBranch >= (b.tMain + mainStuntTime(ctx.track, b)) * 0.995) return false;
  if (b.gap) {
    const g = b.gap;
    const padded = b.pads.some((pad) => pad.j < g.j0 && (g.j0 - pad.j) * b.step < 40);
    if (ctx.tun.topSpeed * (padded ? 1.3 : 1) * 0.97 < gapSpeed(b)) return false;
  }
  const k = ctx.st.karts[idx];
  const u = rngFloat(seedRng(fnvInt(fnvInt(fnvInt(fnvInt(FNV_OFFSET, ctx.cfg.seed), idx), k.lapMax), b.id)));
  return u < (skill >= 0.6 ? 0.45 : 0.18);
}

/** Scratch steering target. */
const tgt = { x: 0, z: 0 };
const pose = { x: 0, z: 0, fx: 0, fz: 1 };
const loc = { a: 0, d: 0 };

/**
 * Steer kart `idx` along a branch it is on or has chosen, or round a hazard on its way (null = neither: use the main
 * racing line). Mirrors `followLine`: a point `look` metres ahead, the racing line plus `bias`, a chord correction.
 */
export function branchSteer(ctx: SimContext, idx: number, out: TickInput, bias: number, lookScale: number, dodgeSkill?: number): number | null {
  route.on = false;
  const t = ctx.track;
  if (!t.branches.length && !t.hazards.length) return null;
  const k = ctx.st.karts[idx];
  const sp = Math.sqrt(k.vx * k.vx + k.vz * k.vz);
  const look = clamp(sp * AI.lookTime, AI.lookMin, AI.lookMax) * lookScale;
  if (!branchTarget(ctx, idx, look, bias, dodgeSkill) && !dodgeTarget(ctx, idx, look, dodgeSkill) && !junctionTarget(ctx, idx, look, bias)) return null;
  const want = atan2L(tgt.x - k.x, tgt.z - k.z);
  const face = k.driftDir !== 0 ? atan2L(k.vx, k.vz) : k.heading;
  const err = wrapAngle(want - face);
  out.steer = Math.round(clamp(-err * STEER_GAIN, -1, 1) * 7);
  out.gas = true;
  out.brake = false;
  out.drift = false;
  out.item = false;
  out.itemBack = false;
  const vf = k.vx * sinL(k.heading) + k.vz * cosL(k.heading);
  if ((Math.abs(err) > 1.9 && sp < 7) || (vf < -0.3 && Math.abs(err) > 0.8)) {
    out.gas = false;
    out.brake = true;
    out.steer = -out.steer;
  }
  return err;
}

/** The steering target along a branch the kart is on or has chosen (sets `tgt` and `route`); false = no branch. */
function branchTarget(ctx: SimContext, idx: number, look: number, bias: number, botSkill?: number): boolean {
  const t = ctx.track;
  if (!t.branches.length) return false;
  const k = ctx.st.karts[idx];
  let b: BuiltBranch | null = null;
  let u0 = 0;
  if (k.branch >= 0) {
    b = t.branches.find((x) => x.id === k.branch) ?? null;
    if (!b || !branchFoot(b, k.x, k.z, foot)) return false;
    u0 = foot.j * b.step + foot.along;
    // drifted onto the branch's mouth without choosing it (the roads still overlap there): back to the main line
    if (u0 < b.overlap && !takesBranch(ctx, idx, b, botSkill)) return false;
  } else {
    const L = t.length;
    for (const x of t.branches) {
      let ahead = fwd(k.si, x.from, t.n) * t.step;
      if (ahead > L / 2) ahead -= L;
      // past the stretch where the roads overlap and still on the main road: too late, stay on it
      if (ahead > look + DECIDE_AHEAD || ahead < -Math.max(PAST_FORK, x.overlap)) continue;
      // SIM_VERSION 10: past the end of the branch's mouth (the main wall on its side is back to normal) the branch can
      // no longer be reached from here: a kart that kept aiming at it crawled into the main wall (Yarn, ~6 s)
      if (ahead < 0 && -ahead >= mouthEnd(t, x) * t.step) continue;
      if (!takesBranch(ctx, idx, x, botSkill)) continue;
      b = x;
      u0 = -ahead;
      break;
    }
    if (!b) return false;
  }
  const ut = u0 + look;
  if (ut <= 0) return false;
  if (ut <= b.length) {
    const j = clamp(Math.round(ut / b.step), 0, b.m - 1);
    const jm = clamp(Math.round((u0 + look / 2) / b.step), 0, b.m - 1);
    const lim = Math.max(0.5, b.halfW[j] - AI.edge);
    const chord = (look * look * b.curv[jm]) / 8;
    const inside = Math.max(0.5, lim - 1);
    const lo = b.curv[jm] > 0.012 ? -inside : -lim;
    const hi = b.curv[jm] < -0.012 ? inside : lim;
    let d = clamp(b.line[j] + bias * lim + chord, lo, hi);
    const dodge = k.branch >= 0 ? hazardDodge(ctx, idx, b.id, u0, Math.sqrt(k.vx * k.vx + k.vz * k.vz)) : null;
    if (dodge !== null) d = clamp(dodge, -lim, lim);
    tgt.x = b.px[j] - b.tz[j] * d;
    tgt.z = b.pz[j] + b.tx[j] * d;
  } else {
    const i = (b.to + Math.round((ut - b.length) / t.step)) % t.n;
    const lim = Math.max(0.5, t.halfW[i] - AI.edge);
    const d = clamp(t.line[i] + bias * lim, -lim, lim);
    tgt.x = t.px[i] - t.tz[i] * d;
    tgt.z = t.pz[i] + t.tx[i] * d;
  }
  route.on = true;
  route.st = ctx.st;
  route.si = k.si;
  route.b = b;
  route.u0 = u0;
  return true;
}

/** A hazard on the main road ahead that the kart means to steer round (sets `tgt`); false = none. */
function dodgeTarget(ctx: SimContext, idx: number, look: number, dodgeSkill?: number): boolean {
  const t = ctx.track;
  const k = ctx.st.karts[idx];
  if (k.branch >= 0 || !t.hazards.length) return false;
  const d0 = hazardDodge(ctx, idx, -1, k.s, Math.sqrt(k.vx * k.vx + k.vz * k.vz), dodgeSkill);
  if (d0 === null) return false;
  const j = (k.si + Math.max(1, Math.round(look / t.step))) % t.n;
  const lim = Math.max(0.5, t.halfW[j] - AI.edge);
  const d = clamp(d0, -lim, lim);
  tgt.x = t.px[j] - t.tz[j] * d;
  tgt.z = t.pz[j] + t.tx[j] * d;
  return true;
}

/**
 * An AI kart on the main road near a fork it is not taking, or near a merge, keeps to the half of the road away from
 * the branch (so it never runs into the gore between the two roads); false = no junction near.
 */
function junctionTarget(ctx: SimContext, idx: number, look: number, bias: number): boolean {
  const t = ctx.track;
  const k = ctx.st.karts[idx];
  if (k.branch >= 0 || !t.branches.length || !ctx.cfg.racers[idx]?.ai) return false;
  const L = t.length;
  for (const b of t.branches) {
    let toFork = fwd(k.si, b.from, t.n) * t.step;
    if (toFork > L / 2) toFork -= L;
    let toMerge = fwd(k.si, b.to, t.n) * t.step;
    if (toMerge > L / 2) toMerge -= L;
    let side = 0;
    if (toFork < look + 20 && toFork > -(b.overlap + 10) && !takesBranch(ctx, idx, b)) side = b.sideA;
    else if (toMerge < b.overlapEnd + 20 && toMerge > -8) side = b.sideB;
    if (!side) continue;
    const j = (k.si + Math.max(1, Math.round(look / t.step))) % t.n;
    const lim = Math.max(0.5, t.halfW[j] - AI.edge);
    let d = clamp(t.line[j] + bias * lim, -lim, lim);
    d = side > 0 ? Math.min(d, -1.2) : Math.max(d, 1.2);
    tgt.x = t.px[j] - t.tz[j] * d;
    tgt.z = t.pz[j] + t.tx[j] * d;
    return true;
  }
  return false;
}

/** An AI starts to steer round a hazard this far ahead (m), until it is this close. */
const DODGE_FAR = 28;
const DODGE_NEAR = 1;

/**
 * The lateral offset an AI kart wants to pass the next hazard on its road at (null = nothing to dodge). `where` is
 * the kart's lap position `s` on the main road (branch -1) or its arc position on branch `branch`. Whether this cat
 * spots it is a hash of (seed, kart, lap, hazard), likelier the more skilled it is (no RNG draw); the pose is
 * predicted for the moment it arrives, so a roomba is passed where it will be and a toaster only avoided when it is
 * about to pop.
 */
export function hazardDodge(ctx: SimContext, idx: number, branch: number, where: number, speed: number, dodgeSkill?: number): number | null {
  // [integrator] the scripted player bot (balance harness, `?bot=1`) passes its own skill: it watches the warnings too
  const skill = ctx.cfg.racers[idx]?.ai?.skill ?? dodgeSkill;
  if (skill === undefined) return null;
  const t = ctx.track;
  const k = ctx.st.karts[idx];
  for (const h of t.hazards) {
    if (h.branch !== branch || h.kind === 'drum') continue;
    let ahead: number;
    if (branch < 0) {
      ahead = h.i * t.step - where;
      if (ahead > t.length / 2) ahead -= t.length;
      else if (ahead < -t.length / 2) ahead += t.length;
    } else {
      const b = t.branches.find((x) => x.id === branch);
      if (!b || !branchFoot(b, h.x, h.z, foot)) continue;
      ahead = foot.j * b.step - where;
    }
    if (ahead < DODGE_NEAR || ahead > DODGE_FAR) continue;
    const u = rngFloat(seedRng(fnvInt(fnvInt(fnvInt(fnvInt(FNV_OFFSET, ctx.cfg.seed + 7), idx), k.lapMax), h.id)));
    if (u >= 0.3 + 0.6 * skill) continue;
    const at = ctx.st.tick + Math.round((ahead / Math.max(5, speed)) * 60);
    // the kart's lateral offset now, in the hazard's road frame
    local(h, k.x, k.z, loc);
    const kd = loc.d;
    const hw = h.halfW;
    const away = h.d !== 0 ? -Math.sign(h.d) * hw * 0.55 : kd > 0 ? hw * 0.6 : -hw * 0.6;
    switch (h.kind) {
      case 'roomba':
        roombaPose(h, at, pose);
        local(h, pose.x, pose.z, loc);
        if (Math.abs(loc.d - kd) < 3.4) return loc.d > 0 ? loc.d - 3.6 : loc.d + 3.6;
        break;
      case 'laundry': {
        const ds = sheetOffset(h, at);
        const r = sheetHalfWidth(h) + 1.4;
        if (Math.abs(kd - ds) < r) return ds > 0 ? Math.max(-hw, ds - r) : Math.min(hw, ds + r);
        break;
      }
      case 'toaster':
        if (toasterState(h, at) !== 0 || toasterState(h, at - 20) !== 0) return away;
        break;
      case 'steam':
        if (steamState(h, at) !== 0) return away;
        break;
      case 'milk':
        if (Math.abs(kd - h.d) < 4.5) return away;
        break;
      default:
        break;
    }
  }
  return null;
}
