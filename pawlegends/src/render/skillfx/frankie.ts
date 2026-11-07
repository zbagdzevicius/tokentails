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
 * Pooled, no allocation per event or per frame. Render only.
 */
import { PROJECTILE_KIND } from '../../data/towers';
import { BuffFlag } from '../../sim/api';
import type { SkillFxSet } from '../anim/types';
import { SHAPE } from '../fx/Particles.js';
import { funHeroOf, funOverY, funPop, funSound, sticker } from '../fx/fun/funKit';
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

/**
 * One frame of the stretched body from (ax, az) to the tip (bx, bz): a row of opaque bun puffs with the sausage on top
 * each living two frames. Alpha stickers,
 * not ribbons: the ribbons are additive, and brown on grass vanished.
 */
function stretch(fx: Parameters<NonNullable<SkillFxSet['update']>>[1], ax: number, az: number, bx: number, bz: number): void {
  const l = Math.hypot(bx - ax, bz - az);
  const n = Math.min(MAX_PUFFS, Math.max(1, Math.round(l / STEP)));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    sticker(fx, x, 0.5, z, 'PUFF', BUN, 0.95, 0.06);
    sticker(fx, x, 0.68, z, 'SOFT', SAUSAGE, 0.6, 0.06);
  }
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
        funSound('frankieYip', P, 1, 0.45);
        return;
      case 1:
        if (ok(e.src)) {
          DIG_T[e.src] = 2.0;
          DIG_N[e.src] = 0;
        }
        shower(fx, P.x, 0.2, P.z, 10, SHAPE.PUFF, DIRT, 0.32, 0.5, 2.4, 1.6, 6, vary());
        return;
      case 2:
        shower(fx, P.x, 0.5, P.z, 8, SHAPE.PUFF, CRUMB, 0.18, 0.5, 2.0, 1.8, 6, vary());
        return;
      default:
        funSound('frankieStretch', P, 1, 0.55);
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
    funSound('frankieDig', P, 1, 0.6);
    funPop(fx, id, 'POP!', P.x, funOverY(fx, id, 0.3), P.z);
  },

  onMarker(id, _clip, marker, fx) {
    if (!marker.startsWith('fr:') || !fx.heroPos(id, P)) return;
    if (marker === 'fr:hop') shower(fx, P.x, 0.4, P.z, 5, SHAPE.PUFF, CRUMB, 0.14, 0.4, 1.4, 1.2, 6, vary());
  },

  onClip(id, what, fx) {
    if (what !== 'footlong' || !ok(id) || !fx.heroPos(id, P)) return;
    funSound('frankieSnap', P, 1, 0.6);
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
          stretch(fx, P.x, P.z, Q.x, Q.z);
        } else if (TIP_SEEN[id] || TIP_T[id] > 0.3) TIP[id] = -1;
      }
    }
  },
};
