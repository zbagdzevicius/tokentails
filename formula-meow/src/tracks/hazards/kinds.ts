/**
 * The six track hazards (ITERATION-2.md, lane "tracks"), registered with `registerHazard`. Each runs inside the sim
 * after the items (tick order in core/sim/world.ts), is a pure function of the tick and its plain-data state, and
 * lands its hit through `applyHit` (so the box shield, Zoomies and the respawn immunity block it like any item).
 * A per-kart cooldown in the spot's state keeps one pass to one hit. Every hit emits `hazard` (a = kind, b = id).
 *
 * Costs stay within GDD 3.6 (~1.5 s at most): roomba, laundry and steam wobble (~0.5 s), the toaster leaps
 * (~1.2 s), the drum only pushes, milk only slides.
 */
import type { HazardPlace } from '../../core/track/build';
import { applyHit, speedOf } from '../../core/sim/kart';
import { draw } from '../../core/sim/rng';
import { wrapAngle } from '../../core/sim/fixed';
import type { SimContext } from '../../core/sim/plugins';
import { DT, type HazardKind, type KartState } from '../../types';
import { DRUM, LAUNDRY, MILK, ROOMBA, STEAM, TOASTER, drumPush, local, roombaPose, sheetHalfWidth, sheetOffset, steamState, toasterState, type Pose } from './geometry';
import { registerHazard, type HazardDef } from './registry';

type State = Record<string, number>;

const pose: Pose = { x: 0, z: 0, fx: 0, fz: 1 };
const loc = { a: 0, d: 0 };

/** The placement of hazard `id` on the race's track. */
export function placeOf(ctx: SimContext, id: number): HazardPlace | null {
  const hs = ctx.track.hazards;
  if (hs[id]?.id === id) return hs[id];
  for (let i = 0; i < hs.length; i++) if (hs[i].id === id) return hs[i];
  return null;
}

/** Karts a hazard can touch this tick (not respawning, not out of a battle). */
const live = (k: KartState): boolean => k.respawnTicks === 0 && !k.out;

function cool(st: State, i: number, ticksLeft: number): void {
  st[`c${i}`] = ticksLeft;
}

/** Tick every kart's cooldown down (the hit test may skip a kart). */
function tickCooldowns(st: State, n: number): void {
  for (let i = 0; i < n; i++) {
    const key = `c${i}`;
    if ((st[key] ?? 0) > 0) st[key]--;
  }
}

function hitWith(ctx: SimContext, p: HazardPlace, i: number, kind: 'wobble' | 'leap' | 'spin'): void {
  ctx.emit({ type: 'hazard', kart: i, a: p.k, b: p.id });
  applyHit(ctx, i, kind, -1);
}

const roomba: HazardDef = {
  kind: 'roomba',
  step(ctx, _spot, id, st) {
    const p = placeOf(ctx, id);
    if (!p) return;
    roombaPose(p, ctx.st.tick, pose);
    const ks = ctx.st.karts;
    tickCooldowns(st, ks.length);
    const reach = ROOMBA.radius + 0.95;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      if (!live(k) || k.air) continue;
      const dx = k.x - pose.x;
      const dz = k.z - pose.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= reach * reach || Math.abs(k.y - p.y) > 1.2) continue;
      // push out of the roomba's disc and shove the kart away at the roomba's speed
      const d = Math.sqrt(d2) || 0.001;
      const nx = dx / d;
      const nz = dz / d;
      k.x += nx * (reach - d);
      k.z += nz * (reach - d);
      const vn = k.vx * nx + k.vz * nz;
      if (vn < ROOMBA.push) {
        k.vx += nx * (ROOMBA.push - vn);
        k.vz += nz * (ROOMBA.push - vn);
      }
      if ((st[`c${i}`] ?? 0) === 0) {
        cool(st, i, ROOMBA.hitCooldown);
        hitWith(ctx, p, i, 'wobble');
      }
    }
  },
};

const laundry: HazardDef = {
  kind: 'laundry',
  step(ctx, _spot, id, st) {
    const p = placeOf(ctx, id);
    if (!p) return;
    const ds = sheetOffset(p, ctx.st.tick);
    const hw = sheetHalfWidth(p) + 0.6;
    const ks = ctx.st.karts;
    tickCooldowns(st, ks.length);
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      if (!live(k)) continue;
      local(p, k.x, k.z, loc);
      if (Math.abs(loc.a) > LAUNDRY.depth || Math.abs(loc.d - ds) > hw) continue;
      const dy = k.y - p.y;
      if (dy < LAUNDRY.low || dy > LAUNDRY.high) continue;
      if ((st[`c${i}`] ?? 0) > 0) continue;
      cool(st, i, LAUNDRY.hitCooldown);
      hitWith(ctx, p, i, 'wobble');
    }
  },
};

const milk: HazardDef = {
  kind: 'milk',
  step(ctx, _spot, id, st) {
    const p = placeOf(ctx, id);
    if (!p) return;
    const ks = ctx.st.karts;
    const r = ctx.track.puddles.find((q) => q.id === id)?.r ?? 3;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      const key = `in${i}`;
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      const inside = live(k) && !k.air && dx * dx + dz * dz <= r * r && Math.abs(k.y - p.y) < 1.2;
      if (inside && !st[key]) {
        // entering at speed without a boost: the back steps out (the low grip of the puddle does the rest)
        if (k.boostTicks === 0 && speedOf(k) > MILK.minSpeed && k.spinTicks === 0) {
          const dir = draw(ctx.st as unknown as Record<'rngHazards', number>, 'rngHazards') < 0.5 ? -1 : 1;
          k.heading = wrapAngle(k.heading + dir * MILK.kick);
          ctx.emit({ type: 'hazard', kart: i, a: p.k, b: p.id });
        }
      }
      st[key] = inside ? 1 : 0;
    }
  },
};

const toaster: HazardDef = {
  kind: 'toaster',
  step(ctx, _spot, id, st) {
    const p = placeOf(ctx, id);
    if (!p) return;
    const ks = ctx.st.karts;
    tickCooldowns(st, ks.length);
    if (toasterState(p, ctx.st.tick) !== 2) return;
    const r2 = (TOASTER.radius + 0.6) ** 2;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      if (!live(k) || k.air) continue;
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      if (dx * dx + dz * dz > r2 || Math.abs(k.y - p.y) > 1.2) continue;
      if ((st[`c${i}`] ?? 0) > 0) continue;
      cool(st, i, TOASTER.hitCooldown);
      hitWith(ctx, p, i, 'leap');
    }
  },
};

const steam: HazardDef = {
  kind: 'steam',
  step(ctx, _spot, id, st) {
    const p = placeOf(ctx, id);
    if (!p) return;
    const ks = ctx.st.karts;
    tickCooldowns(st, ks.length);
    if (steamState(p, ctx.st.tick) !== 2) return;
    const r2 = STEAM.radius * STEAM.radius;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      if (!live(k)) continue;
      const dx = k.x - p.x;
      const dz = k.z - p.z;
      if (dx * dx + dz * dz > r2 || k.y - p.y > STEAM.height) continue;
      if ((st[`c${i}`] ?? 0) > 0) continue;
      cool(st, i, STEAM.hitCooldown);
      hitWith(ctx, p, i, 'wobble');
    }
  },
};

const drum: HazardDef = {
  kind: 'drum',
  step(ctx, _spot, id, st) {
    const p = placeOf(ctx, id);
    if (!p) return;
    const ks = ctx.st.karts;
    const a = drumPush(p, ctx.st.tick);
    const rx = -p.tz;
    const rz = p.tx;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      const key = `in${i}`;
      local(p, k.x, k.z, loc);
      const inside = live(k) && Math.abs(loc.a) <= DRUM.halfLen && Math.abs(loc.d) <= p.halfW + 1 && Math.abs(k.y - p.y) < 2;
      if (inside) {
        k.vx += rx * a * DT;
        k.vz += rz * a * DT;
        if (!st[key] && Math.abs(a) >= 3) ctx.emit({ type: 'hazard', kart: i, a: p.k, b: p.id });
      }
      st[key] = inside ? 1 : 0;
    }
  },
};

const ALL: Record<HazardKind, HazardDef> = { roomba, laundry, milk, toaster, steam, drum };

let registered = false;

/** Register the six hazards (idempotent; called from the tracks install and from createHazardSystem). */
export function registerDefaultHazards(): void {
  if (registered) return;
  registered = true;
  for (const k of Object.keys(ALL) as HazardKind[]) registerHazard(k, ALL[k]);
}

