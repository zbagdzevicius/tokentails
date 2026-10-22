/**
 * Clem's skill effects (ANIM-SPEC §14 "Clem"). Every gameplay shape uses the sim's numbers through `fx.abil` (talent-
 * and branch-resolved) and the sim event's tick: the Paw Combo crescents sweep exactly the cone (range, arc), The
 * Stand's wall covers exactly the blocked front half for exactly the block, the Golden Hour wave runs the real 5 m ×
 * 1.2 m line at its 25 m/s, Tumble's trail follows the hero's real path. Spectacle stays cosmetic: lingering glyphs are
 * never red or ring-shaped, enemy effects take the danger rim (fx.rim), the shader dims anything over an enemy
 * windup. Golden Hour's cast does no damage, so its slam stays body-centric (no ring or shockwave sized like an area
 * hit). Extras scale with the quality tier (`by`) and reduce motion. All state is preallocated per entity id; nothing
 * allocates per frame.
 */
import * as THREE from 'three';
import { PROJECTILE_KIND } from '../../data/towers';
import { stubFx } from '../anim/common';
import { DASH_SPEED, TICK_S, travelTicks } from '../anim/timing';
import type { SimEvent } from '../../sim/api';
import type { CombatVfxLike, FxCtx, MoveCtx, SkillFxSet, V3Out } from '../anim/types';
import { CLEM_LIVE, noteValor } from '../moves/clem';

const GOLD = 0xffd34d;
const SUN = 0xffe9a8;
const WHITE_GOLD = 0xfff6d8;
const VALOR = 0xff9cc8;
const PETAL = 0xffc8de;
const MEND = 0x9cf0a8;

/** Tier pick (Low / Med / High). */
const by = (fx: FxCtx, low: number, med: number, high: number): number => (fx.tier === 'low' ? low : fx.tier === 'med' ? med : high);

/** The runtime's hero lookup (FxRuntime.lookup), which the FxCtx type does not list: bones as scene objects. */
type WithLookup = { lookup?: { bone(id: number, bone: 'body'): THREE.Object3D | null } };

/** CombatVfx extras the FxCtx type does not list yet (the runtime passes the real CombatVfx). */
type Vfx = CombatVfxLike & {
  pillar?(x: number, z: number, color: number, k?: number): void;
  bigHit?(pos: THREE.Vector3, color: number): void;
};

const N = 16;
const wUntil = new Float64Array(N).fill(-1);
const wNext = new Float64Array(N);
const eUntil = new Float64Array(N).fill(-1);
const eRib = new Int16Array(N).fill(-1);
const rFx = new Uint8Array(N);
const rNext = new Float64Array(N);
const rRib = new Int16Array(N).fill(-1);
const vRib = new Int16Array(N).fill(-1);
const waveAt = new Float64Array(N).fill(-9);
/** The last basic hit (time, yaw, hero position): the wave bolt may be seen before or after its hit event. */
const hitAt = new Float64Array(N).fill(-9);
const hitYaw = new Float64Array(N);
const hitX = new Float64Array(N);
const hitZ = new Float64Array(N);
const lastSlot = new Int8Array(N).fill(-1);
const bigDone = new Uint8Array(N);
const mend = new Uint8Array(N);

const P: V3Out = { x: 0, y: 0, z: 0 };
const Q: V3Out = { x: 0, y: 0, z: 0 };
const T: V3Out = { x: 0, y: 0, z: 0 };
const V = new THREE.Vector3();
const spawn = { x: 0, y: 0.06, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1, life: 0.3, color: GOLD, rim: GOLD, p0: 0, p1: 0, p2: 0, p3: 1, rel: 'own' as 'own' | 'ally' | 'enemy', delay: 0 };

type Kind = Parameters<FxCtx['mesh']['spawn']>[0];
type CastEv = Extract<SimEvent, { type: 'cast' }>;
type HitEv = Extract<SimEvent, { type: 'hit' }>;
/** Spawn from the shared option object (reset to defaults first). */
function mesh(fx: FxCtx, kind: Kind, id: number, x: number, z: number, yaw: number, sx: number, life: number, color: number, o?: { y?: number; sy?: number; sz?: number; p0?: number; p1?: number; p2?: number; p3?: number; delay?: number }): void {
  const s = spawn;
  s.x = x;
  s.z = z;
  s.yaw = yaw;
  s.sx = sx;
  s.life = life;
  s.color = color;
  s.rim = fx.rim(id);
  s.rel = fx.relation(id);
  s.y = o?.y ?? 0.06;
  s.sy = o?.sy ?? 1;
  s.sz = o?.sz ?? sx;
  s.p0 = o?.p0 ?? 0;
  s.p1 = o?.p1 ?? 0;
  s.p2 = o?.p2 ?? 0;
  s.p3 = o?.p3 ?? 1;
  s.delay = o?.delay ?? 0;
  fx.mesh.spawn(kind, s);
}

/** Reused option bags (one per call site shape): never a literal per frame. */
const O = {
  crescent: { p0: 0, p1: 0.35, p2: 1, p3: 1, delay: 0 },
  wall: { y: 0, sy: 1.25, p0: Math.PI, p3: 1 },
  arc: { p0: Math.PI, p1: 0.8, p2: 1, p3: 0.7 },
  ring: { p1: 0.2, p3: 1 },
  pillar: { y: 0, sy: 6, p3: 1.2, delay: 0 },
  beam: { y: 0.4, sz: 1.2, p3: 1.2, delay: 0 },
  glow: { y: 0.08, p3: 0.8, delay: 0 },
};

/**
 * The hero's facing (rad, 0 = +x, counter-clockwise from above), or NaN: the view object's yaw (the interpolated sim
 * facing, which The Stand's block arc uses), found above the body bone (object → mover → inner → rig). Clip yaw (a
 * chest twist, a spin) lives below it and never turns the result. Without the runtime lookup (tests): head → muzzle.
 */
function facing(fx: FxCtx, id: number): number {
  if (fx.facing?.(id, Q)) return Math.atan2(-Q.z, Q.x);
  const body = (fx as FxCtx & WithLookup).lookup?.bone(id, 'body');
  let o: THREE.Object3D | null = body ?? null;
  while (o && o.name !== 'mover') o = o.parent;
  if (o && o.parent) return o.parent.rotation.y;
  if (!fx.bonePos(id, 'head', Q) || !fx.bonePos(id, 'mouth', T)) return NaN;
  const dx = T.x - Q.x;
  const dz = T.z - Q.z;
  return Math.abs(dx) + Math.abs(dz) < 1e-4 ? NaN : Math.atan2(-dz, dx);
}

/** Yaw (rad) from the hero at P toward the sim aim point (mm). */
const aimYaw = (x: number, y: number): number => Math.atan2(y / 1000 + P.z, x / 1000 - P.x);

const now = (): number => CLEM_LIVE.now;

// ------------------------------------------------------------------------------------------------ casts

function castQ(e: CastEv, fx: FxCtx, ctx: MoveCtx, id: number): void {
  const a = fx.abil(e.src, 'q');
  const range = (a.range ?? 2400) / 1000;
  const arc = ((a.arc ?? 1024) / 4096) * Math.PI * 2;
  let yaw = aimYaw(e.x, e.y);
  if (!Number.isFinite(yaw)) yaw = facing(fx, e.src);
  if (!Number.isFinite(yaw)) return;
  const stage = ctx.recastIndex;
  const emp = CLEM_LIVE.empowered[id] === 1;
  const c = O.crescent;
  c.p0 = arc;
  c.p1 = stage === 2 ? 0.2 : 0.35;
  c.p2 = stage === 1 ? -1 : 1;
  c.p3 = stage === 2 ? 1.4 : 1.1;
  c.delay = 0;
  // the slash sweeps exactly the cone the sim tested
  mesh(fx, 'crescent', e.src, P.x, P.z, yaw, range, stage === 2 ? 0.42 : 0.3, stage === 2 ? WHITE_GOLD : SUN, c);
  if (stage === 1) {
    // the spin's second, inner pass
    c.p1 = 0.15;
    c.p2 = 1;
    c.p3 = 0.8;
    c.delay = 0.06;
    mesh(fx, 'crescent', e.src, P.x, P.z, yaw + Math.PI, range * 0.62, 0.24, GOLD, c);
    if (fx.tier !== 'low') {
      c.p0 = Math.PI * 2;
      mesh(fx, 'crescent', e.src, P.x, P.z, yaw, range * 0.62, 0.3, GOLD, c);
    }
  }
  if (stage === 2) {
    // launcher: a glow and petals thrown up in the cone; the knock crack (or the stun mark with Pounce Finish) is
    // drawn per target in onHit, where the sim's knock or stun actually lands
    const cx = P.x + Math.cos(yaw) * range * 0.55;
    const cz = P.z - Math.sin(yaw) * range * 0.55;
    O.glow.p3 = 1;
    mesh(fx, 'glow', e.src, cx, cz, 0, 1.6, 0.35, GOLD, O.glow);
    if (fx.tier !== 'low') {
      fx.linger.add('petals', cx, cz, 1.1, yaw, PETAL);
      (fx.particles as Vfx).debris(cx, cz, 0.9);
    }
  }
  if (emp) {
    // Valor 100: a white-gold second crescent sweeping back over the same cone (never past the sim's cone), the burst
    c.p0 = arc;
    c.p1 = 0.55;
    c.p2 = -c.p2;
    c.p3 = 1.6;
    c.delay = 0.04;
    mesh(fx, 'crescent', e.src, P.x, P.z, yaw, range, 0.34, WHITE_GOLD, c);
    valorBurst(fx, e.src);
  }
}

function valorBurst(fx: FxCtx, id: number): void {
  if (fx.tier !== 'low') {
    O.ring.p1 = 0.1;
    mesh(fx, 'ring', id, P.x, P.z, 0, 1.4, 0.4, VALOR, O.ring);
  }
  O.glow.p3 = 1.2;
  mesh(fx, 'glow', id, P.x, P.z, 0, 1.2, 0.3, VALOR, O.glow);
}

function castW(fx: FxCtx, id: number, src: number): void {
  const a = fx.abil(src, 'w');
  const dur = (a.duration ?? 23) * TICK_S;
  const parry = (a.parryWindow ?? 9) * TICK_S;
  wUntil[id] = now() + dur;
  wNext[id] = now() + 0.06;
  const yaw = facing(fx, src);
  if (!Number.isFinite(yaw)) return;
  // the parry window: the bright first 9 t
  const w = O.wall;
  w.p0 = ((a.arc ?? 2048) / 4096) * Math.PI * 2;
  w.p3 = 1.8;
  w.sy = 1.4;
  mesh(fx, 'wall', src, P.x, P.z, yaw, 1.4, parry, WHITE_GOLD, w);
  w.sy = 1.25;
  O.glow.p3 = 1;
  mesh(fx, 'glow', src, P.x + Math.cos(yaw) * 0.6, P.z - Math.sin(yaw) * 0.6, 0, 1.1, parry, SUN, O.glow);
}

function castE(e: CastEv, fx: FxCtx, id: number): void {
  const a = fx.abil(e.src, 'e');
  // the sim's dash() takes only the angle: Tumble always runs the full a.e.dash, whatever the aim distance
  const ticks = travelTicks(a.dash ?? 4000, DASH_SPEED);
  eUntil[id] = now() + ticks * TICK_S + 0.05;
  const yaw = aimYaw(e.x, e.y);
  fx.linger.add('petals', P.x, P.z, 0.8, Number.isFinite(yaw) ? yaw : 0, PETAL);
  O.glow.p3 = 0.8;
  mesh(fx, 'glow', e.src, P.x, P.z, 0, 0.9, 0.25, SUN, O.glow);
  if (eRib[id] >= 0) fx.ribbons.end(eRib[id]);
  P.y = 0.7;
  eRib[id] = fx.ribbons.point(P, SUN, 0.7, 0.35);
}

function castR(fx: FxCtx, id: number, src: number): void {
  const a = fx.abil(src, 'r');
  CLEM_LIVE.rUntil[id] = now() + (a.duration ?? 180) * TICK_S;
  mend[id] = (a.lifestealBp ?? 0) > 0 ? 1 : 0;
  rFx[id] = 1;
  rNext[id] = now() + 0.45;
  // the sun column (6 m, 400 ms), a white core (Med / High), a body-sized ground glow and a petal spiral
  O.pillar.sy = 6;
  O.pillar.p3 = 1.3;
  O.pillar.delay = 0;
  mesh(fx, 'pillar', src, P.x, P.z, 0, 0.95, 0.42, GOLD, O.pillar);
  if (fx.tier !== 'low') {
    O.pillar.sy = 7;
    O.pillar.delay = 0.05;
    mesh(fx, 'pillar', src, P.x, P.z, 0, 0.42, 0.36, WHITE_GOLD, O.pillar);
  }
  O.glow.p3 = 1.2;
  // sx is the radius: a 1.5 m wide body flare, never an area-sized disc
  mesh(fx, 'glow', src, P.x, P.z, 0, 0.75, 0.6, GOLD, O.glow);
  const petals = fx.reduced ? Math.min(2, by(fx, 1, 3, 5)) : by(fx, 1, 3, 5);
  for (let i = 0; i < petals; i++) {
    const t = (i / petals) * Math.PI * 2;
    const r = 0.8 + i * 0.28;
    fx.linger.add('petals', P.x + Math.cos(t) * r, P.z - Math.sin(t) * r, 0.55, t, PETAL);
  }
  if (CLEM_LIVE.empowered[id] === 1) valorBurst(fx, src);
}

// ------------------------------------------------------------------------------------------------ hits

/** Golden Hour's wave: crescents running the real line at the wave's speed, then sun scratches along it. */
function wave(fx: FxCtx, src: number, yaw: number): void {
  const a = fx.abil(src, 'r');
  const len = (a.waveRange ?? 5000) / 1000;
  const wide = (a.waveWidth ?? 1200) / 1000;
  const speed = (a.waveSpeed ?? 25000) / 1000;
  const n = by(fx, 2, 3, 5);
  const c = O.crescent;
  c.p0 = 2.2;
  c.p1 = 0.55;
  c.p2 = 1;
  c.p3 = 1.3;
  for (let i = 0; i < n; i++) {
    const d = ((i + 0.5) / n) * len;
    c.delay = d / speed;
    mesh(fx, 'crescent', src, P.x + Math.cos(yaw) * (d - wide * 0.5), P.z - Math.sin(yaw) * (d - wide * 0.5), yaw, wide * 0.75, 0.16, i === n - 1 ? WHITE_GOLD : GOLD, c);
  }
  O.beam.sz = wide;
  O.beam.delay = 0;
  O.beam.p3 = 0.9;
  mesh(fx, 'beam', src, P.x, P.z, yaw, len, len / speed + 0.1, SUN, O.beam);
  if (fx.tier !== 'low') fx.linger.add('scratches', P.x + Math.cos(yaw) * len * 0.5, P.z - Math.sin(yaw) * len * 0.5, len * 0.45, yaw + Math.PI / 2, 0xffe2a0);
}

/** The sun-cleave's full-circle slash and the wave, from the hero at P. */
function sunCleave(fx: FxCtx, src: number, yaw: number): void {
  const c = O.crescent;
  c.p0 = Math.PI * 2;
  c.p1 = 0.6;
  c.p2 = 1;
  c.p3 = 1.2;
  c.delay = 0;
  mesh(fx, 'crescent', src, P.x, P.z, yaw, 1.8, 0.3, GOLD, c);
  wave(fx, src, yaw);
}

function hitBasic(e: HitEv, fx: FxCtx, ctx: MoveCtx, id: number): void {
  if (!fx.heroPos(e.src, P) || !fx.heroPos(e.dst, T)) return;
  let yaw = Math.atan2(-(T.z - P.z), T.x - P.x);
  if (Math.abs(T.x - P.x) + Math.abs(T.z - P.z) < 1e-3) yaw = facing(fx, e.src);
  if (!Number.isFinite(yaw)) return;
  const k = (((ctx.basicCount - 1) % 3) + 3) % 3;
  const c = O.crescent;
  hitAt[id] = now();
  hitYaw[id] = yaw;
  hitX[id] = P.x;
  hitZ[id] = P.z;
  if (now() - waveAt[id] < 0.3) {
    waveAt[id] = -9;
    hitAt[id] = -9;
    sunCleave(fx, e.src, yaw);
    return;
  }
  const d = Math.min(1.9, Math.hypot(T.x - P.x, T.z - P.z) + 0.3);
  c.p0 = k === 2 ? 0.9 : 2.0;
  c.p1 = 0.5;
  c.p2 = k === 1 ? -1 : 1;
  c.p3 = k === 2 ? 1.2 : 0.9;
  c.delay = 0;
  mesh(fx, 'crescent', e.src, P.x, P.z, yaw, d, 0.22, SUN, c);
  if (k === 2 && fx.tier !== 'low') fx.linger.add('crackStar', T.x, T.z, 0.7, yaw, 0xfff1c4);
  if (mend[id] && now() < CLEM_LIVE.rUntil[id]) {
    O.glow.p3 = 0.7;
    mesh(fx, 'glow', e.src, P.x, P.z, 0, 0.8, 0.3, MEND, O.glow);
  }
}

/**
 * One Paw Combo launcher target at T (hero at P): without a stun, the crack runs from the target along the sim's
 * knock direction (away from Clem) for the knock distance; with Pounce Finish the sim stuns instead of knocking, so
 * a gold stun ring sits on the target for the stun and no crack is drawn.
 */
function q3Hit(e: HitEv, fx: FxCtx): void {
  const a = fx.abil(e.src, 'q');
  const stun = a.stun ?? 0;
  if (stun > 0) {
    O.ring.p1 = 0.35;
    mesh(fx, 'ring', e.src, T.x, T.z, 0, 0.75, stun * TICK_S, WHITE_GOLD, O.ring);
    return;
  }
  if (!fx.heroPos(e.src, P)) return;
  const k = (a.knockback ?? 1500) / 1000;
  let dx = T.x - P.x;
  let dz = T.z - P.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-3) {
    const f = facing(fx, e.src);
    if (!Number.isFinite(f)) return;
    dx = Math.cos(f);
    dz = -Math.sin(f);
  } else {
    dx /= l;
    dz /= l;
  }
  const yaw = Math.atan2(-dz, dx);
  // the glyph's size is its half extent: the line spans T → T + k along the knock
  fx.linger.add('crackLine', T.x + dx * k * 0.5, T.z + dz * k * 0.5, k * 0.5, yaw, 0xfff1c4);
}

// ------------------------------------------------------------------------------------------------ the set

/** Clear every per-entity FX state (tests, a new match). */
export function resetClemFx(): void {
  wUntil.fill(-1);
  eUntil.fill(-1);
  eRib.fill(-1);
  rFx.fill(0);
  rRib.fill(-1);
  vRib.fill(-1);
  waveAt.fill(-9);
  hitAt.fill(-9);
  lastSlot.fill(-1);
  bigDone.fill(0);
  mend.fill(0);
  const L = CLEM_LIVE;
  L.now = 0;
  L.rUntil.fill(-1);
  L.rCount.fill(0);
  L.valorFull.fill(0);
  L.valorBlock.fill(-1);
  L.empowered.fill(0);
}

export const SKILL_FX: SkillFxSet = {
  ...stubFx('clem'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },

  onCast(e, fx, ctx) {
    if (e.slot > 3) return;
    const id = e.src & 15;
    lastSlot[id] = e.slot;
    bigDone[id] = 0;
    if (!fx.heroPos(e.src, P)) return;
    if (e.slot === 0) castQ(e, fx, ctx, id);
    else if (e.slot === 1) castW(fx, id, e.src);
    else if (e.slot === 2) castE(e, fx, id);
    else castR(fx, id, e.src);
  },

  onHit(e, fx, ctx) {
    const id = e.src & 15;
    // Valor: this reading is the snapshot after the hit (the bar only fills on hits)
    noteValor(id, ctx.resource);
    if (e.kind === 'basic') return hitBasic(e, fx, ctx, id);
    if (e.kind !== 'ability' || lastSlot[id] !== 0 || !fx.heroPos(e.dst, T)) return;
    if (ctx.recastIndex >= 2) q3Hit(e, fx);
    // Paw Combo hits: a flash on each target; the launcher's first target gets the big pop and petals (Med / High)
    if (ctx.recastIndex >= 2 && !bigDone[id] && fx.tier !== 'low') {
      bigDone[id] = 1;
      V.set(T.x, 1.1, T.z);
      (fx.particles as Vfx).bigHit?.(V, GOLD);
      fx.linger.add('petals', T.x, T.z, 0.9, 0, PETAL);
    } else {
      O.glow.p3 = 0.8;
      mesh(fx, 'glow', e.src, T.x, T.z, 0, 0.7, 0.2, WHITE_GOLD, O.glow);
    }
  },

  onProjectile(owner, kind, _slot, fx) {
    const id = owner & 15;
    if (kind === PROJECTILE_KIND.wave) {
      if (now() - hitAt[id] < 0.3) {
        // its basic hit came first: draw from where she stood
        P.x = hitX[id];
        P.z = hitZ[id];
        hitAt[id] = -9;
        sunCleave(fx, owner, hitYaw[id]);
      } else waveAt[id] = now();
      return;
    }
    // any other bolt that turns Clem's is one The Stand reflected: a gold "ting"
    if (!fx.heroPos(owner, P)) return;
    const yaw = facing(fx, owner);
    O.glow.p3 = 1.4;
    mesh(fx, 'glow', owner, P.x + (Number.isFinite(yaw) ? Math.cos(yaw) * 0.8 : 0), P.z - (Number.isFinite(yaw) ? Math.sin(yaw) * 0.8 : 0), 0, 0.9, 0.22, WHITE_GOLD, O.glow);
    if (Number.isFinite(yaw)) {
      const c = O.crescent;
      c.p0 = Math.PI;
      c.p1 = 0.7;
      c.p2 = 1;
      c.p3 = 1.6;
      c.delay = 0;
      mesh(fx, 'crescent', owner, P.x, P.z, yaw, 1.5, 0.2, WHITE_GOLD, c);
    }
    fx.sfx.cue('tingParry', P);
  },

  onMarker(id, _clip, marker, fx) {
    if (marker.charCodeAt(0) !== 102 /* f */ || marker.charCodeAt(1) !== 120 /* x */) return;
    if (!fx.heroPos(id, P)) return;
    switch (marker) {
      case 'fxRApex':
        if (fx.tier !== 'low') (fx.particles as Vfx).pillar?.(P.x, P.z, GOLD, 1.2);
        return;
      case 'fxRSlam':
        // the cast deals no damage: a body-sized flare, a small crack under her knee and debris, never an area ring
        O.glow.p3 = 1.3;
        mesh(fx, 'glow', id, P.x, P.z, 0, 0.75, 0.4, SUN, O.glow);
        fx.linger.add('crackStar', P.x, P.z, 0.8, 0, 0xfff1c4);
        if (fx.tier !== 'low') (fx.particles as Vfx).debris(P.x, P.z, 0.8);
        return;
      case 'fxE1':
        fx.linger.add('petals', P.x, P.z, 0.9, 0, PETAL);
        O.ring.p1 = 0.3;
        mesh(fx, 'ring', id, P.x, P.z, 0, 1.2, 0.3, SUN, O.ring);
        return;
      case 'fxRespawn':
        O.ring.p1 = 0.15;
        mesh(fx, 'ring', id, P.x, P.z, 0, 2.2, 0.45, GOLD, O.ring);
        fx.linger.add('petals', P.x, P.z, 1.1, 0, PETAL);
        return;
      default:
    }
  },

  update(dt, fx) {
    const L = CLEM_LIVE;
    L.now += dt;
    const t = L.now;
    for (let id = 0; id < N; id++) {
      // The Stand: the wall follows her and her facing for exactly the block
      if (wUntil[id] > 0) {
        if (t >= wUntil[id] || !fx.heroPos(id, P)) wUntil[id] = -1;
        else if (t >= wNext[id]) {
          wNext[id] = t + 0.09;
          const yaw = facing(fx, id);
          if (Number.isFinite(yaw)) {
            const left = Math.min(0.2, wUntil[id] - t + 0.02);
            O.wall.p3 = 1;
            mesh(fx, 'wall', id, P.x, P.z, yaw, 1.4, left, SUN, O.wall);
            mesh(fx, 'arc', id, P.x, P.z, yaw, 1.4, left, GOLD, O.arc);
          }
        }
      }
      // Tumble: the trail follows the real dash path (the snapshot position), never the aim
      if (eRib[id] >= 0) {
        if (t >= eUntil[id] || !fx.heroPos(id, P)) {
          fx.ribbons.end(eRib[id]);
          eRib[id] = -1;
        } else fx.ribbons.feed(eRib[id], P.x, 0.7, P.z);
      }
      // Golden Hour: a sun halo under her for the duration and a glowing blade ribbon
      const golden = rFx[id] === 1 && t < L.rUntil[id];
      if (rFx[id] === 1 && !golden) rFx[id] = 0;
      if (golden && fx.heroPos(id, P)) {
        if (t >= rNext[id]) {
          rNext[id] = t + 0.32;
          O.glow.p3 = 0.55;
          mesh(fx, 'glow', id, P.x, P.z, 0, 0.8, 0.5, GOLD, O.glow);
        }
        if (rRib[id] < 0 && fx.bonePos(id, 'weaponTip', Q)) rRib[id] = fx.ribbons.point(Q, GOLD, 0.22, 0.18);
        else if (rRib[id] >= 0 && fx.bonePos(id, 'weaponTip', Q)) fx.ribbons.feed(rRib[id], Q.x, Q.y, Q.z);
      } else if (rRib[id] >= 0) {
        fx.ribbons.end(rRib[id]);
        rRib[id] = -1;
      }
      // Valor at 100 (own team: the only viewers who know the bar): a pink-gold flame on the blade
      const full = L.valorFull[id] === 1 && !golden;
      if (full && fx.bonePos(id, 'weaponTip', Q)) {
        if (vRib[id] < 0) vRib[id] = fx.ribbons.point(Q, VALOR, 0.2, 0.22);
        else fx.ribbons.feed(vRib[id], Q.x, Q.y, Q.z);
      } else if (vRib[id] >= 0) {
        fx.ribbons.end(vRib[id]);
        vRib[id] = -1;
      }
    }
  },
};
