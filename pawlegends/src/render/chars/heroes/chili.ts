/**
 * Chili (sim v13, original dog; build spec docs/plans/moba/DOGS-V13.md §1.4 "Render"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase, views/models.ts
 * HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and heroAccentRaw) read the
 * constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The tiny furious one: a fawn chihuahua. From the iso camera he is "the tiny one": the smallest body in the game
 * with the biggest head share, ENORMOUS bat ears splayed out, bulging glossy eyes under two angry little brows, a
 * tiny underbite fang, a team knit sweater (his team read) and a pink collar with a bone tag; a pink handbag on his
 * hip (Purse Mode's bag). BIG DOG ENERGY grows him to 1.35× (moves/chili.ts root scale).
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { C, dogEyes, dogNose, faceLine, mixC, pointedEar, smooth, shawl } from './dogParts';

/** His poses: the stiff-legged yapping stance (chest out, paws braced, chin up). */
export const POSES: Record<string, PoseDef> = {
  yapStance: {
    joints: { hips: [0.06, 0, 0], chest: [-0.12, 0, 0], head: [-0.18, 0, 0], thighL: [-0.1, 0.16, 0.12], thighR: [-0.1, -0.16, -0.12], kneeL: [0.15, 0, 0], kneeR: [0.15, 0, 0], footL: [0, 0.35, 0], footR: [0, -0.35, 0] },
    arms: { L: { fk: { shoulder: [-0.35, 0, 0.32], elbow: [-0.3, 0, 0] } }, R: { fk: { shoulder: [-0.35, 0, -0.32], elbow: [-0.3, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

/** Idle stands braced (+ the 3 Hz bob from his idle clip), runs on a fast skittering stride, attacks with a bark recoil. */
export const MOTION: MotionProfile = { idle: 'yapStance', run: 'yapStance', cast: 'cheer', attack: 'paw', stride: 1.6 };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 1.75;
/** Top of the bind-pose bounds (m: the ear tips), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.27;
/** Relation ring under him (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.chili.ring;
export const COLOR_CSS = '#ff5a3c';
/** A quick, twitchy tail and big thin ears that quiver. */
export const SPRINGS: SpringTuning = { tail: { k: 220, c: 9, lag: 0.25 }, ears: { k: 90, c: 4, lag: 0 } };
export const ULT_NAME = 'BIG DOG ENERGY';
/** Cast accent (combat-vfx.test: no gold-family colour). */
export const ACCENT: number | null = 0xff6a3d;

/** Smooth fawn. */
const COAT: CoatSpec = { pattern: 'solid', base: 0xd9a46a, deep: 0xb07a44, light: 0xf2d2a8, cream: 0xf6e4c8 };
const EAR_PINK = 0xf2a0a8;
const COLLAR = 0xff6fa8;
const BAG = 0xff8fc8;
const BAG_DEEP = 0xd9559a;
/** A thin tail curled up over the rump. */
const TAIL: readonly (readonly [number, number, number])[] = [[0, 0.24, -0.12], [0.02, 0.34, -0.2], [0.03, 0.45, -0.17], [0.0, 0.48, -0.09]];

/**
 * The chihuahua head: an apple-dome skull, a short pointed muzzle in cream, a tiny nose, bulging glossy eyes (two
 * catchlights), two small angry brows angled down to the middle, a tiny underbite fang, and the ENORMOUS bat ears
 * (about 2× a cat ear, thin, pink inside, splayed out).
 */
function chihuahuaHead(A: Assembly, coat: CoatSpec): void {
  const fur = C(coat.base as number);
  const deep = C(coat.deep as number);
  const cream = C(coat.cream as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    const c = mixC(fur, deep, smooth(0.0, -0.13, lp.z) * 0.3 + smooth(0.27, 0.32, lp.y) * 0.15);
    return mixC(c, cream, smooth(0.14, 0.1, lp.y) * smooth(0.02, 0.08, lp.z));
  };
  A.add('head', new THREE.SphereGeometry(0.155, A.seg(20, 10), A.seg(14, 8)).scale(1.1, 1.06, 1.0).translate(0, 0.18, 0), { color: skin });
  A.add('head', new THREE.SphereGeometry(0.052, A.seg(10, 6), A.seg(8, 5)).scale(1.0, 0.75, 1.2).translate(0, 0.1, 0.14), { color: cream });
  dogNose(A, [0, 0.12, 0.196], 0.019);
  // a cross little mouth and the underbite fang poking up
  faceLine(A, [[-0.025, 0.083, 0.18], [0, 0.088, 0.188], [0.025, 0.083, 0.18]], 0.0042, 0x4a1e26);
  A.add('head', new THREE.ConeGeometry(0.008, 0.018, 4), { m: mat([0.016, 0.092, 0.186]), color: 0xfffaf0 });
  dogEyes(A, { inner: 0x5a3418, outer: 0x24120a, ring: 0x0c0806 }, { x: 0.074, y: 0.175, z: 0.13, r: 0.058, pupil: 0.52, turn: 0.42 }, { wet: true, flat: 0.75 });
  // the angry brows: short dark wedges sloping down toward the nose
  for (const s of [1, -1]) A.add('head', new THREE.BoxGeometry(0.05, 0.013, 0.014), { m: mat([s * 0.072, 0.243, 0.142], [0.25, s * 0.3, s * 0.42]), color: 0x6a3e1e });
  // the ENORMOUS bat ears
  for (const s of ['L', 'R'] as const) pointedEar(A, s, { r: 0.1, h: 0.27, depth: 0.3, tilt: -0.18, lean: -0.12, y: -0.02, outer: (_v, _n, lp) => mixC(fur, deep, smooth(0.15, 0.27, lp.y) * 0.35), inner: EAR_PINK, innerK: 0.7 });
}

/** The team knit sweater: chest and hips in the team colour, a turtleneck roll and ribbed bands in the deep colour. */
function sweater(A: Assembly, main: Col, deep: Col): void {
  G.jacket(A, main, { buttons: false });
  shawl(A, main, deep, { r: 0.18, y: 0.15 });
  A.add('chest', new THREE.TorusGeometry(0.1 * A.w, 0.03, A.seg(6, 4), A.seg(14, 8)), { m: mat([0, 0.24, 0.0], [Math.PI / 2, 0, 0]), color: deep });
  A.add('hips', new THREE.TorusGeometry(0.155 * A.w, 0.018, 3, A.seg(14, 8)), { m: mat([0, -0.06, 0], [Math.PI / 2, 0, 0]), color: deep });
}

/** A pink collar with a bone-shaped tag. */
function collar(A: Assembly): void {
  A.add('head', new THREE.TorusGeometry(0.09, 0.014, 3, A.seg(14, 8)), { m: mat([0, 0.02, 0.0], [Math.PI / 2 + 0.25, 0, 0], [1.1, 1, 1]), color: COLLAR });
  const b = mat([0, -0.005, 0.1]);
  A.add('head', new THREE.BoxGeometry(0.04, 0.012, 0.01), { m: b, color: 0xfff6e6 });
  for (const x of [-0.022, 0.022]) for (const y of [-0.007, 0.007]) A.add('head', new THREE.SphereGeometry(0.008, 5, 3), { m: b.clone().multiply(mat([x, y, 0])), color: 0xfff6e6 });
}

/** The pink handbag on his right hip (Purse Mode's bag): a rounded body, a flap and a strap loop. */
function handbag(A: Assembly): void {
  const w = A.w;
  const at = mat([-0.2 * w, -0.02, 0.03], [0, -0.5, 0.15]);
  A.add('hips', new THREE.SphereGeometry(0.075, A.seg(10, 6), A.seg(7, 4)).scale(1.15, 0.85, 0.6), { m: at, color: BAG });
  A.add('hips', new THREE.SphereGeometry(0.076, A.seg(10, 6), A.seg(4, 3), 0, Math.PI * 2, 0, Math.PI * 0.35).scale(1.16, 0.85, 0.62), { m: at, color: BAG_DEEP });
  A.add('hips', new THREE.TorusGeometry(0.05, 0.007, 3, A.seg(10, 6), Math.PI), { m: at.clone().multiply(mat([0, 0.055, 0])), color: BAG_DEEP });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: 'solid', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 0.78, tier: 'kid', headScale: 1.25, bodyScale: 1.1, tailCurve: TAIL },
    coat,
    eyes: { inner: 0x5a3418, outer: 0x24120a, ring: 0x0c0806 },
    earInner: EAR_PINK,
    nose: 0x1a1216,
    head: 'none',
    armoured: { body: true },
    tail: { thick: 0.6 },
    detail,
    poses,
    gear: (A) => {
      chihuahuaHead(A, coat);
      sweater(A, founder || chroma !== null ? capeColor : t.main, trim ?? t.deep);
      collar(A);
      handbag(A);
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.16, top: 0.12, bot: 0.16 });
      extras(A);
    },
  };
}
