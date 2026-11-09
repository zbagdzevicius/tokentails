/**
 * Frankie's skill FX (sim v15; build spec docs/plans/moba/DOGS-V15.md §1.2 "Moves and VFX"): ketchup, toast and dirt.
 *
 * - Passive Ketchup and Mustard: two of his hits on the same hero in the same tick (the Combo lands with the hit that
 *   completes it) pop a red ketchup splat and "COMBO!" on that hero. Never a gold-family colour on an enemy: the
 *   mustard is his hero colour, not an effect colour (combat-vfx.test).
 * - Q Weenie Roll: grill marks scorched on the ground along the roll, dust and the yip.
 * - W Dig: a dirt spray on the dive; while he travels underground (untargetable, his body hidden by the dig form
 *   hold) a dirt mound with clods runs along under him; when he pops up (the untargetable edge) a ring at exactly the
 *   sim radius, dirt clods flying, the cork pop and "POP!".
 * - E Bun Hop: toasted crumbs off the bun on the take-off.
 * - R FOOTLONG! (signature): the stretched body is a row of opaque bun and sausage puffs, redrawn each frame from where
 *   he stands to the flying tip (his head look, projectileView), so no bone is ever scaled; the slide whistle and
 *   "FOOTLONG!"; on the grab (the `clip` event 'footlong') the snap and "SNAP!"; on a miss the stretch just fades back.
 *
 * Champion identity (CHAMP-IDENTITY.md §3, audio/champ/frankie.ts): every skill also draws its nature accent (Q and W
 * impact dust rings, E mobility puffs, R fire embers, the Combo's splash) and his motif, a ketchup-and-mustard zig-zag
 * squiggle: along the roll, out of the ground on the pop-up, under the bun hop, as stripes down the FOOTLONG stretch,
 * crossed into an X on a Combo. On an enemy the mustard is a pale glint. Sounds: the framework plays the nature layer
 * with his slide-whistle motif (R: the stretch ult voice); the cork pop (Dig), the snap (FOOTLONG grab) and the Combo
 * squirt are his champion impact sounds, so this script no longer plays the yip or the stretch on the cast.
 *
 * Pooled, no allocation per event or per frame. Render only.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BuffFlag } from '../../sim/api';
import { CHAMP_AUDIO } from '../../audio/champ';
import type { MotifPainter } from '../../audio/champ/types';
import { playSkillSfx } from '../../audio/skillSfx';
import { IDENTITY, type SkillKey } from '../../data/identity';
import { NATURE_FX } from '../fx/natureFx';
import type { FxCtx, SkillFxSet } from '../anim/types';
import { FADE, SHAPE } from '../fx/Particles.js';
import { funCount, funHeroOf, funOverY, funPool, funPop, sticker } from '../fx/fun/funKit';
import { shower, throwSticker } from '../fx/fun/skills2Fun';
import { F, P, Q, aimDir, faceOf, mesh, vary, yawOf } from './dogFx';

const KETCHUP = 0xe8302a;
const BUN = 0xd99a4e;
const SAUSAGE = 0xb4562a;
const DIRT = 0x8a5a34;
const CRUMB = 0xf2cc8a;

/** Per caster: the dig (seconds left as a failsafe, the next mound), the roll and the FOOTLONG tip (a projectile index). */
const DIG_T = new Float32Array(16);
const DIG_N = new Float32Array(16);
const ROLL_T = new Float32Array(16);
const ROLL_N = new Float32Array(16);
const TIP = new Int16Array(16).fill(-1);
/** Seconds since the FOOTLONG shot was seen, and whether it has been drawn yet (the drawn frame lags the snapshot). */
const TIP_T = new Float32Array(16);
const TIP_SEEN = new Uint8Array(16);
/** The stretch's spacing (m) between its bun and sausage puffs, and the most puffs a frame draws per stretch. */
const STEP = 0.42;
const MAX_PUFFS = 28;
/** The last hit per caster (tick, target), for the Combo. */
const HIT_TICK = new Int32Array(16).fill(-1);
const HIT_DST = new Int16Array(16).fill(-1);
const ok = (id: number): boolean => id >= 0 && id < 16;

// ------------------------------------------------------------------------------------------------ champion identity

type Pool = Pick<MotifPainter, 'burst' | 'single' | 'ring'>;
let pool: Pool | null = null;
const SH = SHAPE as unknown as Readonly<Record<string, number>>;
/** The fun sticker pool as the champion motif painter (audio/champ/frankie.ts paintFrankie draws through it). */
const PAINTER: MotifPainter = {
  burst: (pos, o) => pool?.burst(pos, o),
  single: (pos, o) => pool?.single(pos, o),
  ring: (pos, o) => pool?.ring(pos, o),
  shape: SH,
  colors: { primary: IDENTITY.frankie.colors.primary, secondary: IDENTITY.frankie.colors.secondary },
};
/** The colour pair on an enemy: a gold-family colour mixed 70 percent toward white (never the gold "you" family). */
const ENEMY_PRIMARY = 0xf8e7bc;
const ENEMY_SECONDARY = IDENTITY.frankie.colors.secondary;
const IAT = { x: 0, y: 0, z: 0 };
const IDIR = { x: 0, z: 0 };
const IDIR3 = { x: 0, y: 0, z: 0 };
const NB = { n: 1, exact: true, shape: 0, color: 0, additive: false, intensity: 1, size: [0.1, 0.2] as readonly number[], life: [0.3, 0.5] as readonly number[], speed: [1, 2] as readonly number[], gravity: 0, up: 0, dir: undefined as typeof IDIR3 | undefined, spread: Math.PI, stretch: 1, drag: 1, flat: false, fade: 0 as number, r0: 0.5, sizeEnd: 1 };
const NS = { shape: 0, color: 0, size0: 0.4, size1: 1.6, life: 0.3, alpha: 0.7, intensity: 1.4, additive: true };

/** The skill's nature accent at IAT (NATURE_FX: its shape, colour and motion), about half a cast's worth of particles. */
function natureAccent(fx: FxCtx, skill: SkillKey, has: boolean): void {
  const s = NATURE_FX[IDENTITY.frankie.skills[skill].nature];
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
 * Champion identity (CHAMP-IDENTITY.md §1–§3): the skill's nature accent and Frankie's squiggle motif in the colour pair at
 * (x, y, z) for caster `src`, `n` motif particles (the tier halves it), along (dx, dz) when given. `nature` false: the motif alone. A
 * no-op without the fun pool (unit stubs).
 */
function identity(fx: FxCtx, src: number, skill: SkillKey, x: number, y: number, z: number, n: number, dx = 0, dz = 0, nature = true): void {
  const p = funPool(fx) as unknown as Partial<Pool> | null;
  if (!p || typeof p.burst !== 'function') return;
  pool = p as Pool;
  // gold stays "you": on an enemy the gold-family half of the pair is drawn as a pale glint (skins trimForTeam)
  const foe = fx.relation(src) === 'enemy';
  PAINTER.colors.primary = foe ? ENEMY_PRIMARY : IDENTITY.frankie.colors.primary;
  PAINTER.colors.secondary = foe ? ENEMY_SECONDARY : IDENTITY.frankie.colors.secondary;
  const has = dx !== 0 || dz !== 0;
  IAT.x = x;
  IAT.y = y;
  IAT.z = z;
  IDIR.x = IDIR3.x = dx;
  IDIR.z = IDIR3.z = dz;
  if (nature) natureAccent(fx, skill, has);
  CHAMP_AUDIO.frankie.fx?.paint?.(PAINTER, IAT, funCount(fx, n), has ? IDIR : null, skill);
}

/** The identity mix relation of a Relation3. */
const MIXREL = { own: 'mine', ally: 'ally', enemy: 'enemy' } as const;
/** Stretch stripe colours: ketchup, and the mustard (a pale glint on an enemy). */
const MUSTARD = IDENTITY.frankie.colors.primary;

/**
 * One frame of the stretched body from (ax, az) to the tip (bx, bz): a row of opaque bun puffs with the sausage on top
 * each living two frames. Alpha stickers,
 * not ribbons: the ribbons are additive, and brown on grass vanished.
 */
function stretch(fx: Parameters<NonNullable<SkillFxSet['update']>>[1], ax: number, az: number, bx: number, bz: number, foe: boolean): void {
  const l = Math.hypot(bx - ax, bz - az);
  const n = Math.min(MAX_PUFFS, Math.max(1, Math.round(l / STEP)));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    sticker(fx, x, 0.5, z, 'PUFF', BUN, 0.95, 0.06);
    sticker(fx, x, 0.68, z, 'SOFT', SAUSAGE, 0.6, 0.06);
    // identity: ketchup and mustard stripes down the sausage
    if (k % 3 === 1) sticker(fx, x, 0.86, z, 'SOFT', (k / 3) & 1 ? KETCHUP : foe ? ENEMY_PRIMARY : MUSTARD, 0.24, 0.06);
  }
  // the sizzle: one ember rising off the stretch each frame
  const t = vary();
  sticker(fx, ax + (bx - ax) * t, 0.9, az + (bz - az) * t, 'SPARK', 0xff8a3a, 0.16, 0.35, 1.4);
}

export const SKILL_FX: SkillFxSet = {
  hero: 'frankie',
  stub: false,
  owns: { q: true, w: true, e: true, r: true, basic: true, passive: true },

  onCast(e, fx) {
    if (e.slot > 3 || !fx.heroPos(e.src, P)) return;
    const rel = fx.relation(e.src);
    const rim = fx.rim(e.src);
    if (!aimDir(e.x, e.y)) faceOf(fx, e.src);
    switch (e.slot) {
      case 0:
        if (ok(e.src)) {
          ROLL_T[e.src] = 0.34;
          ROLL_N[e.src] = 0;
        }
        // identity: the impact dust ring and a squiggle off the roll
        identity(fx, e.src, 'q', P.x, 0.2, P.z, 6, F.x, F.z);
        return;
      case 1:
        if (ok(e.src)) {
          DIG_T[e.src] = 2.0;
          DIG_N[e.src] = 0;
        }
        shower(fx, P.x, 0.2, P.z, 10, SHAPE.PUFF, DIRT, 0.32, 0.5, 2.4, 1.6, 6, vary());
        // identity: the dive's dust ring and a mustard squiggle where he goes under
        identity(fx, e.src, 'w', P.x, 0.1, P.z, 4, F.x, F.z);
        return;
      case 2:
        shower(fx, P.x, 0.5, P.z, 8, SHAPE.PUFF, CRUMB, 0.18, 0.5, 2.0, 1.8, 6, vary());
        // identity: mobility puffs and the zig-zag under the hop
        identity(fx, e.src, 'e', P.x, 0.3, P.z, 6, F.x, F.z);
        return;
      default:
        // identity: fire embers and a squiggle off the stretch (the slide whistle is his ult voice)
        identity(fx, e.src, 'r', P.x, 0.4, P.z, 6, F.x, F.z);
        funPop(fx, e.src, 'FOOTLONG!', P.x, funOverY(fx, e.src, 0.4), P.z);
        mesh(fx, 'beam', P.x, P.z, (fx.abil(e.src, 'r').range ?? 9000) / 1000, 0.3, SAUSAGE, rim, rel, { yaw: yawOf(F.x, F.z), sz: 0.6, p3: 0.35 });
    }
  },

  onProjectile(owner, kind, slot, fx, index) {
    if (kind !== PROJECTILE_KIND.fluff || slot !== 3 || index === undefined || !ok(owner)) return;
    if (funHeroOf(fx, owner) !== 'frankie') return;
    // the stretched body: drawn each frame from where he stands to the flying tip (update)
    TIP[owner] = index;
    TIP_T[owner] = 0;
    TIP_SEEN[owner] = 0;
  },

  onHit(e, fx) {
    if (!ok(e.src) || !fx.heroPos(e.dst, Q)) return;
    const combo = HIT_TICK[e.src] === e.tick && HIT_DST[e.src] === e.dst;
    HIT_TICK[e.src] = e.tick;
    HIT_DST[e.src] = e.dst;
    if (e.kind === 'basic') shower(fx, Q.x, 0.9, Q.z, 3, SHAPE.SPARK, 0xffffff, 0.16, 0.2, 1.6, 0.6, 0, vary(), true);
    if (combo && funHeroOf(fx, e.dst) !== null) {
      // Ketchup and Mustard: the Combo splat on the hero
      const y = funOverY(fx, e.dst, -0.6);
      sticker(fx, Q.x, y, Q.z, 'PUFF', KETCHUP, 0.7, 0.45);
      shower(fx, Q.x, y, Q.z, 8, SHAPE.DROPLET, KETCHUP, 0.18, 0.5, 2.4, 1.6, 6, vary());
      funPop(fx, e.src, 'COMBO!', Q.x, y + 0.7, Q.z);
      // identity: the splash and the two squiggles crossed into an X, and the Combo squirt
      identity(fx, e.src, 'passive', Q.x, y - 0.6, Q.z, 8);
      playSkillSfx('frankie', 'passive', 'impact', { at: Q, relation: MIXREL[fx.relation(e.src)] });
    }
  },

  onStatus(id, _gained, lost, fx) {
    // the pop out of the ground: the untargetable edge after a dig
    if (!ok(id) || DIG_T[id] <= 0 || (lost & BuffFlag.Untargetable) === 0 || !fx.heroPos(id, P)) return;
    DIG_T[id] = 0;
    const a = fx.abil(id, 'w');
    const rad = (a.radius ?? 1800) / 1000;
    mesh(fx, 'ring', P.x, P.z, rad, 0.35, DIRT, fx.rim(id), fx.relation(id), { p1: 0.75 });
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + vary();
      throwSticker(fx, P.x, 0.3, P.z, Math.cos(ang) * 3, 4.5, Math.sin(ang) * 3, SHAPE.PUFF, DIRT, 0.3, 0.7, 12, 0, 0, false, 0.1);
    }
    // the pop: his W impact (thud + cork pop) and a squiggle of mustard he bursts out of
    playSkillSfx('frankie', 'w', 'impact', { at: P, relation: MIXREL[fx.relation(id)] });
    identity(fx, id, 'w', P.x, 0.1, P.z, 8);
    funPop(fx, id, 'POP!', P.x, funOverY(fx, id, 0.3), P.z);
  },

  onMarker(id, _clip, marker, fx) {
    if (!marker.startsWith('fr:') || !fx.heroPos(id, P)) return;
    if (marker === 'fr:hop') {
      shower(fx, P.x, 0.4, P.z, 5, SHAPE.PUFF, CRUMB, 0.14, 0.4, 1.4, 1.2, 6, vary());
      faceOf(fx, id);
      identity(fx, id, 'e', P.x, -0.2, P.z, 4, F.x, F.z, false);
    }
  },

  onClip(id, what, fx) {
    if (what !== 'footlong' || !ok(id) || !fx.heroPos(id, P)) return;
    // the grab: his R impact (fire + the snap)
    playSkillSfx('frankie', 'r', 'impact', { at: P, relation: MIXREL[fx.relation(id)] });
    funPop(fx, id, 'SNAP!', P.x, funOverY(fx, id, 0.4), P.z);
    if (fx.relation(id) === 'own' && !fx.reduced) fx.cam.punch(0.04);
  },

  update(dt, fx) {
    for (let id = 0; id < 16; id++) {
      if (ROLL_T[id] > 0) {
        ROLL_T[id] -= dt;
        ROLL_N[id] -= dt;
        if (ROLL_N[id] <= 0 && fx.heroPos(id, P)) {
          // grill marks along the roll
          ROLL_N[id] = 0.06;
          faceOf(fx, id);
          fx.linger.add('scratches', P.x, P.z, 0.7, yawOf(F.x, F.z), 0x3a2418);
          shower(fx, P.x, 0.15, P.z, 2, SHAPE.PUFF, 0xe8dcc8, 0.25, 0.35, 1.2, 0.5, 2, vary());
          // identity: the ketchup-mustard spiral trail behind the roll
          identity(fx, id, 'q', P.x, -0.3, P.z, 2, F.x, F.z, false);
        }
      }
      if (DIG_T[id] > 0) {
        DIG_T[id] -= dt;
        DIG_N[id] -= dt;
        if (DIG_N[id] <= 0 && fx.heroPos(id, P)) {
          // the dirt mound running along under him, clods kicked up, the tail tip wagging out of it
          DIG_N[id] = 0.08;
          mesh(fx, 'dome', P.x, P.z, 0.55, 0.3, DIRT, fx.rim(id), fx.relation(id), { sy: 0.35, p3: 1.0 });
          throwSticker(fx, P.x, 0.2, P.z, (vary() - 0.5) * 2, 2.5, (vary() - 0.5) * 2, SHAPE.PUFF, DIRT, 0.2, 0.4, 12, 0, 0, false, 0.05);
          if (vary() < 0.4) sticker(fx, P.x - 0.3, 0.45, P.z, 'SOFT', SAUSAGE, 0.18, 0.12);
        }
      }
      if (TIP[id] >= 0) {
        TIP_T[id] += dt;
        if (fx.projPos?.(TIP[id], Q) && fx.heroPos(id, P)) {
          TIP_SEEN[id] = 1;
          stretch(fx, P.x, P.z, Q.x, Q.z, fx.relation(id) === 'enemy');
        } else if (TIP_SEEN[id] || TIP_T[id] > 0.3) TIP[id] = -1;
      }
    }
  },
};
