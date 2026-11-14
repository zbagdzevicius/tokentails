/**
 * Champ (sim v29, original dog; build spec docs/plans/moba/ROSTER-V29.md §2.4 "Render"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw) read the constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The silhouette is "the one with the gloves": a fawn boxer dog with a black mask, a square jaw and an underbite, in a
 * boxing guard with two HUGE red gloves up in front of his face (the read from every angle: nobody else carries two
 * big balls at head height), a team boxing robe (the mantle and a short cape) and a gold title belt round his waist.
 * The gloves are never team-coloured: boxing red with white cuffs.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { C, dogEyes, dogNose, faceLine, mixC, smooth } from './dogParts';

/** His poses: the boxing guard (gloves up beside the chin, elbows in, a slight bounce stance). */
export const POSES: Record<string, PoseDef> = {
  boxGuard: {
    joints: { hips: [0.06, 0, 0], chest: [0.08, 0.1, 0], head: [0.04, -0.08, 0], thighL: [-0.12, 0.08, 0.12], thighR: [0.06, -0.08, -0.12], kneeL: [0.2, 0, 0], kneeR: [0.16, 0, 0], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    arms: {
      L: { paw: [0.11, 0.5, 0.22], pole: [1, -0.6, -0.3], twist: [0, 0, -0.3] },
      R: { paw: [-0.11, 0.47, 0.25], pole: [-1, -0.6, -0.3], twist: [0, 0, 0.3] },
    },
    sword: { mode: 'hidden' },
  },
};

/** Idle and run in the guard; cast 'cheer' (gloves raised: the champ), attack 'bash' (a straight jab). */
export const MOTION: MotionProfile = { idle: 'boxGuard', run: 'boxGuard', cast: 'cheer', attack: 'bash', stride: 1.15 };
export const HEIGHT = 2.7;
/** Top of the bind-pose bounds (m: the ear tips), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.84;
export const RING = HERO_BUILD.champ.ring;
export const COLOR_CSS = '#e8463a';
/** A short stub tail that wags fast and small cropped ears. */
export const SPRINGS: SpringTuning = { tail: { k: 300, c: 12, lag: 0.1 }, ears: { k: 220, c: 14, lag: 0 } };
export const ULT_NAME = 'KNOCKOUT!';
/** Cast accent (combat-vfx.test: no gold-family colour): glove red. */
export const ACCENT: number | null = 0xff4a3a;

const COAT: CoatSpec = { pattern: 'solid', base: 0xc88a50, deep: 0x8e5a2c, light: 0xfff4e6, cream: 0xfff4e6 };
const MASK = 0x2a1c1a;
const GLOVE = 0xe8322a;
const CUFF = 0xffffff;
const BELT_GOLD = 0xf7bc3c;

/** The boxer head: a square fawn skull, a short broad black muzzle with an underbite, a white blaze, small ears. */
function boxerHead(A: Assembly, coat: CoatSpec): void {
  const fawn = C(coat.base as number);
  const deep = C(coat.deep as number);
  const white = C(coat.cream as number);
  const mask = C(MASK);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    const c = mixC(fawn, deep, smooth(0.0, -0.13, lp.z) * 0.35);
    const blaze = smooth(0.03, 0.016, Math.abs(lp.x)) * smooth(0.05, 0.1, lp.z) * smooth(0.3, 0.2, lp.y);
    return mixC(c, white, blaze);
  };
  A.add('head', new THREE.SphereGeometry(0.152, A.seg(20, 10), A.seg(14, 8)).scale(1.16, 0.95, 1.0).translate(0, 0.17, 0), { color: skin });
  // the short broad black muzzle and the underbite jaw, a white chin
  A.add('head', new THREE.SphereGeometry(0.08, A.seg(12, 7), A.seg(9, 5)).scale(1.15, 0.78, 0.85).translate(0, 0.118, 0.13), { color: mask });
  A.add('head', new THREE.SphereGeometry(0.06, A.seg(10, 6), A.seg(7, 4)).scale(1.2, 0.55, 0.9).translate(0, 0.07, 0.135), { color: (_v, _n, lp) => mixC(mask, white, smooth(0.0, -0.03, lp.y) * 0.6) });
  // two little bottom teeth
  for (const s of [1, -1]) A.add('head', new THREE.ConeGeometry(0.009, 0.02, 4), { m: mat([s * 0.025, 0.098, 0.192]), color: 0xffffff });
  dogNose(A, [0, 0.146, 0.2], 0.026);
  faceLine(A, [[-0.045, 0.235, 0.12], [-0.02, 0.228, 0.135]], 0.006, MASK);
  faceLine(A, [[0.045, 0.235, 0.12], [0.02, 0.228, 0.135]], 0.006, MASK);
  dogEyes(A, { inner: 0x8a5a2a, outer: 0x3a2010, ring: 0x140c0a }, { x: 0.07, y: 0.198, z: 0.122, r: 0.043 });
  // folded ears: small soft triangles that flop forward over the brow (never round: round ears read as a bear)
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    A.add(`ear${s}`, new THREE.ConeGeometry(0.06, 0.12, A.seg(8, 5), 1).scale(1, 1, 0.35), { m: mat([sign * 0.03, 0.02, 0.05], [1.25, 0, sign * 0.5]), color: (_v, _n, lp) => mixC(fawn, deep, smooth(-0.04, 0.05, lp.y) * 0.7) });
  }
  // the white muzzle stripe up the nose and the forehead wrinkles
  A.add('head', new THREE.SphereGeometry(0.03, A.seg(8, 5), A.seg(6, 4)).scale(0.7, 1.6, 0.5), { m: mat([0, 0.19, 0.145], [-0.5, 0, 0]), color: white });
  for (const y of [0.27, 0.29]) faceLine(A, [[-0.04, y, 0.11], [0, y + 0.006, 0.12], [0.04, y, 0.11]], 0.004, deep);
}

/** The boxing gloves: one big red glove on each paw with a white cuff and a thumb. */
function gloves(A: Assembly): void {
  for (const s of ['L', 'R'] as const) {
    const bone = s === 'L' ? 'pawL' : 'pawR';
    const sign = s === 'L' ? 1 : -1;
    A.add(bone, new THREE.SphereGeometry(0.1, A.seg(14, 8), A.seg(10, 6)).scale(0.95, 1.05, 1.1), { m: mat([0, -0.04, 0.02]), color: GLOVE });
    A.add(bone, new THREE.SphereGeometry(0.04, A.seg(8, 5), A.seg(6, 4)).scale(0.8, 1.2, 0.8), { m: mat([sign * 0.07, -0.01, 0.06], [0, 0, sign * 0.4]), color: GLOVE });
    A.add(bone, new THREE.CylinderGeometry(0.07, 0.075, 0.05, A.seg(12, 7)), { m: mat([0, 0.05, 0]), color: CUFF });
  }
}

/** The title belt: a broad gold-plated band round the waist, a big gold plate in front with a red gem. */
function titleBelt(A: Assembly, strap: Col): void {
  const w = A.w;
  A.add('hips', new THREE.TorusGeometry(0.17, 0.035, A.seg(5, 3), A.seg(18, 10)), { m: mat([0, 0.06, 0], [Math.PI / 2, 0, 0], [1.05 * w, 0.95, 1]), color: strap });
  A.add('hips', new THREE.CylinderGeometry(0.075, 0.075, 0.025, A.seg(12, 7)), { m: mat([0, 0.06, 0.18], [Math.PI / 2, 0, 0], [1.3, 1, 1]), color: BELT_GOLD });
  A.add('hips', new THREE.OctahedronGeometry(0.022, 0), { m: mat([0, 0.06, 0.2]), color: 0xe8322a });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'solid', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 1.22, tier: 'hero', headScale: 1.08, bodyScale: 1.15, earsLow: 0.2, tailCurve: [[0, 0.12, -0.13], [0, 0.18, -0.18], [0, 0.22, -0.2], [0, 0.24, -0.2]] },
    coat,
    eyes: { inner: 0x8a5a2a, outer: 0x3a2010, ring: 0x140c0a },
    earInner: 0xe8a8a0,
    nose: 0x1a1216,
    head: 'none',
    tail: { thick: 0.7 },
    detail,
    poses,
    gear: (A) => {
      boxerHead(A, coat);
      G.mantle(A, t.main, trim ?? CUFF, { r: 0.22, y: 0.14 });
      G.cape(A, founder || chroma !== null ? capeColor : t.main, capeHem, { len: 0.26, top: 0.15, bot: 0.24 });
      titleBelt(A, t.deep);
      gloves(A);
      extras(A);
    },
  };
}
