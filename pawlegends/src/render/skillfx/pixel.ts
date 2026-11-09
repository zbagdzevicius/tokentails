/**
 * Pixel skill FX (sim v11; build spec docs/plans/moba/CATS-V11.md §2.2 "Moves and VFX"): ice-cyan gadget light,
 * bottle caps and cardboard.
 *
 * - Basic: a small cap pop on the target; under BOXBOT (MoveCtx.form) a cardboard-confetti ring at exactly the sim
 *   splash radius around it (Big Boom's 2.2 m included).
 * - Q Cap Cannon: a muzzle flash, an ice ribbon riding the cap bolt (projectileView draws the cap itself, from
 *   HERO_SHOTS), a burst and ring on the hero it stops on.
 * - W Laser Pointer: the beam drawn every frame from her along her drawn facing (the sim turns the beam toward her
 *   facing, so walking steers both), exactly the sim length (its bright core the sim width) at paw height over the
 *   hit lane on the ground, ice cyan with a red dot glow at the far end; a frost spark on every pulse hit. It ends at the sim duration (Overclock's 2 s included), on another cast of hers,
 *   or when the snapshot shows her stunned (the sim breaks the beam on hard CC).
 * - E Duck and Cover: the flaps clap shut (two kraft slashes over the rim): a tall frost-rim shell over the box for
 *   exactly the sim duration and a ring at the melee reach that slows attackers.
 * - R BOXBOT MK II: a cardboard-confetti burst and a shield ring on the transformation (the clips grow the box and
 *   stand it on its robot legs).
 *
 * Feel pass (skills-2 lane, render only; stickers and pops from render/fx/fun): a spinning bottle cap rides the Cap
 * Cannon bolt and a hero it stops on gets "PLINK!"; the Laser Pointer ends in a bright pink chase dot that jitters along
 * a seeded path (funRand: replays match), and a hero the pulses tag gets a "!" over the head; Duck and Cover peeks two
 * blinking eyes over the flaps; BOXBOT bursts cardboard confetti with a "BEEP-BOOP!"; her own death (dizzy stars),
 * respawn (a cardboard thump, then confetti as she pops out) and level-up (sparkles) clips throw their beats here.
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/pixel.ts): the nature and chiptune layers (cap "pew", laser
 * "vwee", box "loading", BOXBOT arpeggio) play from render/effects.ts on every cast, so the stand-in cues (pop, zap,
 * clang, fwoomp) are gone from here. This script adds what only it knows: the cap's travel whirr, cyan and kraft LED
 * pixels shed by the cap and by the pixel-stepped laser, a cap hit breaking into 4 pixels, a pixel "loading" ring
 * round the ducked box and pixels flying in to assemble BOXBOT.
 *
 * Shapes use the talent-resolved numbers (fx.abil). Everything is pooled: no allocation per event or per frame.
 * Render only.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import type { MixRelation } from '../../audio/identityMix';
import { playSkillSfx } from '../../audio/skillSfx';
import { TICK_S } from '../anim/timing';
import type { FxCtx, HeroStatus, MeshFxKind, MeshFxSpawn, Relation3, SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { flying, funOverY, funPop, funRand, funSfx, orbit, sticker } from '../fx/fun/funKit';
import { cap, eyes, shower } from '../fx/fun/skills2Fun';

/** Ice cyan (her element), the laser dot red, the kraft confetti and a frost white. */
const ICE = 0x3fa8d8;
const DOT = 0xd8282a;
const KRAFT = 0x8a5a2c;
const FROST = 0xbfe8ff;
/** BuffFlag.Stunned (sim/api), kept local so this chunk carries no sim import. */
const STUNNED = 1 << 3;
/**
 * Beam segments are re-drawn this often (s). Each lives until the next redraw plus one frame (at least BEAM_LIFE), so
 * a slow frame (dt above the redraw period) never leaves a gap or a half-faded beam.
 */
const BEAM_EVERY = 0.05;
const BEAM_LIFE = 0.08;
/** Beam height above the ground (m): her pointer paw. */
const BEAM_Y = 0.75;
/** The beam shader's core fades to a sixth at a quarter width from the axis: the glow quad is this much wider so the bright core is the sim width. */
export const BEAM_GLOW_W = 1.8;
/** The bright laser core (lighter than her element so it reads on sand and grass alike). */
const BEAM_CORE = 0x8fe6ff;
/** Feel-pass sticker colours: the chase dot (pink-red, the sticker rule keeps it off pure red), the cap face, kraft. */
const CHASE = 0xff4d8a;
const CAP_FACE = 0x3fa8d8;
const CARD = 0xc89a5e;
const STARS = 0xffe066;
/** Her identity colour pair's primary (data/identity.ts): the LED pixel cyan (the kraft is CARD). */
const PIX = 0x3fd8e8;
const MIX_REL: Readonly<Record<Relation3, MixRelation>> = { own: 'mine', ally: 'ally', enemy: 'enemy' };

/** A skill phase's nature + champion sound (audio/skillSfx.ts) for a moment only this script sees. */
function skillSound(fx: FxCtx, id: number, skill: 'q' | 'w' | 'e' | 'r', phase: 'impact' | 'travel', at: { x: number; z: number }): void {
  try {
    playSkillSfx('pixel', skill, phase, { at, relation: MIX_REL[fx.relation(id)] ?? 'enemy', src: id });
  } catch {
    /* audio not unlocked yet */
  }
}

/** `n` LED pixels (cyan, every other one kraft) breaking out of a square block at (x, y, z): never round, never spun. */
function pixelBreak(fx: FxCtx, x: number, y: number, z: number, n: number, speed: number, life: number): void {
  for (let i = 0; i < n; i++) {
    const gx = (i & 1) - 0.5;
    const gz = ((i >> 1) & 1) - 0.5;
    flying(fx, x + gx * 0.2, y + (i >> 2) * 0.2, z + gz * 0.2, gx * speed, speed * 0.6, gz * speed, 'CONFETTI', i % 2 ? CARD : PIX, 0.2, life);
  }
}

// ------------------------------------------------------------------------------------------------ pooled scratch

const P = { x: 0, y: 0, z: 0 };
const F = { x: 0, y: 0, z: 0 };
const ST: HeroStatus = { buffs: 0, shield: 0 };
const S: MeshFxSpawn = { x: 0, y: 0.06, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1, life: 1, color: 0, rim: 0, p0: 0, p1: 0, p2: 0, p3: 1, rel: 'own', delay: 0 };

function mesh(fx: FxCtx, kind: MeshFxKind, x: number, z: number, sx: number, life: number, color: number, rim: number, rel: Relation3, yaw = 0, y = 0.06, sz = sx, p1 = 0, sy = 1, p3 = 1): number {
  S.x = x;
  S.z = z;
  S.y = y;
  S.yaw = yaw;
  S.sx = sx;
  S.sy = sy;
  S.sz = sz;
  S.life = life;
  S.color = color;
  S.rim = rim;
  S.rel = rel;
  S.p0 = kind === 'crescent' ? Math.PI * 2 : 0;
  S.p1 = p1;
  S.p2 = 0;
  S.p3 = p3;
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
  /** Feel pass: the cast tick of the beam (funRand seed for the dot's chase path), the cap sticker clock, the duck. */
  beamTick = 0;
  beamT = 0;
  capNext = 0;
  duck = 0;
  duckNext = 0;
  /** Bit per victim id: already got its "!" this beam. */
  tagged = 0;
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
    c.beamT = 0;
    c.duck = 0;
    c.tagged = 0;
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
        c.capNext = 0;
        if (fx.bonePos(e.src, 'weaponTip', F)) {
          mesh(fx, 'glow', F.x, F.z, 0.7, 0.16, FROST, c.rim, c.rel, 0, F.y);
          // a puff of fizz from the muzzle (it's a soda cap)
          shower(fx, F.x, F.y, F.z, 5, SHAPE.SOFT, FROST, 0.14, 0.3, 1.4, 1.2, -1, funRand(e.tick, e.src, 0), true);
        }
        // a muzzle of pixels (the chiptune "pew" is the champion layer, render/effects.ts)
        pixelBreak(fx, P.x, 1.1, P.z, 4, 1.6, 0.3);
        return;
      }
      case 1: {
        const a = fx.abil(e.src, 'w');
        c.beam = (a.duration ?? 45) * TICK_S;
        c.beamNext = 0;
        c.len = (a.range ?? 9000) / 1000;
        c.width = (a.width ?? 600) / 1000;
        c.beamTick = e.tick;
        c.beamT = 0;
        c.tagged = 0;
        return;
      }
      case 2: {
        const a = fx.abil(e.src, 'e');
        const life = (a.duration ?? 30) * TICK_S;
        // the frost-rim shell over the whole ducked box (taller than wide: she is squashed into it), its rim strong
        mesh(fx, 'dome', P.x, P.z, 1.05, life, FROST, c.rim, c.rel, 0, 0, 1.05, 0, 1.6, 2);
        mesh(fx, 'ring', P.x, P.z, (a.meleeRange ?? 2000) / 1000, life, ICE, c.rim, c.rel, 0, 0.05, (a.meleeRange ?? 2000) / 1000, 0.1);
        // the flaps clap shut: two kraft slashes snapping together over the rim, a frost flash
        mesh(fx, 'crescent', P.x, P.z, 0.7, 0.16, KRAFT, c.rim, c.rel, 0, 1.0);
        S.p0 = Math.PI * 0.9;
        S.p2 = -1;
        S.yaw = Math.PI;
        fx.mesh.spawn('crescent', S);
        mesh(fx, 'glow', P.x, P.z, 1.1, 0.2, FROST, c.rim, c.rel, 0, 1.0);
        mesh(fx, 'crescent', P.x, P.z, 1.0, 0.25, FROST, c.rim, c.rel, 0, 0.08);
        c.duck = life;
        c.duckNext = 0.15;
        // the pixel "loading" ring over the shut flaps
        orbit(fx, P.x, 1.5, P.z, 'CONFETTI', PIX, 8, 0.55, 0.18, Math.min(1, life));
        return;
      }
      default: {
        const a = fx.abil(e.src, 'r');
        const splash = (a.splash ?? 1600) / 1000;
        mesh(fx, 'crescent', P.x, P.z, 1.6, 0.4, KRAFT, c.rim, c.rel, 0, 0.1);
        mesh(fx, 'ring', P.x, P.z, splash, 0.5, ICE, c.rim, c.rel, 0, 0.06, splash, 0.2);
        mesh(fx, 'glow', P.x, P.z, 1.4, 0.35, FROST, c.rim, c.rel, 0, 0.8);
        fx.particles.debris(P.x, P.z, 1.0);
        // the transformation: cardboard confetti and tape flying off the box, and the robot's boot-up beep
        const v = funRand(e.tick, e.src, 3);
        shower(fx, P.x, 1.0, P.z, 14, SHAPE.CONFETTI, CARD, 0.24, 0.9, 3.4, 3.2, 7, v);
        shower(fx, P.x, 1.2, P.z, 6, SHAPE.CONFETTI, FROST, 0.18, 0.8, 2.6, 3.6, 7, v + 0.5);
        funPop(fx, e.src, v < 0.5 ? 'BEEP-BOOP!' : 'BOOP-BEEP!', P.x, funOverY(fx, e.src, 1.1), P.z);
        funSfx(fx, 'blip', P, 0.8);
        fx.cam.tier(2);
        // pixels fly in from a ring and assemble the bot suit (the power-up is the empower nature + her ult voice)
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const cx = Math.cos(ang) * 1.6;
          const cz = Math.sin(ang) * 1.6;
          flying(fx, P.x + cx, 0.6 + (i & 3) * 0.3, P.z + cz, -cx / 0.35, 0.6, -cz / 0.35, 'CONFETTI', i & 1 ? CARD : PIX, 0.24, 0.35);
        }
      }
    }
  },

  onMarker(id, _clip, marker, fx) {
    if (marker.charCodeAt(0) !== 112 || marker.charCodeAt(2) !== 58 || !fx.heroPos(id, P)) return; // 'px:' beats only
    const rel = fx.relation(id);
    const rim = fx.rim(id);
    switch (marker) {
      case 'px:duck':
        // the flaps clap: a little kraft dust
        shower(fx, P.x, 0.9, P.z, 4, SHAPE.CONFETTI, CARD, 0.14, 0.4, 1.6, 1.2, 6, (now * 0.37) % 1);
        return;
      case 'px:dizzy':
        orbit(fx, P.x, 0.9, P.z, 'STAR', STARS, 3, 0.4, 0.22, 1.2, now % 6.283);
        return;
      case 'px:land':
        // the box thumps down: cardboard dust and a kraft ring
        mesh(fx, 'ring', P.x, P.z, 1.4, 0.35, KRAFT, rim, rel, 0, 0.06, 1.4, 0.3);
        shower(fx, P.x, 0.2, P.z, 6, SHAPE.PUFF, 0xe9d6b0, 0.4, 0.45, 2.6, 0.6, 2, (now * 0.29) % 1);
        funSfx(fx, 'bonk', P, 0.6);
        return;
      case 'px:pop':
        // flaps open, she pops out: confetti and a "!"
        shower(fx, P.x, 1.0, P.z, 10, SHAPE.CONFETTI, CARD, 0.2, 0.8, 2.6, 3.0, 7, (now * 0.41) % 1);
        shower(fx, P.x, 1.1, P.z, 6, SHAPE.CONFETTI, FROST, 0.16, 0.7, 2.2, 3.4, 7, (now * 0.53) % 1);
        sticker(fx, P.x + 0.25, funOverY(fx, id, 0.25), P.z, 'EXCLAIM', 0xffe066, 0.5, 0.7, 0.5, 0, 0.15);
        funSfx(fx, 'squeakToy', P, 0.7);
        return;
      case 'px:level':
        shower(fx, P.x, 1.2, P.z, 8, SHAPE.STAR4, FROST, 0.26, 0.6, 1.8, 2.6, 3, (now * 0.47) % 1, true);
        sticker(fx, P.x - 0.4, funOverY(fx, id, 0), P.z, 'NOTE', 0xffd27a, 0.3, 0.8, 0.8, 0, -0.2);
        return;
      default:
        return;
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
    skillSound(fx, owner, 'q', 'travel', P);
  },

  onHit(e, fx, ctx) {
    const c = casterOf(e.src, false);
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (!fx.heroPos(e.dst, P)) return;
    if (e.kind === 'basic') {
      mesh(fx, 'glow', P.x, P.z, 0.6, 0.14, DOT, rim, rel, 0, 0.7);
      // her pellet breaks into 4 pixels on the target
      pixelBreak(fx, P.x, 0.9, P.z, 4, 1.2, 0.3);
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
      // a Laser Pointer pulse: a frost spark where the dot burns; a hero it tags the first time gets a startled "!"
      mesh(fx, 'glow', P.x, P.z, 0.5, 0.12, FROST, rim, rel, 0, 0.6);
      // each pulse drops pixels where it burns
      pixelBreak(fx, P.x, 0.7, P.z, 2, 0.8, 0.35);
      const bit = e.dst >= 0 && e.dst < 30 ? 1 << e.dst : 0;
      if (bit && (c.tagged & bit) === 0 && fx.abil(e.dst, 'q').cooldown !== undefined) {
        c.tagged |= bit;
        sticker(fx, P.x + 0.15, funOverY(fx, e.dst, 0.2), P.z, 'EXCLAIM', 0xffe066, 0.5, 0.7, 0.4, 0, 0.15);
      }
      return;
    }
    if (c && now - c.capAt < 1) {
      c.capAt = -99;
      endTrail(fx, c);
      mesh(fx, 'ring', P.x, P.z, 1.2, 0.3, ICE, rim, rel, 0, 0.06, 1.2, 0.15);
      mesh(fx, 'glow', P.x, P.z, 1.0, 0.22, FROST, rim, rel, 0, 0.8);
      mesh(fx, 'crescent', P.x, P.z, 1.1, 0.24, DOT, rim, rel, 0, 0.1);
      // the cap pings off the hero (it breaks into pixels): it bounces away spinning, "PLINK!" over them
      pixelBreak(fx, P.x, 1.0, P.z, 6, 2.2, 0.4);
      const v = funRand(e.tick, e.src, 1);
      cap(fx, P.x, 1.1, P.z, (v - 0.5) * 3, 3.2, 0.6, 0.34, CAP_FACE, 0.7, 14, 0, 9);
      if (fx.abil(e.dst, 'q').cooldown !== undefined && funPop(fx, e.src, 'PLINK!', P.x, funOverY(fx, e.dst, 0.5), P.z)) funSfx(fx, 'sparkle', P, 0.8);
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
        if (fx.projPos?.(c.proj, P)) {
          fx.ribbons.feed(c.trail, P.x, 1.0, P.z);
          // a spinning bottle cap on the bolt (re-dropped each 1/30 s at a turning roll, so it reads as spinning)
          c.capNext -= dt;
          if (c.capNext <= 0) {
            c.capNext = 1 / 30;
            cap(fx, P.x, 1.0, P.z, 0, 0, 0, 0.36, CAP_FACE, 0.06, 0, now * 18, 0);
            // a pixel square shed behind the cap every third drop (a stepped 8-bit trail)
            if (((now * 30) | 0) % 3 === 0) sticker(fx, P.x, 1.0, P.z, 'CONFETTI', ((now * 10) | 0) & 1 ? CARD : PIX, 0.2, 0.3);
          }
        } else endTrail(fx, c);
      }
      if (c.duck > 0) {
        // Duck and Cover: two eyes peek over the flaps, blinking (each pair lives 0.55 s, a 0.1 s gap between them)
        c.duck -= dt;
        c.duckNext -= dt;
        if (c.duckNext <= 0 && c.duck > 0.2 && fx.heroPos(c.id, P)) {
          c.duckNext = 0.65;
          const look = Math.sin(now * 2.3) > 0 ? 1 : -1;
          eyes(fx, P.x, funOverY(fx, c.id, 0) * 0.5, P.z + 0.8, 0.2, Math.min(0.55, c.duck), look);
        }
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
      const life = Math.max(BEAM_LIFE, BEAM_EVERY + dt * 2);
      // the laser at paw height (its bright core the sim width), the hit lane on the ground under it (Med and up:
      // Low keeps its two beam slots for the laser) and the red dot where it ends
      mesh(fx, 'beam', P.x + F.x * 0.3, P.z + F.z * 0.3, c.len, life, BEAM_CORE, c.rim, c.rel, yaw, BEAM_Y, c.width * BEAM_GLOW_W);
      if (fx.tier !== 'low') mesh(fx, 'beam', P.x + F.x * 0.3, P.z + F.z * 0.3, c.len, life, ICE, c.rim, c.rel, yaw, 0.07, c.width);
      mesh(fx, 'glow', P.x + F.x * c.len, P.z + F.z * c.len, 0.7, life, DOT, c.rim, c.rel, 0, 0.08);
      if (fx.tier !== 'low') mesh(fx, 'glow', P.x + F.x * c.len, P.z + F.z * c.len, 0.3, life, DOT, c.rim, c.rel, 0, BEAM_Y);
      // the chase dot every cat can't resist: a bright pink sticker darting round the beam's end on a seeded path
      // (decoration only: it stays inside the sim width round the end point)
      c.beamT += BEAM_EVERY;
      const k = Math.floor(c.beamT / 0.2);
      const r0 = funRand(c.beamTick, c.id, k);
      const r1 = funRand(c.beamTick, c.id, k + 1);
      const u = (c.beamT % 0.2) / 0.2;
      const ang = (r0 + (r1 - r0) * u) * 6.283;
      const jr = c.width * 0.45;
      const ex = P.x + F.x * c.len + Math.cos(ang) * jr;
      const ez = P.z + F.z * c.len + Math.sin(ang) * jr;
      sticker(fx, ex, 0.25, ez, 'DOT', CHASE, 0.42, life + 0.02);
      sticker(fx, ex, 0.25, ez, 'DOT', 0xffffff, 0.16, life + 0.02);
      // the pixel-stepped beam: one LED pixel snapped to a 0.5 m step along it per redraw, alternating cyan / kraft
      const step = Math.floor(funRand(c.beamTick, c.id, k + 7) * c.len * 2) * 0.5;
      sticker(fx, P.x + F.x * step, BEAM_Y, P.z + F.z * step, 'CONFETTI', k & 1 ? CARD : PIX, 0.2, life * 2);
    }
  },
};
