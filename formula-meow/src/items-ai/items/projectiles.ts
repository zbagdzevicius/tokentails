/**
 * Projectiles (items-ai lane, GDD 4): the Hairball (straight shot that rolls along the road and bounces off walls up
 * to 3 times), the homing Yarn ball (runs along the road at the kart ahead) and the Laser Dot (runs ahead at 1.5×
 * leader speed, makes everyone it passes chase it, then spins the leader). Sim-safe math only.
 */
import { DT, Surface } from '../../types';
import { ITEMS, ticks } from '../../tuning';
import type { SimContext } from '../../core/sim/plugins';
import { queryTrack, wrapDs, type TrackHit } from '../../core/track/query';
import { speedOf } from '../../core/sim/kart';
import { clamp, cosL, sinL } from '../../core/sim/fixed';
import { ProjKind, itemsOf, trackPoint, type Proj } from './state';
import { itemHit, touchable, yarnShield } from './hits';

const hit: TrackHit = { i: 0, s: 0, d: 0, y: 0, surface: Surface.Road };
const H = ITEMS.hairball;
const Y = ITEMS.yarnBall;
const L = ITEMS.laser;
const LIFT = 0.55;

function newProj(ctx: SimContext, kind: Proj['kind'], owner: number): Proj {
  const s = itemsOf(ctx.st);
  return { id: s.nextId++, kind, owner, x: 0, y: 0, z: 0, vx: 0, vz: 0, si: 0, dist: 0, d: 0, life: 0, bounces: 0, target: -1, imm: 0, hitMask: 0, age: 0 };
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

/** Yarn ball: thrown forward, homes on the kart ahead along the road. */
export function fireYarnBall(ctx: SimContext, owner: number): void {
  const k = ctx.st.karts[owner];
  const p = newProj(ctx, ProjKind.YarnBall, owner);
  p.dist = k.dist + H.spawn;
  p.d = k.d;
  p.target = kartAhead(ctx, owner);
  p.life = ticks(Y.life);
  p.imm = ticks(H.ownerImmune);
  trackPoint(ctx.track, p.dist, p.d, p);
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
    if (o === owner || !touchable(k)) continue;
    return k.dist > minDist ? o : -1;
  }
  return -1;
}

/** True when the owner leads the race (the Laser Dot has nobody ahead to run to). */
export function ownerLeads(ctx: SimContext, owner: number): boolean {
  for (const o of ctx.st.order) {
    if (!touchable(ctx.st.karts[o])) continue;
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
    if (!touchable(k) || (j === p.owner && p.imm > 0)) continue;
    const dx = k.x - p.x;
    const dz = k.z - p.z;
    if (dx * dx + dz * dz > r2 || Math.abs(k.y + 0.4 - p.y) > 1.8) continue;
    if (!yarnShield(ctx, j, p.dist)) itemHit(ctx, j, 'spin', p.owner, item);
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
  const lim = (hit.d > 0 ? t.wallR[hit.i] : t.wallL[hit.i]) - 0.5;
  if (Math.abs(hit.d) > lim) {
    const side = hit.d > 0 ? 1 : -1;
    const nx = t.tz[hit.i] * side; // inward normal = -(right) × side
    const nz = -t.tx[hit.i] * side;
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
  p.y = hit.y + LIFT;
  if (p.life > 0) collide(ctx, p, 'hairball');
}

function stepYarnBall(ctx: SimContext, p: Proj): void {
  const t = ctx.track;
  const ks = ctx.st.karts;
  if (p.target >= 0 && !touchable(ks[p.target])) p.target = -1;
  p.dist += Math.max(Y.speedMin, ctx.tun.topSpeed * Y.speedTop) * DT;
  let want = t.line[p.si];
  if (p.target >= 0) {
    const tk = ks[p.target];
    const gap = tk.dist - p.dist;
    if (gap < -3) p.target = -1; // overshot (target was in the air): roll on
    else if (gap < Y.lockRange) want = tk.d;
  }
  const lim = t.halfW[p.si] - 0.6;
  p.d = clamp(p.d + clamp(want - p.d, -Y.lateral * DT, Y.lateral * DT), -lim, lim);
  trackPoint(t, p.dist, p.d, p);
  p.y += LIFT;
  collide(ctx, p, 'yarn');
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
  if (p.target < 0 || !touchable(ks[p.target])) p.target = laserTarget(ctx, p.owner, p.dist);
  if (p.target < 0) {
    ctx.emit({ type: 'itemFizzle', kart: p.owner, item: 'laser' });
    kill(p);
    return;
  }
  const tk = ks[p.target];
  const v = L.speedMult * Math.max(speedOf(tk), ctx.tun.topSpeed * 0.9);
  const prev = p.dist;
  p.dist += v * DT;
  // not yet armed: hold just behind the target
  if (p.age < MIN_ARM && p.dist > tk.dist - 0.5) p.dist = Math.max(prev, tk.dist - 0.5);
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
  if (p.age >= MIN_ARM && p.dist >= tk.dist) {
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
