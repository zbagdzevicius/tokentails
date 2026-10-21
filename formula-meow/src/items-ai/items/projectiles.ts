/**
 * Projectiles (items-ai lane, GDD 4): the Hairball (straight shot that rolls along the road and bounces off walls up
 * to 3 times), the homing Yarn ball (runs along the road at the kart ahead) and the Laser Dot (runs ahead at 1.5×
 * leader speed, makes everyone it passes chase it, then spins the leader). Sim-safe math only.
 *
 * Set pieces (SIM_VERSION 8, ai-ugc lane): nothing hits a kart on a loop's rail, in a jump gap's flight or its net
 * (`touchable`). A homing yarn ball loses its lock on such a kart and rolls on along the road ("the stunt shook it
 * off": a reward, never a second hit waiting at the exit); the Laser Dot is locked on the leader, so it holds just behind
 * it until it is out, instead of switching to the kart in second. A hairball rolling over a jump gap carries on at deck height (lip to far deck) instead of dropping into the
 * canyon; a yarn ball hops it. Both stay on the shadow road under a loop and pass beneath the riders.
 *
 * SIM_VERSION 10:
 * - A yarn ball rolls the way its thrower faces (`dir`); in an arena (no race order) or thrown facing back it homes on
 *   the nearest kart in front of the thrower. It never hits its own thrower (a fast owner on the inside of a bend used
 *   to catch its own ball up).
 * - Branches: a yarn ball thrown on a branch rolls along that branch, and follows its target onto one at the fork
 *   (`branch`); a hairball on a branch bounces off the branch's walls.
 */
import { DT, Surface } from '../../types';
import { ITEMS, ticks } from '../../tuning';
import type { SimContext } from '../../core/sim/plugins';
import { queryTrack, wrapDs, type TrackHit } from '../../core/track/query';
import { speedOf } from '../../core/sim/kart';
import { clamp, cosL, sinL } from '../../core/sim/fixed';
import { ProjKind, branchOf, branchSampleAt, facing, itemsOf, routePoint, trackPoint, type Proj } from './state';
import { itemHit, racing, touchable, yarnShield } from './hits';
import { pieceAtSample } from '../../core/track/stunt';

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };
const H = ITEMS.hairball;
const Y = ITEMS.yarnBall;
const L = ITEMS.laser;
const LIFT = 0.55;

function newProj(ctx: SimContext, kind: Proj['kind'], owner: number): Proj {
  const s = itemsOf(ctx.st);
  return { id: s.nextId++, kind, owner, x: 0, y: 0, z: 0, vx: 0, vz: 0, si: 0, dist: 0, d: 0, life: 0, bounces: 0, target: -1, imm: 0, hitMask: 0, age: 0, dir: 1, branch: -1 };
}

/** Hairball: fired forward (or backward) along the kart's heading. */
export function fireHairball(ctx: SimContext, owner: number, back: boolean): void {
  const k = ctx.st.karts[owner];
  const p = newProj(ctx, ProjKind.Hairball, owner);
  const dir = back ? -1 : 1;
  const fx = sinL(k.heading) * dir;
  const fz = cosL(k.heading) * dir;
  const vf = k.vx * sinL(k.heading) + k.vz * cosL(k.heading);
  const sp = back ? H.speed : Math.max(H.speed, vf + 15);
  p.x = k.x + fx * H.spawn;
  p.z = k.z + fz * H.spawn;
  p.vx = fx * sp;
  p.vz = fz * sp;
  queryTrack(ctx.track, p.x, p.z, k.si, hit);
  p.si = hit.i;
  p.dist = k.dist + wrapDs(ctx.track, hit.s - k.s);
  p.d = hit.d;
  p.y = hit.y + LIFT;
  p.life = ticks(H.life);
  p.imm = ticks(H.ownerImmune);
  itemsOf(ctx.st).proj.push(p);
}

/** The kart one place ahead of `kart` that is still racing, or -1 (the leader has nobody to home on). */
export function kartAhead(ctx: SimContext, kart: number): number {
  const { st } = ctx;
  const p = st.order.indexOf(kart);
  for (let j = p - 1; j >= 0; j--) {
    const o = st.order[j];
    if (!st.karts[o].finished) return o;
  }
  return -1;
}

/** Half angle (radians) and reach (m) of the cone a yarn ball picks its target in when there is no race order. */
const CONE = 0.6;
const CONE_R = 60;

/**
 * The nearest touchable kart inside the thrower's facing cone, or -1 (SIM_VERSION 10): the yarn ball's target in an
 * arena, where `st.order` is a points table and not who is in front, and for a ball thrown facing back.
 */
export function kartInFront(ctx: SimContext, kart: number): number {
  const ks = ctx.st.karts;
  const me = ks[kart];
  const fx = sinL(me.heading);
  const fz = cosL(me.heading);
  const cc = cosL(CONE);
  let best = -1;
  let bestD = CONE_R;
  for (let j = 0; j < ks.length; j++) {
    const o = ks[j];
    if (j === kart || !touchable(o)) continue;
    const dx = o.x - me.x;
    const dz = o.z - me.z;
    const dd = Math.sqrt(dx * dx + dz * dz);
    if (dd >= bestD || dd < 0.5 || dx * fx + dz * fz < dd * cc) continue;
    best = j;
    bestD = dd;
  }
  return best;
}

/** Yarn ball: thrown forward (the way the kart faces), homes on the kart ahead along the road. */
export function fireYarnBall(ctx: SimContext, owner: number): void {
  const t = ctx.track;
  const k = ctx.st.karts[owner];
  const p = newProj(ctx, ProjKind.YarnBall, owner);
  p.dir = facing(t, k);
  const b = branchOf(t, k.branch);
  p.dist = k.dist + p.dir * H.spawn * (b ? b.sk : 1);
  p.branch = b && branchSampleAt(t, b, p.dist) >= 0 ? b.id : -1;
  p.d = k.d;
  p.target = !t.arena && p.dir > 0 ? kartAhead(ctx, owner) : kartInFront(ctx, owner);
  p.life = ticks(Y.life);
  p.imm = ticks(H.ownerImmune);
  routePoint(t, p.dist, p.d, p.branch, p);
  p.y += LIFT;
  itemsOf(ctx.st).proj.push(p);
}

const MIN_ARM = ticks(L.minArm);

/**
 * Laser Dot target (B17): the leader still racing, never the owner, and only a kart ahead of `minDist` (the dot
 * never turns back for a kart it already passed). -1 when there is none.
 */
export function laserTarget(ctx: SimContext, owner: number, minDist = -Infinity): number {
  for (const o of ctx.st.order) {
    const k = ctx.st.karts[o];
    if (o === owner || !racing(k)) continue;
    return k.dist > minDist ? o : -1;
  }
  return -1;
}

/** True when the owner leads the race (the Laser Dot has nobody ahead to run to). */
export function ownerLeads(ctx: SimContext, owner: number): boolean {
  for (const o of ctx.st.order) {
    if (!racing(ctx.st.karts[o])) continue;
    return o === owner;
  }
  return true;
}

export function fireLaser(ctx: SimContext, owner: number): void {
  const k = ctx.st.karts[owner];
  // the leader fires it: nobody ahead, so it fizzles with a pop instead of spinning 2nd place on the spot (B17)
  const target = ownerLeads(ctx, owner) ? -1 : laserTarget(ctx, owner, k.dist);
  if (target < 0) {
    ctx.emit({ type: 'itemFizzle', kart: owner, item: 'laser' });
    return;
  }
  const p = newProj(ctx, ProjKind.Laser, owner);
  p.dist = k.dist + 1;
  p.d = k.d;
  p.target = target;
  p.life = ticks(L.life);
  p.hitMask = 1 << owner;
  trackPoint(ctx.track, p.dist, p.d, p);
  p.y += 0.08;
  itemsOf(ctx.st).proj.push(p);
}

function kill(p: Proj): void {
  p.life = 0;
}

/** A hairball or yarn ball against karts, traps and other balls. */
function collide(ctx: SimContext, p: Proj, item: 'hairball' | 'yarn'): void {
  const s = itemsOf(ctx.st);
  const ks = ctx.st.karts;
  const r2 = (p.kind === ProjKind.Hairball ? H.radius : Y.radius) ** 2;
  for (let j = 0; j < ks.length; j++) {
    const k = ks[j];
    // the owner is safe from its hairball for a moment, and always from its own homing yarn ball (SIM_VERSION 10)
    if (!touchable(k) || (j === p.owner && (p.imm > 0 || p.kind === ProjKind.YarnBall))) continue;
    const dx = k.x - p.x;
    const dz = k.z - p.z;
    if (dx * dx + dz * dz > r2 || Math.abs(k.y + 0.4 - p.y) > 1.8) continue;
    if (!yarnShield(ctx, j, p.x, p.z)) itemHit(ctx, j, 'spin', p.owner, item);
    kill(p);
    return;
  }
  for (const t of s.traps) {
    if (t.life <= 0 || t.flight > 0) continue;
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    if (dx * dx + dz * dz < 1.4 * 1.4) {
      t.life = 0;
      kill(p);
      return;
    }
  }
  for (const o of s.proj) {
    if (o === p || o.life <= 0 || o.kind === ProjKind.Laser) continue;
    const dx = o.x - p.x;
    const dz = o.z - p.z;
    if (dx * dx + dz * dz < 1.2 * 1.2) {
      kill(o);
      kill(p);
      return;
    }
  }
}

function stepHairball(ctx: SimContext, p: Proj): void {
  const t = ctx.track;
  const sp = Math.sqrt(p.vx * p.vx + p.vz * p.vz) || 1;
  // rolls along the gutter: the velocity leans gently toward the road direction it travels in
  const tx = t.tx[p.si];
  const tz = t.tz[p.si];
  const sgn = p.vx * tx + p.vz * tz >= 0 ? 1 : -1;
  const a = Math.min(1, H.align * DT);
  let vx = p.vx + (tx * sgn * sp - p.vx) * a;
  let vz = p.vz + (tz * sgn * sp - p.vz) * a;
  const n = Math.sqrt(vx * vx + vz * vz) || 1;
  vx = (vx / n) * sp;
  vz = (vz / n) * sp;
  const prevS = p.dist - t.length * Math.floor(p.dist / t.length);
  p.x += vx * DT;
  p.z += vz * DT;
  queryTrack(t, p.x, p.z, p.si, hit);
  // the walls where the ball is: a branch's own when it rolls on one (SIM_VERSION 10; `d` is the branch's then)
  const lim = (hit.d > 0 ? (hit.wallR ?? t.wallR[hit.i]) : (hit.wallL ?? t.wallL[hit.i])) - 0.5;
  if (Math.abs(hit.d) > lim) {
    const side = hit.d > 0 ? 1 : -1;
    // inward normal = -(right) × side, from the tangent of the road the ball is on
    const bb = (hit.branch ?? -1) >= 0 ? branchOf(t, hit.branch!) : null;
    const bj = bb ? (hit.bj ?? -1) : -1;
    const nx = (bj >= 0 ? bb!.tz[bj] : t.tz[hit.i]) * side;
    const nz = -(bj >= 0 ? bb!.tx[bj] : t.tx[hit.i]) * side;
    const over = Math.abs(hit.d) - lim;
    p.x += nx * over;
    p.z += nz * over;
    const vn = vx * nx + vz * nz;
    if (vn < 0) {
      vx -= 2 * vn * nx;
      vz -= 2 * vn * nz;
      if (++p.bounces > H.bounces) kill(p);
    }
    queryTrack(t, p.x, p.z, hit.i, hit);
  }
  p.vx = vx;
  p.vz = vz;
  p.dist += wrapDs(t, hit.s - prevS);
  p.si = hit.i;
  p.d = hit.d;
  p.y = ((hit.branch ?? -1) >= 0 ? hit.y : deckY(ctx, hit.i, hit.y)) + LIFT;
  if (p.life > 0) collide(ctx, p, 'hairball');
}

/** Metres of a branch's start (or end, rolling against the lap) inside which a yarn ball follows its target onto it. */
const FORK_TAKE = 8;

function stepYarnBall(ctx: SimContext, p: Proj): void {
  const t = ctx.track;
  const ks = ctx.st.karts;
  // SIM_VERSION 8: a target that rides a set piece (untouchable) shakes the ball off; it rolls on unlocked
  if (p.target >= 0 && !touchable(ks[p.target])) p.target = -1;
  // SIM_VERSION 10: on a branch the lap distance runs `sk` times as fast as the ball (its world speed stays the same)
  let b = branchOf(t, p.branch);
  p.dist += p.dir * Math.max(Y.speedMin, ctx.tun.topSpeed * Y.speedTop) * DT * (b ? b.sk : 1);
  let j = b ? branchSampleAt(t, b, p.dist) : -1;
  if (b && j < 0) {
    // rolled off the branch's end back onto the main loop
    p.branch = -1;
    b = null;
  }
  const tk = p.target >= 0 ? ks[p.target] : null;
  // the target took a branch: follow it onto the branch at the fork (or its far end, rolling against the lap)
  if (!b && tk && tk.branch >= 0) {
    const tb = branchOf(t, tk.branch);
    const jj = tb ? branchSampleAt(t, tb, p.dist) : -1;
    if (tb && jj >= 0 && (p.dir > 0 ? jj * tb.step : tb.length - jj * tb.step) < FORK_TAKE) {
      b = tb;
      j = jj;
      p.branch = tb.id;
    }
  }
  let want = b ? b.line[j] : t.line[p.si];
  if (tk) {
    const gap = (tk.dist - p.dist) * p.dir;
    if (gap < -3) p.target = -1; // overshot (target was in the air): roll on
    // the target's `d` is measured on its own route: home on it only on the same one
    else if (gap < Y.lockRange && tk.branch === p.branch) want = tk.d;
  }
  const lim = (b ? b.halfW[j] : t.halfW[p.si]) - 0.6;
  p.d = clamp(p.d + clamp(want - p.d, -Y.lateral * DT, Y.lateral * DT), -lim, lim);
  routePoint(t, p.dist, p.d, p.branch, p);
  p.y = b ? p.y + LIFT : deckY(ctx, p.si, p.y) + LIFT + gapHop(ctx, p.si);
  collide(ctx, p, 'yarn');
}

/**
 * Road height under an item at main sample i (SIM_VERSION 8): over a jump gap there is no deck (the query reports the
 * canyon floor), so items carry on along the straight line from the lip to the far deck; elsewhere `y` as given.
 */
function deckY(ctx: SimContext, i: number, y: number): number {
  const t = ctx.track;
  if (t.gapMask[i] !== 1) return y;
  const pc = pieceAtSample(t, i);
  if (!pc || pc.kind !== 'jump') return y;
  const span = ((pc.i1 - pc.i0 + t.n) % t.n) || 1;
  const u = ((i - pc.i0 + t.n) % t.n) / span;
  return pc.lipY + (pc.landY - pc.lipY) * u;
}

/** A small parabolic hop (m) for a rolling yarn ball over a jump gap. */
function gapHop(ctx: SimContext, i: number): number {
  const t = ctx.track;
  if (t.gapMask[i] !== 1) return 0;
  const pc = pieceAtSample(t, i);
  if (!pc || pc.kind !== 'jump') return 0;
  const span = ((pc.i1 - pc.i0 + t.n) % t.n) || 1;
  const u = ((i - pc.i0 + t.n) % t.n) / span;
  return 4 * 1.2 * u * (1 - u);
}

/**
 * Laser Dot (B17): the target is locked at fire time; if it drops out (finished, respawning) the dot re-targets the
 * leader only when that kart is still ahead of the dot, else it fizzles. Every kart it passes chases it once
 * (`hitMask`). The warning is set before the hit check, and the dot never lands within `minArm` of firing, so the
 * target always sees "LASER DOT INCOMING" first.
 */
function stepLaser(ctx: SimContext, p: Proj): void {
  const s = itemsOf(ctx.st);
  const ks = ctx.st.karts;
  const t = ctx.track;
  p.age++;
  if (p.target < 0 || !racing(ks[p.target])) p.target = laserTarget(ctx, p.owner, p.dist);
  if (p.target < 0) {
    ctx.emit({ type: 'itemFizzle', kart: p.owner, item: 'laser' });
    kill(p);
    return;
  }
  const tk = ks[p.target];
  const v = L.speedMult * Math.max(speedOf(tk), ctx.tun.topSpeed * 0.9);
  const prev = p.dist;
  p.dist += v * DT;
  // not yet armed, or the target is on a set piece (untouchable, SIM_VERSION 8): hold just behind it
  if ((p.age < MIN_ARM || !touchable(tk)) && p.dist > tk.dist - 0.5) p.dist = Math.max(prev, tk.dist - 0.5);
  p.d += clamp(t.line[p.si] - p.d, -6 * DT, 6 * DT);
  trackPoint(t, p.dist, p.d, p);
  p.y += 0.08;
  // everyone it passes over chases the dot, once each
  for (let j = 0; j < ks.length; j++) {
    if (j === p.target || p.hitMask & (1 << j)) continue;
    const k = ks[j];
    if (touchable(k) && prev < k.dist && k.dist <= p.dist) {
      p.hitMask |= 1 << j;
      itemHit(ctx, j, 'chase', p.owner, 'laser');
    }
  }
  const eta = (tk.dist - p.dist) / v;
  if (eta < L.warn) s.laserWarn = p.target;
  if (p.age >= MIN_ARM && p.dist >= tk.dist && touchable(tk)) {
    s.laserWarn = p.target;
    p.hitMask |= 1 << p.target;
    itemHit(ctx, p.target, 'spin', p.owner, 'laser');
    kill(p);
  }
}

/** One tick of every projectile (after kart physics). Dead ones are removed in place. */
export function stepProjectiles(ctx: SimContext): void {
  const s = itemsOf(ctx.st);
  s.laserWarn = -1;
  if (s.laserCd > 0) s.laserCd--;
  for (const p of s.proj) {
    if (p.life <= 0) continue;
    p.life--;
    if (p.imm > 0) p.imm--;
    if (p.kind === ProjKind.Hairball) stepHairball(ctx, p);
    else if (p.kind === ProjKind.YarnBall) stepYarnBall(ctx, p);
    else stepLaser(ctx, p);
    if (p.life <= 0 && p.kind === ProjKind.Laser) s.laserCd = ticks(L.cooldown);
  }
  let w = 0;
  for (let r = 0; r < s.proj.length; r++) if (s.proj[r].life > 0) s.proj[w++] = s.proj[r];
  s.proj.length = w;
}
