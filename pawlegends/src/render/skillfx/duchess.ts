/**
 * Duchess skill FX (sim v11; build spec docs/plans/moba/CATS-V11.md §2.3 "Moves and VFX"): shed fur, a royal purple
 * glare and a crown.
 *
 * - Basic: a small "hmph" puff of fur on the victim (the bolt itself is projectileView's look).
 * - Q Fluff Puff: a soft ground strip of the skillshot width riding the fluffball at the sim speed to its range (the
 *   dodge width from the iso camera; the ball pierces, so it never ends early), and a fur burst on every unit it hits.
 * - W Not Amused: a purple glint at her eyes for exactly the windup, then the glare wedge over the exact cone (range,
 *   arc) for a blink and a slower fading rim.
 * - E Cushion Glide: the fur cloud at the take-off point: a soft cream-grey disc with lumps of fur (glow cards
 *   refreshed on each of its slow pulses, `every`) over exactly the sim radius for exactly the cloud's life (ttl), a
 *   faint edge at the radius, a soft puff ring on each pulse, and a fur trail on the landing.
 * - R Royal Decree: a crown gathering over her head through the windup, then on the cast a crown wave: a ring at
 *   exactly the sim radius with five upright crown points round it and a purple sweep.
 * - Snub (Utter Disdain): a hero the snapshot shows newly Stunned shortly after one of her ability hits gets the
 *   "hmph" puff and a ring of stars over its head. The Disdain count pips (0–3 crowns over the enemy plate) are the
 *   overhead's job (EntitySnap.stacks); this set only marks the Snub.
 *
 * Fun layer (skill-feel pass, render only): the fluffball is a growing hairball sticker shedding tufts as it rolls and
 * its hits burst into fur (a "PFFT!" on a big hit); Not Amused gets a once-per-cast "HMPH!" and a sweat drop over each
 * slowed hero; the fur cloud lets seeded tufts float up (the variant colours come from funRand on the cast tick, so a
 * replay matches); Royal Decree wears a real crown sticker over her head through the windup, five small crowns pop up
 * round her on the stamp (a confetti flourish at max rank) and the first hero it hits gets "BEGONE!"; the Snub adds
 * "HMPH!" and dizzy stars. Sticker sizes follow the rank (funRank).
 *
 * Colours: the shared additive shader brightens toward white, so the purple and fur bases are dark (ROYAL, GLARE, FUR)
 * with intensity (p3) 0.5–0.7. No gold: gold is "you" (the rim already carries it on her own casts).
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/duchess.ts): every skill also draws its nature accent (Q
 * projectile sparkle, W shadow implode, E mobility trail, R sonic ripples) and her motif, tiny gold crowns over plum
 * fluff: a crown riding the fluffball, crown points at the glare's two edges, crowns off the cushion and the decree,
 * and a crown dropping onto a Snubbed head. On an enemy the crown gold is a pale glint. Sounds: the framework plays the
 * nature layer with her harpsichord motif (Not Amused: the "hmph"; R: her ult voice), so the balloon, hiss and gong
 * cues are gone; the fluffball carries the projectile travel whoosh and the Snub rings her crown ting.
 *
 * Shapes use the talent-resolved numbers (fx.abil). Enemy effects take the danger rim (fx.rim). Everything is pooled:
 * no allocation per event or per frame. Render only.
 */
import { CHAMP_AUDIO } from '../../audio/champ';
import type { MotifPainter } from '../../audio/champ/types';
import { playSkillSfx } from '../../audio/skillSfx';
import { IDENTITY, type SkillKey } from '../../data/identity';
import { stubFx } from '../anim/common';
import { TICK_S } from '../anim/timing';
import { CAPS } from '../../data/map';
import type { FxCtx, MeshFxKind, MeshFxSpawn, MoveCtx, Relation3, SkillFxSet } from '../anim/types';
import { NATURE_FX } from '../fx/natureFx';
import { FADE, SHAPE } from '../fx/Particles.js';
import { funBigHit, funCount, funPool, funPop, funRand, funRank, funSfx, orbit, sticker, stickerBurst } from '../fx/fun/funKit';
import { S3Once, s3Crown, s3HeadY } from '../fx/fun/skills3Kit';

const ROYAL = 0x4a1a8a;
const GLARE = 0x7a28d0;
const FUR = 0x8a8078;
/** The shed-fur cloud: a paler cream-grey, so the lumps read as fluff on grass and sand (not a gold telegraph). */
const FLUFF = 0xb4aa9e;
/** Fur-cloud lumps: offsets (share of the radius) round the centre, cycled one per lump. */
const LUMP_A = [0.15, 2.3, 4.4, 1.2, 3.4, 5.5];
const LUMP_R = [0.5, 0.55, 0.45, 0.3, 0.6, 0.35];
const STAR = 0xb0a0e0;
/** Intensity (p3): low enough that the additive shader keeps the purple. */
const FI = 0.6;
/** BuffFlag.Stunned (sim/api), kept local so this chunk carries no sim import. */
const STUNNED = 1 << 3;
const TAU = Math.PI * 2;
/** Fun stickers: cream fur, a lilac and a blush variant (seeded per cast), her tassel gold, sweat blue, star lilac. */
const TUFT = [0xfff6ee, 0xe6d8ff, 0xffe2ec] as const;
/** The crown stickers' gold (a warm sticker gold over her head, never a ground ring: gold stays 'you' on the floor). */
const CROWN = 0xffcf4a;
const JEWEL = 0xb07cff;
const SWEAT = 0x9ad8ff;
/** Fluffball sticker cadence (s): the rolling hairball is re-laid this often (Low: slower). */
const BALL_EVERY = 0.06;
/** A Snub shows only on a stun this soon after one of her ability hits on that hero (s). */
const SNUB_WINDOW = 0.35;

// ------------------------------------------------------------------------------------------------ pooled scratch

const P = { x: 0, y: 0, z: 0 };
const V = { x: 0, y: 0, z: 0 };
const S: MeshFxSpawn = { x: 0, y: 0.06, z: 0, yaw: 0, sx: 1, sy: 1, sz: 1, life: 1, color: 0, rim: 0, p0: 0, p1: 0, p2: 0, p3: 1, rel: 'own', delay: 0 };

/** Spawn one mesh effect from the shared options object (never a new literal). */
function mesh(fx: FxCtx, kind: MeshFxKind, x: number, z: number, sx: number, life: number, color: number, rim: number, rel: Relation3, yaw = 0, y = 0.06, sy = 1, p0 = 0, p1 = 0, p2 = 0, p3 = 1, delay = 0, sz = sx): number {
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
  S.p0 = p0;
  S.p1 = p1;
  S.p2 = p2;
  S.p3 = p3;
  S.delay = delay;
  return fx.mesh.spawn(kind, S);
}

/** Facing yaw (mesh convention: forward = (cos, −sin)) from (x, z) toward the event's aim (mm, sim y up). */
function aimYaw(x: number, z: number, ex: number, ey: number, fallback: number): number {
  const dx = ex / 1000 - x;
  const dz = -ey / 1000 - z;
  return Math.abs(dx) + Math.abs(dz) < 0.01 ? fallback : Math.atan2(-dz, dx);
}

/** A puff of shed fur at (x, z): a soft glow, a small ring, a few tufts. */
function furPuff(fx: FxCtx, x: number, z: number, k: number, rim: number, rel: Relation3, y = 0.9): void {
  mesh(fx, 'glow', x, z, 0.9 * k, 0.24, FUR, rim, rel, 0, y, 1, 0, 0, 0, FI);
  mesh(fx, 'ring', x, z, 0.8 * k, 0.28, FUR, rim, rel, 0, 0.07, 1, 0, 0.35, 0, 0.5);
  fx.particles.debris(x, z, 0.35 * k);
}

// ------------------------------------------------------------------------------------------------ champion identity

type Pool = Pick<MotifPainter, 'burst' | 'single' | 'ring'>;
let pool: Pool | null = null;
const SH = SHAPE as unknown as Readonly<Record<string, number>>;
/** The fun sticker pool as the champion motif painter (audio/champ/duchess.ts paintDuchess draws through it). */
const PAINTER: MotifPainter = {
  burst: (pos, o) => pool?.burst(pos, o),
  single: (pos, o) => pool?.single(pos, o),
  ring: (pos, o) => pool?.ring(pos, o),
  shape: SH,
  colors: { primary: IDENTITY.duchess.colors.primary, secondary: IDENTITY.duchess.colors.secondary },
};
/** The colour pair on an enemy: a gold-family colour mixed 70 percent toward white (never the gold "you" family). */
const ENEMY_PRIMARY = IDENTITY.duchess.colors.primary;
const ENEMY_SECONDARY = 0xfff1c9;
const IAT = { x: 0, y: 0, z: 0 };
const IDIR = { x: 0, z: 0 };
const IDIR3 = { x: 0, y: 0, z: 0 };
const NB = { n: 1, exact: true, shape: 0, color: 0, additive: false, intensity: 1, size: [0.1, 0.2] as readonly number[], life: [0.3, 0.5] as readonly number[], speed: [1, 2] as readonly number[], gravity: 0, up: 0, dir: undefined as typeof IDIR3 | undefined, spread: Math.PI, stretch: 1, drag: 1, flat: false, fade: 0 as number, r0: 0.5, sizeEnd: 1 };
const NS = { shape: 0, color: 0, size0: 0.4, size1: 1.6, life: 0.3, alpha: 0.7, intensity: 1.4, additive: true };

/** The skill's nature accent at IAT (NATURE_FX: its shape, colour and motion), about half a cast's worth of particles. */
function natureAccent(fx: FxCtx, skill: SkillKey, has: boolean): void {
  const s = NATURE_FX[IDENTITY.duchess.skills[skill].nature];
  const p = pool!;
  const o = NB;
  o.n = funCount(fx, Math.max(2, Math.round(s.count.cast * 0.5)));
  o.shape = SH[s.shape];
  o.color = s.color;
  o.additive = s.additive;
  o.intensity = s.additive ? 1.4 : 1;
  o.size = s.size;
  o.life = s.life;
  o.speed = s.speed;
  o.gravity = s.gravity;
  o.up = 0.6;
  o.dir = undefined;
  o.spread = Math.PI;
  o.stretch = 1;
  o.drag = 1;
  o.flat = false;
  o.fade = FADE.TWINKLE;
  switch (s.motion) {
    case 'slam':
    case 'dome':
    case 'implode':
    case 'twinkle':
      o.r0 = s.motion === 'implode' ? 1.4 : 0.6;
      o.up = s.motion === 'dome' ? 1.6 : 0.4;
      o.sizeEnd = s.motion === 'slam' ? 2 : 0.7;
      p.ring(IAT, o);
      return;
    case 'ripple':
      NS.shape = SH.RING;
      NS.color = s.color;
      for (let i = 0; i < 2; i++) {
        NS.size0 = 0.4 + i * 0.5;
        NS.size1 = 1.6 + i * 0.9;
        NS.life = 0.3 + i * 0.06;
        NS.alpha = 0.75 - i * 0.15;
        p.single(IAT, NS);
      }
      return;
    case 'sweep':
    case 'bolt':
    case 'streak':
      if (has) {
        o.dir = IDIR3;
        o.spread = 0.6;
      }
      o.stretch = 2.5;
      o.drag = 4;
      break;
    case 'rise':
    case 'pillar':
      o.up = 2.5;
      break;
    case 'arc':
      o.up = 3;
      break;
    case 'trail':
      o.flat = true;
      o.up = 0.4;
      break;
    default:
  }
  p.burst(IAT, o);
}

/**
 * Champion identity (CHAMP-IDENTITY.md §1–§3): the skill's nature accent and Duchess's crown-and-fluff motif in the colour pair at
 * (x, y, z) for caster `src`, `n` motif particles (the tier halves it), along (dx, dz) when given. `nature` false: the motif alone. A
 * no-op without the fun pool (unit stubs).
 */
function identity(fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void {
  const p = funPool(fx) as unknown as Partial<Pool> | null;
  if (!p || typeof p.burst !== 'function') return;
  pool = p as Pool;
  // gold stays "you": on an enemy the gold-family half of the pair is drawn as a pale glint (skins trimForTeam)
  const foe = fx.relation(src) === 'enemy';
  PAINTER.colors.primary = foe ? ENEMY_PRIMARY : IDENTITY.duchess.colors.primary;
  PAINTER.colors.secondary = foe ? ENEMY_SECONDARY : IDENTITY.duchess.colors.secondary;
  const has = dx !== 0 || dz !== 0;
  IAT.x = x;
  IAT.y = y;
  IAT.z = z;
  IDIR.x = IDIR3.x = dx;
  IDIR.z = IDIR3.z = dz;
  if (nature) natureAccent(fx, skill, has);
  CHAMP_AUDIO.duchess.fx?.paint?.(PAINTER, IAT, funCount(fx, n), has ? IDIR : null, skill);
}

/** The identity mix relation of a Relation3. */
const MIXREL = { own: 'mine', ally: 'ally', enemy: 'enemy' } as const;
/** Scratch position for the travel and Snub sounds. */
const SAT = { x: 0, z: 0 };
/** Seconds between the fluffball's travel whooshes. */
const HUM_EVERY = 0.4;

// ------------------------------------------------------------------------------------------------ Q fluffballs

class Puff {
  on = false;
  owner = -1;
  x0 = 0;
  z0 = 0;
  dx = 1;
  dz = 0;
  d = 0;
  max = 0;
  speed = 0;
  w = 1.4;
  nextStrip = 0;
  rel: Relation3 = 'own';
  rim = 0;
  /** Fun layer: the next hairball re-lay (s of travel clock), its age and the seeded tuft colour. */
  nextBall = 0;
  age = 0;
  tuft = 0;
  k = 1;
  /** Identity: the next travel whoosh (s of travel clock) and the crown re-lay parity. */
  nextHum = 0;
  crown = 0;
}
const PUFFS: Puff[] = [new Puff(), new Puff(), new Puff()];
/** Metres between the fluffball's ground strip segments. */
const STRIP_M = 1.0;

// ------------------------------------------------------------------------------------------------ E fur clouds

class Cloud {
  on = false;
  x = 0;
  z = 0;
  rad = 0;
  t = 0;
  life = 0;
  every = 0;
  next = 0;
  rel: Relation3 = 'own';
  rim = 0;
  /** Seed for the floating fur variants (cast tick, caster). */
  tick = 0;
  src = 0;
}
const CLOUDS: Cloud[] = [new Cloud(), new Cloud(), new Cloud()];

// ------------------------------------------------------------------------------------------------ Snub

/** Her recent ability hits on heroes: victim id and the module clock at the hit (−9 = none). */
const hitAt = new Float32Array(CAPS.heroes).fill(-9);
const hitRim = new Uint32Array(CAPS.heroes);
const hitRel: Relation3[] = new Array<Relation3>(CAPS.heroes).fill('own');
const hitSrc = new Int16Array(CAPS.heroes).fill(-1);
let clock = 0;
/** Her last cast slot and its clock per caster (an ability hit belongs to it), and the fun latches. */
const lastSlot = new Int8Array(CAPS.heroes).fill(-1);
const lastCastAt = new Float64Array(CAPS.heroes).fill(-9);
const hmph = new S3Once(CAPS.heroes);
const begone = new S3Once(CAPS.heroes);
/** Royal Decree's crown over her head: until (module clock), the next refresh, its size. */
const crownUntil = new Float64Array(CAPS.heroes);
const crownNext = new Float64Array(CAPS.heroes);
const crownK = new Float32Array(CAPS.heroes).fill(1);
/** Snubs drawn (tests). */
let snubs = 0;

/** The Snub: a "hmph" puff and a ring of stars over the victim's head. */
function snub(fx: FxCtx, id: number): void {
  if (!fx.heroPos(id, V)) return;
  const rim = hitRim[id];
  const rel = hitRel[id];
  furPuff(fx, V.x, V.z, 1.2, rim, rel, 1.6);
  mesh(fx, 'ring', V.x, V.z, 0.7, 0.75, STAR, rim, rel, 0, 2.2, 1, 0, 0.55, 0, 1);
  mesh(fx, 'crescent', V.x, V.z, 0.6, 0.75, STAR, rim, rel, 0, 2.25, 1, TAU, 0.75, 1, 1, 0.05);
  // the fun layer: dizzy stars round the snubbed head and her "HMPH!"
  const hy = s3HeadY(fx, id, 0.35);
  orbit(fx, V.x, hy, V.z, 'STAR', STAR, 3, 0.42, 0.26, 0.75, clock * 3);
  funPop(fx, id, 'HMPH!', V.x, hy + 0.4, V.z);
  // identity: a tiny crown drops onto the snubbed head, and her crown ting over the shadow thud
  identity(fx, hitSrc[id], 'passive', V.x, hy - 0.6, V.z, 4, 0, 0, false);
  SAT.x = V.x;
  SAT.z = V.z;
  playSkillSfx('duchess', 'passive', 'impact', { at: SAT, relation: MIXREL[rel] });
  snubs++;
}

// ------------------------------------------------------------------------------------------------ R crown

/** The crown wave: a ring at exactly `rad`, five upright crown points round it, a purple sweep. */
function crownWave(fx: FxCtx, x: number, z: number, rad: number, yaw: number, rim: number, rel: Relation3): void {
  mesh(fx, 'ring', x, z, rad, 0.5, ROYAL, rim, rel, yaw, 0.07, 1, 0, 0.1, 0, 0.7);
  mesh(fx, 'arc', x, z, rad, 0.7, GLARE, rim, rel, yaw, 0.05, 1, TAU, Math.max(0.8, 1 - 0.25 / rad), 1, FI);
  mesh(fx, 'crescent', x, z, rad * 0.9, 0.35, GLARE, rim, rel, yaw, 0.08, 1, TAU, 0.7, 1, FI);
  const n = fx.tier === 'low' ? 5 : 10;
  for (let i = 0; i < n; i++) {
    const a = yaw + (i * TAU) / n;
    // every other point is a tall crown spike (Med / High), Low draws only the five tall ones
    const tall = fx.tier === 'low' || i % 2 === 0;
    mesh(fx, 'pillar', x + Math.cos(a) * rad * 0.97, z - Math.sin(a) * rad * 0.97, tall ? 0.24 : 0.14, 0.55, ROYAL, rim, rel, 0, 0.02, tall ? 1.6 : 0.8, 0, 0, 0, FI, 0.02);
  }
}

/**
 * The decree's fun layer: five small crowns pop up round her and float off, lilac stars burst from the stamp, a meow;
 * at max rank a confetti flourish. Arms the once-per-cast "BEGONE!" on the first hero hit.
 */
function decreeFun(fx: FxCtx, src: number, tick: number, yaw: number): void {
  if (src >= 0 && src < CAPS.heroes) crownUntil[src] = 0;
  const k = funRank(fx, src, 3);
  const n = funCount(fx, 5);
  for (let i = 0; i < n; i++) {
    const a = yaw + (i * TAU) / n + funRand(tick, src, 20 + i) * 0.4;
    const d = 1.3 + 0.5 * funRand(tick, src, 30 + i);
    s3Crown(fx, P.x + Math.cos(a) * d, 1.0 + 0.35 * (i & 1), P.z - Math.sin(a) * d, 0.6 * k, 0.75, 1.5, CROWN, JEWEL);
  }
  stickerBurst(fx, P.x, 1.6, P.z, 'STAR', STAR, 0.3, 0.6, 8, 3.2, 2.2, -6, funRand(tick, src, 4));
  if (k > 1.3) stickerBurst(fx, P.x, 2.2, P.z, 'CONFETTI', JEWEL, 0.2, 0.9, 10, 2.6, 3.4, -6, funRand(tick, src, 5));
  funSfx(fx, 'meow', P, 0.8);
  if (src >= 0 && src < CAPS.heroes) begone.arm(src, clock);
}

// ------------------------------------------------------------------------------------------------ the set

export const SKILL_FX: SkillFxSet = {
  ...stubFx('duchess'),
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },

  onWindup(e, fx) {
    if (!fx.heroPos(e.src, P)) return;
    const life = e.ticks * TICK_S;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (e.slot === 1) {
      // Not Amused: the glint at her eyes for exactly the windup
      const y = fx.bonePos(e.src, 'head', V) ? V.y + 0.2 : 2.0;
      mesh(fx, 'glow', P.x, P.z, 0.5, life, GLARE, rim, rel, 0, y, 1, 0, 0, 0, FI);
    } else if (e.slot === 3) {
      // the fun layer: a real crown sticker sits over her head through the windup (update re-lays it on her head bone)
      if (e.src >= 0 && e.src < CAPS.heroes) {
        crownUntil[e.src] = clock + life;
        crownNext[e.src] = clock;
        crownK[e.src] = funRank(fx, e.src, 3);
      }
      // Royal Decree: the crown gathers over her head through the windup
      mesh(fx, 'glow', P.x, P.z, 1.0, life + 0.05, ROYAL, rim, rel, 0, 3.0, 1, 0, 0, 0, FI);
      mesh(fx, 'ring', P.x, P.z, 0.55, life + 0.05, GLARE, rim, rel, 0, 3.0, 1, 0, 0.6, 0, 1);
      mesh(fx, 'arc', P.x, P.z, 1.2, life, ROYAL, rim, rel, 0, 0.05, 1, TAU, 0.85, 1, 0.5);
    }
  },

  onCast(e, fx, _ctx: MoveCtx) {
    if (!fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    const yaw = aimYaw(P.x, P.z, e.x, e.y, 0);
    const cx = Math.cos(yaw);
    const cz = -Math.sin(yaw);
    if (e.src >= 0 && e.src < CAPS.heroes) {
      lastSlot[e.src] = e.slot;
      lastCastAt[e.src] = clock;
    }
    switch (e.slot) {
      case 0: {
        const a = fx.abil(e.src, 'q');
        mesh(fx, 'crescent', P.x, P.z, 1.6, 0.26, FUR, rim, rel, yaw, 0.08, 1, 1.6, 0.4, 1, FI);
        furPuff(fx, P.x + cx * 0.8, P.z + cz * 0.8, 0.8, rim, rel);
        let b: Puff | null = null;
        for (const c of PUFFS) if (!c.on) b = c;
        if (!b) b = PUFFS[0];
        b.on = true;
        b.owner = e.src;
        b.x0 = P.x;
        b.z0 = P.z;
        b.dx = cx;
        b.dz = cz;
        b.d = 0;
        b.max = (a.range ?? 7500) / 1000;
        b.speed = (a.speed ?? 9000) / 1000;
        b.w = (a.width ?? 1400) / 1000;
        b.nextStrip = 0;
        b.rel = rel;
        b.rim = rim;
        b.nextBall = 0;
        b.age = 0;
        b.tuft = TUFT[(funRand(e.tick, e.src, 0) * TUFT.length) | 0];
        b.k = funRank(fx, e.src, 0);
        b.nextHum = 0;
        b.crown = 0;
        // identity: the projectile sparkle and a crowned puff of plum fluff off her paw
        identity(fx, e.src, 'q', P.x + cx * 0.8, 0.3, P.z + cz * 0.8, 6, cx, cz);
        return;
      }
      case 1: {
        // the glare: the exact cone for a blink, then a slower purple rim
        const a = fx.abil(e.src, 'w');
        const range = (a.range ?? 5000) / 1000;
        const arc = ((a.arc ?? 910) / 4096) * TAU;
        mesh(fx, 'arc', P.x, P.z, range, 0.2, GLARE, rim, rel, yaw, 0.09, 1, arc, 0.1, 1, 0.95);
        mesh(fx, 'crescent', P.x, P.z, range, 0.4, GLARE, rim, rel, yaw, 0.1, 1, arc, 0.55, 1, 0.85);
        mesh(fx, 'arc', P.x, P.z, range, 0.45, ROYAL, rim, rel, yaw, 0.06, 1, arc, Math.max(0.85, 1 - 0.25 / range), 1, FI);
        if (rel === 'own') fx.cam.tier(1);
        // the fun layer: a disdainful huff of fur off her nose, a hiss; "HMPH!" waits for the first hero it slows
        if (fx.bonePos(e.src, 'mouth', V)) stickerBurst(fx, V.x + cx * 0.2, V.y, V.z + cz * 0.2, 'HAIRBALL', TUFT[0], 0.16, 0.4, 3, 1.2, 0.8, -2, funRand(e.tick, e.src, 1));
        hmph.arm(e.src, clock);
        // identity: the shadow implode mid-cone, and a crown point at each edge of the glare
        identity(fx, e.src, 'w', P.x + cx * range * 0.55, 0.2, P.z + cz * range * 0.55, 2, cx, cz);
        for (let s = -1; s <= 1; s += 2) {
          const ea = yaw + s * arc * 0.5;
          identity(fx, e.src, 'w', P.x + Math.cos(ea) * range * 0.9, 0.1, P.z - Math.sin(ea) * range * 0.9, 4, 0, 0, false);
        }
        return;
      }
      case 2: {
        // the fur cloud where she took off, at the sim radius for the cloud's life
        const a = fx.abil(e.src, 'e');
        let c: Cloud | null = null;
        for (const k of CLOUDS) if (!k.on) c = k;
        if (!c) c = CLOUDS[0];
        c.on = true;
        c.x = P.x;
        c.z = P.z;
        c.rad = (a.radius ?? 2200) / 1000;
        c.life = (a.ttl ?? 75) * TICK_S;
        c.every = Math.max(1, a.every ?? 15) * TICK_S;
        c.t = 0;
        c.next = 0;
        c.rel = rel;
        c.tick = e.tick;
        c.src = e.src;
        // shed fur, not a telegraph: an own or allied cloud keeps a fur-coloured edge (the gold "you" rim made it
        // read as a generic gold ring); an enemy cloud keeps the danger rim
        c.rim = rel === 'enemy' ? rim : FLUFF;
        // a soft fluffy disc filling the radius (a glow card is soft-edged, so it is drawn a little wider), lumps of
        // fur on it refreshed by the pulses (update), and only a faint edge at the exact radius
        mesh(fx, 'glow', c.x, c.z, c.rad * 1.2, c.life, FLUFF, c.rim, rel, 0, 0.07, 1, 0, 0, 0, 2.2);
        mesh(fx, 'arc', c.x, c.z, c.rad, c.life, FUR, c.rim, rel, yaw, 0.05, 1, TAU, Math.max(0.94, 1 - 0.08 / c.rad), 1, 0.25);
        furPuff(fx, c.x, c.z, 1.4, c.rim, rel, 0.5);
        // identity: the velvet glide trail with a crown and gold-flecked fluff off the cushion
        identity(fx, e.src, 'e', c.x, 0.2, c.z, 7, cx, cz);
        return;
      }
      default: {
        const a = fx.abil(e.src, 'r');
        crownWave(fx, P.x, P.z, (a.radius ?? 6000) / 1000, yaw, rim, rel);
        mesh(fx, 'glow', P.x, P.z, 1.6, 0.3, GLARE, rim, rel, 0, 1.4, 1, 0, 0, 0, FI);
        if (rel === 'own') fx.cam.tier(2);
        decreeFun(fx, e.src, e.tick, yaw);
        // identity: the decree's sonic ripples and two crowns ringing out over plum fluff
        identity(fx, e.src, 'r', P.x, 0.5, P.z, 10);
        return;
      }
    }
  },

  onHit(e, fx, _ctx: MoveCtx) {
    if (!fx.heroPos(e.dst, V)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (e.kind === 'basic') {
      furPuff(fx, V.x, V.z, 0.6, rim, rel);
      return;
    }
    if (e.kind !== 'ability') return;
    if (e.dst >= 0 && e.dst < CAPS.heroes) {
      hitAt[e.dst] = clock;
      hitRim[e.dst] = rim;
      hitRel[e.dst] = rel;
      hitSrc[e.dst] = e.src;
    }
    const src = e.src >= 0 && e.src < CAPS.heroes ? e.src : -1;
    const slot = src >= 0 && clock - lastCastAt[src] < 1.5 ? lastSlot[src] : -1;
    if (slot === 1 && e.dst < CAPS.heroes) {
      // Not Amused landed: a sweat drop over the slowed hero, and her "HMPH!" once per cast
      const hy = s3HeadY(fx, e.dst, 0.3);
      sticker(fx, V.x + 0.45, hy, V.z, 'SWEAT', SWEAT, 0.45, 0.9, -0.5);
      if (hmph.take(src, clock, 0.8) && fx.heroPos(src, P)) funPop(fx, src, 'HMPH!', P.x, s3HeadY(fx, src, 0.7), P.z);
    } else if (slot === 3 && e.dst < CAPS.heroes && begone.take(src, clock, 0.6)) {
      // the decree's first hero: "BEGONE!" (her ult's name) and a puff of royal confetti
      const hy = s3HeadY(fx, e.dst, 0.5);
      funPop(fx, src, 'BEGONE!', V.x, hy + 0.3, V.z);
      stickerBurst(fx, V.x, hy, V.z, 'CONFETTI', JEWEL, 0.18, 0.7, 6, 2.2, 2.4, -6, funRand(e.tick, src, 3));
    }
    // the fluffball's fur burst on whatever it rolls through (a live ball of hers near the victim)
    for (const b of PUFFS) {
      if (!b.on || b.owner !== e.src) continue;
      const bx = b.x0 + b.dx * b.d;
      const bz = b.z0 + b.dz * b.d;
      if (Math.hypot(V.x - bx, V.z - bz) > b.w + 1.2) continue;
      furPuff(fx, V.x, V.z, 1, rim, rel);
      // the fun layer: the victim gets a coat of her fur (and a "PFFT!" on a big hit)
      const cy = s3HeadY(fx, e.dst, -0.4);
      stickerBurst(fx, V.x, cy, V.z, 'HAIRBALL', b.tuft, 0.24 * b.k, 0.6, 6, 2.4, 2, -5, funRand(e.tick, e.dst, 2));
      if (funBigHit(fx, e.dst, e.amount)) funPop(fx, e.src, 'PFFT!', V.x, cy + 1, V.z);
      return;
    }
  },

  onStatus(id, gained, _lost, fx) {
    if ((gained & STUNNED) === 0 || id < 0 || id >= CAPS.heroes) return;
    if (clock - hitAt[id] > SNUB_WINDOW) return;
    hitAt[id] = -9;
    snub(fx, id);
  },

  onMarker(id, _clip, marker, fx) {
    if (marker.charCodeAt(0) !== 100 || marker.charCodeAt(1) !== 58) return; // only the clips' 'd:' fx cues
    if (!fx.heroPos(id, P)) return;
    const rel = fx.relation(id);
    const rim = fx.rim(id);
    switch (marker) {
      case 'd:puff':
        if (fx.bonePos(id, 'pawR', V)) mesh(fx, 'glow', V.x, V.z, 0.5, 0.2, FUR, rim, rel, 0, V.y, 1, 0, 0, 0, FI);
        return;
      case 'd:fur':
        furPuff(fx, P.x, P.z, 1, rim, rel, 0.4);
        return;
      case 'd:crown':
        mesh(fx, 'ring', P.x, P.z, 0.5, 0.4, GLARE, rim, rel, 0, 3.0, 1, 0, 0.6, 0, 1);
        return;
      case 'd:hmph':
        // the huff off her nose at the end of the glare (moves/duchess.ts w)
        if (fx.bonePos(id, 'mouth', V)) sticker(fx, V.x, V.y + 0.1, V.z, 'HAIRBALL', TUFT[0], 0.3, 0.45, 0.9, 2);
        return;
      default:
        return;
    }
  },

  update(dt, fx) {
    clock += dt;
    for (const b of PUFFS) {
      if (!b.on) continue;
      b.d += b.speed * dt;
      b.age += dt;
      // the projectile travel whoosh under the ball (identity mix: travel layer, closest four)
      if (b.age >= b.nextHum && b.d < b.max) {
        b.nextHum = b.age + HUM_EVERY;
        SAT.x = b.x0 + b.dx * b.d;
        SAT.z = b.z0 + b.dz * b.d;
        playSkillSfx('duchess', 'q', 'travel', { at: SAT, relation: MIXREL[b.rel] });
      }
      if (b.d >= b.max) {
        b.on = false;
        // the hairball lands with a soft poof
        sticker(fx, b.x0 + b.dx * b.max, 0.6, b.z0 + b.dz * b.max, 'PUFF', b.tuft, 0.7 * b.k, 0.3, 0.6);
        continue;
      }
      // the fun layer: a hairball sticker riding the bolt, growing as it rolls, and tufts shed behind it
      if (b.age >= b.nextBall) {
        b.nextBall = b.age + (fx.tier === 'low' ? BALL_EVERY * 2 : BALL_EVERY);
        const g = b.d / b.max;
        const bx = b.x0 + b.dx * b.d;
        const bz = b.z0 + b.dz * b.d;
        sticker(fx, bx, 0.9, bz, 'HAIRBALL', b.tuft, (0.62 + 0.5 * g) * b.k, fx.tier === 'low' ? 0.16 : 0.1, 0, 5, b.d * 1.7);
        // identity: the crown riding on top of the fluffball (every other re-lay; it lives two)
        if ((b.crown ^= 1) === 1) identity(fx, b.owner, 'q', bx, 0.55 + 0.25 * g * b.k, bz, 4, 0, 0, false);
        if (((b.nextBall * 50) | 0) % 2 === 0) sticker(fx, bx - b.dx * 0.5, 0.75, bz - b.dz * 0.5, 'HAIRBALL', TUFT[0], 0.2, 0.45, -0.9, 3, b.d);
      }
      // the ground strip of the skillshot width under the ball (the dodge width from the iso camera)
      while (b.nextStrip + STRIP_M <= b.d) {
        mesh(fx, 'beam', b.x0 + b.dx * b.nextStrip, b.z0 + b.dz * b.nextStrip, STRIP_M, fx.tier === 'low' ? 0.14 : 0.22, FUR, b.rim, b.rel, Math.atan2(-b.dz, b.dx), 0.06, 1, 0, 0, 0, 0.45, 0, b.w);
        b.nextStrip += STRIP_M;
      }
    }
    for (const c of CLOUDS) {
      if (!c.on) continue;
      c.t += dt;
      // the cloud's slow pulses from its own clock (the burst zone pulses every `every` from the cast)
      while (c.t >= c.next * c.every && c.next * c.every < c.life) {
        if (c.next > 0) mesh(fx, 'ring', c.x, c.z, c.rad * 0.85, 0.3, FUR, c.rim, c.rel, 0, 0.07, 1, 0, 0.5, 0, 0.3);
        // fur lumps on the cloud (Low: one a pulse, it has 4 glow slots), each living past the next pulse
        // the fun layer: seeded tufts of fur float up off the cloud (the variant colour and spot from the cast tick)
        for (let i = 0, m = funCount(fx, 2); i < m; i++) {
          const r1 = funRand(c.tick, c.src, 10 + c.next * 4 + i);
          const r2 = funRand(c.tick, c.src, 50 + c.next * 4 + i);
          const a = r1 * TAU;
          const d = (0.2 + 0.6 * r2) * c.rad;
          sticker(fx, c.x + Math.cos(a) * d, 0.35 + 0.4 * r2, c.z - Math.sin(a) * d, 'HAIRBALL', TUFT[(r2 * TUFT.length) | 0], 0.22 + 0.16 * r1, 1.1, 0.55, 1.2, a);
        }
        const n = fx.tier === 'low' ? 1 : 3;
        for (let i = 0; i < n; i++) {
          const k = (c.next * 3 + i) % LUMP_A.length;
          const d = LUMP_R[k] * c.rad;
          mesh(fx, 'glow', c.x + Math.cos(LUMP_A[k]) * d, c.z - Math.sin(LUMP_A[k]) * d, c.rad * 0.6, Math.min(c.every * 1.5, c.life - c.t + 0.05), FLUFF, c.rim, c.rel, 0, 0.2 + 0.1 * i, 1, 0, 0, 0, 2);
        }
        c.next++;
      }
      if (c.t >= c.life) c.on = false;
    }
    // Royal Decree's crown over her head through the windup (re-laid on the head bone: it rides her rise)
    for (let id = 0; id < CAPS.heroes; id++) {
      if (crownUntil[id] <= clock || clock < crownNext[id]) continue;
      crownNext[id] = clock + 0.08;
      if (!fx.heroPos(id, P)) continue;
      const k = crownK[id];
      s3Crown(fx, P.x, s3HeadY(fx, id, 1.05 + 0.15 * k), P.z, 0.95 * k, 0.11, 0, CROWN, JEWEL);
    }
  },
};

/** Tests: how many fluffballs and fur clouds are live, and Snubs drawn so far. */
export function duchessFxLive(): { puffs: number; clouds: number; snubs: number } {
  let puffs = 0;
  let clouds = 0;
  for (const b of PUFFS) if (b.on) puffs++;
  for (const c of CLOUDS) if (c.on) clouds++;
  return { puffs, clouds, snubs };
}

/** Tests: drop every live fluffball and cloud (module state). */
export function resetDuchessFx(): void {
  for (const b of PUFFS) b.on = false;
  for (const c of CLOUDS) c.on = false;
  hitAt.fill(-9);
  lastSlot.fill(-1);
  lastCastAt.fill(-9);
  hmph.reset();
  begone.reset();
  crownUntil.fill(0);
  clock = 0;
  snubs = 0;
}
