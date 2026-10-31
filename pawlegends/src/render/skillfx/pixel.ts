/**
 * Pixel skill FX (sim v11; build spec docs/plans/moba/CATS-V11.md §2.2 "Moves and VFX"): ice-cyan gadget light,
 * bottle caps and cardboard.
 *
 * - Basic: a small cap pop on the target; under BOXBOT (MoveCtx.form) a cardboard-confetti ring at exactly the sim
 *   splash radius around it (Big Boom's 2.2 m included).
 * - Q Cap Cannon: a muzzle flash, an ice ribbon riding the cap bolt (projectileView draws the cap itself, from
 *   HERO_SHOTS), a burst and ring on the hero it stops on.
 * - W Laser Pointer: the beam drawn every frame from her along her drawn facing (the sim turns the beam toward her
 *   facing, so walking steers both), exactly the sim length and width, ice cyan with a red dot glow at the far end;
 *   a frost spark on every pulse hit. It ends at the sim duration (Overclock's 2 s included), on another cast of hers,
 *   or when the snapshot shows her stunned (the sim breaks the beam on hard CC).
 * - E Duck and Cover: the flaps clap shut: a frost-rim dome over the box for exactly the sim duration and a ring
 *   at the melee reach that slows attackers.
 * - R BOXBOT MK II: a cardboard-confetti burst and a shield ring on the transformation (the clip grows the box).
 *
 * Shapes use the talent-resolved numbers (fx.abil). Everything is pooled: no allocation per event or per frame.
 * Render only.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { TICK_S } from '../anim/timing';
import type { FxCtx, HeroStatus, MeshFxKind, MeshFxSpawn, Relation3, SkillFxSet } from '../anim/types';

/** Ice cyan (her element), the laser dot red, the kraft confetti and a frost white. */
const ICE = 0x3fa8d8;
const DOT = 0xd8282a;
const KRAFT = 0x8a5a2c;
const FROST = 0xbfe8ff;
/** BuffFlag.Stunned (sim/api), kept local so this chunk carries no sim import. */
const STUNNED = 1 << 3;
/** Beam segments are re-drawn this often (s) with a slightly longer life, so at most two are alive (Low caps beams at 2). */
const BEAM_EVERY = 0.05;
const BEAM_LIFE = 0.08;
/** Beam height above the ground (m): her pointer paw. */
const BEAM_Y = 0.75;

// ------------------------------------------------------------------------------------------------ pooled scratch

const P = { x: 0, y: 0, z: 0 };
const F = { x: 0, y: 0, z: 0 };
const ST: HeroStatus = { buffs: 0, shield: 0 };
const S: MeshFxSpawn = { x: 0, y: 0.06, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1, life: 1, color: 0, rim: 0, p0: 0, p1: 0, p2: 0, p3: 1, rel: 'own', delay: 0 };

function mesh(fx: FxCtx, kind: MeshFxKind, x: number, z: number, sx: number, life: number, color: number, rim: number, rel: Relation3, yaw = 0, y = 0.06, sz = sx, p1 = 0): number {
  S.x = x;
  S.z = z;
  S.y = y;
  S.yaw = yaw;
  S.sx = sx;
  S.sy = 1;
  S.sz = sz;
  S.life = life;
  S.color = color;
  S.rim = rim;
  S.rel = rel;
  S.p0 = kind === 'crescent' ? Math.PI * 2 : 0;
  S.p1 = p1;
  S.p2 = 0;
  S.p3 = 1;
  S.delay = 0;
  return fx.mesh.spawn(kind, S);
}

// ------------------------------------------------------------------------------------------------ per-caster state

/** One Pixel's live effects (a match has at most 6 heroes, so 6 slots). */
class Caster {
  id = -1;
  /** Laser Pointer: seconds left (0 = off), the redraw clock, length and width (m). */
  beam = 0;
  beamNext = 0;
  len = 9;
  width = 0.6;
  /** Cap Cannon: the ribbon slot and the projectile pool index it follows (−1 = none). */
  trail = -1;
  proj = -1;
  /** Render time of the last cap fired (a Q hit within 1 s is the cap's). */
  capAt = -99;
  rel: Relation3 = 'own';
  rim = 0;
}
const CASTERS: Caster[] = [new Caster(), new Caster(), new Caster(), new Caster(), new Caster(), new Caster()];
let now = 0;

function casterOf(id: number, make: boolean): Caster | null {
  let free: Caster | null = null;
  for (const c of CASTERS) {
    if (c.id === id) return c;
    if (!free && c.id < 0) free = c;
  }
  if (!make || !free) return null;
  free.id = id;
  return free;
}

function endBeam(c: Caster): void {
  c.beam = 0;
}

function endTrail(fx: FxCtx, c: Caster): void {
  if (c.trail >= 0) fx.ribbons.end(c.trail);
  c.trail = -1;
  c.proj = -1;
}

/** Test hook: drop every live effect. */
export function resetPixelFx(): void {
  now = 0;
  for (const c of CASTERS) {
    c.id = -1;
    c.beam = 0;
    c.trail = -1;
    c.proj = -1;
    c.capAt = -99;
  }
}

/** Is a Laser Pointer of hero `id` drawn now? (tests) */
export const beamOn = (id: number): boolean => (casterOf(id, false)?.beam ?? 0) > 0;

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  hero: 'pixel',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: false },

  onCast(e, fx) {
    if (e.slot > 3) return;
    const c = casterOf(e.src, true);
    if (!c) return;
    c.rel = fx.relation(e.src);
    c.rim = fx.rim(e.src);
    // any other cast of hers drops the beam (the sim sets its ticks to 0)
    endBeam(c);
    if (!fx.heroPos(e.src, P)) return;
    switch (e.slot) {
      case 0: {
        c.capAt = now;
        if (fx.bonePos(e.src, 'weaponTip', F)) mesh(fx, 'glow', F.x, F.z, 0.7, 0.16, FROST, c.rim, c.rel, 0, F.y);
        fx.sfx.cue('pop', P);
        return;
      }
      case 1: {
        const a = fx.abil(e.src, 'w');
        c.beam = (a.duration ?? 45) * TICK_S;
        c.beamNext = 0;
        c.len = (a.range ?? 9000) / 1000;
        c.width = (a.width ?? 600) / 1000;
        fx.sfx.cue('zap', P);
        return;
      }
      case 2: {
        const a = fx.abil(e.src, 'e');
        const life = (a.duration ?? 30) * TICK_S;
        mesh(fx, 'dome', P.x, P.z, 0.85, life, FROST, c.rim, c.rel, 0, 0);
        mesh(fx, 'ring', P.x, P.z, (a.meleeRange ?? 2000) / 1000, life, ICE, c.rim, c.rel, 0, 0.05, (a.meleeRange ?? 2000) / 1000, 0.1);
        mesh(fx, 'crescent', P.x, P.z, 1.0, 0.25, FROST, c.rim, c.rel, 0, 0.08);
        fx.sfx.cue('clang', P);
        return;
      }
      default: {
        const a = fx.abil(e.src, 'r');
        const splash = (a.splash ?? 1600) / 1000;
        mesh(fx, 'crescent', P.x, P.z, 1.6, 0.4, KRAFT, c.rim, c.rel, 0, 0.1);
        mesh(fx, 'ring', P.x, P.z, splash, 0.5, ICE, c.rim, c.rel, 0, 0.06, splash, 0.2);
        mesh(fx, 'glow', P.x, P.z, 1.4, 0.35, FROST, c.rim, c.rel, 0, 0.8);
        fx.particles.debris(P.x, P.z, 1.0);
        fx.cam.tier(2);
        fx.sfx.cue('fwoomp', P);
      }
    }
  },

  onProjectile(owner, kind, slot, fx, index) {
    if (kind !== PROJECTILE_KIND.cap || slot !== 0 || index === undefined) return;
    const c = casterOf(owner, true);
    if (!c) return;
    endTrail(fx, c);
    if (!fx.projPos?.(index, P)) return;
    P.y = 1.0;
    c.proj = index;
    c.trail = fx.ribbons.point(P, ICE, 0.22, 0.25);
  },

  onHit(e, fx, ctx) {
    const c = casterOf(e.src, false);
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (!fx.heroPos(e.dst, P)) return;
    if (e.kind === 'basic') {
      mesh(fx, 'glow', P.x, P.z, 0.6, 0.14, DOT, rim, rel, 0, 0.7);
      if (ctx.form === true) {
        // BOXBOT: the splash at the sim radius, cardboard confetti and a frost rim
        const splash = (fx.abil(e.src, 'r').splash ?? 1600) / 1000;
        mesh(fx, 'ring', P.x, P.z, splash, 0.3, KRAFT, rim, rel, 0, 0.06, splash, 0.25);
        mesh(fx, 'crescent', P.x, P.z, splash * 0.8, 0.24, ICE, rim, rel, 0, 0.08);
        fx.particles.debris(P.x, P.z, 0.5);
      }
      return;
    }
    if (c && c.beam > 0) {
      // a Laser Pointer pulse: a frost spark where the dot burns
      mesh(fx, 'glow', P.x, P.z, 0.5, 0.12, FROST, rim, rel, 0, 0.6);
      return;
    }
    if (c && now - c.capAt < 1) {
      c.capAt = -99;
      endTrail(fx, c);
      mesh(fx, 'ring', P.x, P.z, 1.2, 0.3, ICE, rim, rel, 0, 0.06, 1.2, 0.15);
      mesh(fx, 'glow', P.x, P.z, 1.0, 0.22, FROST, rim, rel, 0, 0.8);
      mesh(fx, 'crescent', P.x, P.z, 1.1, 0.24, DOT, rim, rel, 0, 0.1);
      fx.cam.tier(1);
      return;
    }
    // BOXBOT's splash on the heroes around a basic's target
    mesh(fx, 'glow', P.x, P.z, 0.5, 0.14, KRAFT, rim, rel, 0, 0.5);
  },

  update(dt, fx) {
    now += dt;
    for (const c of CASTERS) {
      if (c.id < 0) continue;
      if (c.trail >= 0) {
        if (fx.projPos?.(c.proj, P)) fx.ribbons.feed(c.trail, P.x, 1.0, P.z);
        else endTrail(fx, c);
      }
      if (c.beam <= 0) continue;
      c.beam -= dt;
      if (c.beam <= 0 || (fx.status?.(c.id, ST) === true && (ST.buffs & STUNNED) !== 0)) {
        endBeam(c);
        continue;
      }
      c.beamNext -= dt;
      if (c.beamNext > 0) continue;
      c.beamNext = BEAM_EVERY;
      if (!fx.heroPos(c.id, P) || !fx.facing?.(c.id, F)) continue;
      const yaw = Math.atan2(-F.z, F.x);
      mesh(fx, 'beam', P.x + F.x * 0.3, P.z + F.z * 0.3, c.len, BEAM_LIFE, ICE, c.rim, c.rel, yaw, BEAM_Y, c.width);
      mesh(fx, 'glow', P.x + F.x * c.len, P.z + F.z * c.len, 0.45, BEAM_LIFE, DOT, c.rim, c.rel, 0, 0.08);
    }
  },
};
