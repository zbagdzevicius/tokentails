/**
 * Barkula (sim v31, original dog; build spec docs/plans/moba/ROSTER-V31.md §2.3 "Render"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's Bat Bite) read the constants exported here. Import only types from specs.ts.
 *
 * The silhouette is "the one with the collar": a black-and-tan Doberman count with tall pointed ears, a long muzzle,
 * two little white fangs and a cape whose huge stand-up collar fans out behind his head (the read from the iso camera:
 * a tall dark fan nobody else wears). The cape is team-coloured outside and wine-red inside; a brass medallion hangs
 * on his chest.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { C, dogEyes, dogNose, faceLine, mixC, pointedEar, smooth } from './dogParts';

/** His poses: the count's bow (one paw across the chest, chin up). */
export const POSES: Record<string, PoseDef> = {
  countStand: {
    joints: { chest: [-0.06, 0, 0], head: [-0.1, 0, 0], thighL: [0, 0.04, 0.05], thighR: [0, -0.04, -0.05], footL: [0, 0.22, 0], footR: [0, -0.22, 0] },
    arms: { L: { fk: { shoulder: [-0.1, 0, 0.12], elbow: [-0.2, 0, 0] } }, R: { fk: { shoulder: [-0.9, 0.5, -0.1], elbow: [-1.5, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

export const MOTION: MotionProfile = { idle: 'countStand', run: 'stand', cast: 'heal', attack: 'paw', stride: 1.2 };
export const HEIGHT = 2.75;
/** Top of the bind-pose bounds (m: the ear tips), measured from the built chibi (readability.test: within 4%). */
export const TOP = 3.36;
export const RING = HERO_BUILD.barkula.ring;
export const COLOR_CSS = '#b02a4a';
/** A short docked tail and stiff tall ears. */
export const SPRINGS: SpringTuning = { tail: { k: 280, c: 14, lag: 0.1 }, ears: { k: 260, c: 18, lag: 0 } };
export const ULT_NAME = 'RED MOON';
/** Cast accent (combat-vfx.test: no gold-family colour): wine red. */
export const ACCENT: number | null = 0xd8204a;
/** Bat Bite (projectileView look): size (m), height (m), colour, trail size. A little dark bat. */
export const SHOT: readonly [number, number, number, number] = [0.4, 1.3, 0x2a1830, 0.22];

const COAT: CoatSpec = { pattern: 'solid', base: 0x24201e, deep: 0x141210, light: 0xc87a3a, cream: 0xc87a3a };
const LINING = 0x7a1028;
const COLLAR = 0x1a1418;

/** The Doberman head: a long sleek black skull, tan brows, cheeks and muzzle, tall pointed ears, two little fangs. */
function dobermanHead(A: Assembly, coat: CoatSpec): void {
  const black = C(coat.base as number);
  const tan = C(coat.cream as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => {
    const brow = smooth(0.03, 0.0, Math.abs(Math.abs(lp.x) - 0.06)) * smooth(0.04, 0.0, Math.abs(lp.y - 0.23)) * smooth(0.06, 0.11, lp.z);
    const cheek = smooth(0.15, 0.11, lp.y) * smooth(0.04, 0.1, lp.z);
    return mixC(black, tan, Math.min(1, brow + cheek));
  };
  A.add('head', new THREE.SphereGeometry(0.145, A.seg(20, 10), A.seg(14, 8)).scale(1.0, 1.0, 1.12).translate(0, 0.18, 0), { color: skin });
  A.add('head', new THREE.SphereGeometry(0.07, A.seg(12, 7), A.seg(9, 5)).scale(0.95, 0.75, 1.65).translate(0, 0.12, 0.15), { color: (_v, _n, lp) => mixC(black, tan, smooth(0.02, -0.03, lp.y)) });
  dogNose(A, [0, 0.14, 0.26], 0.024);
  faceLine(A, [[-0.04, 0.095, 0.2], [0, 0.088, 0.225], [0.04, 0.095, 0.2]], 0.005, 0x140c0e);
  for (const s of [1, -1]) A.add('head', new THREE.ConeGeometry(0.009, 0.028, 4).rotateZ(Math.PI), { m: mat([s * 0.022, 0.078, 0.215]), color: 0xffffff });
  dogEyes(A, { inner: 0xd88a3a, outer: 0x6a3410, ring: 0x1a0c06 }, { x: 0.064, y: 0.2, z: 0.118, r: 0.04 });
  for (const s of ['L', 'R'] as const) pointedEar(A, s, { r: 0.06, h: 0.22, outer: coat.base as number, inner: 0xd88a8a, depth: 0.45, tilt: 0.18, y: 0.0 });
}

/** The cape's stand-up collar: a curved fan behind the head, dark outside, wine-red inside. */
function collar(A: Assembly): void {
  const g = new THREE.CylinderGeometry(0.27, 0.15, 0.36, A.seg(14, 8), 1, true, Math.PI - 1.35, 2.7);
  G.both(A, 'chest', g, mat([0, 0.36, -0.02], [-0.32, 0, 0]), COLLAR, LINING);
}

/** The medallion: a brass disc with a red gem on a chain. */
function medallion(A: Assembly): void {
  A.add('chest', new THREE.TorusGeometry(0.1, 0.006, 3, A.seg(14, 8), Math.PI), { m: mat([0, 0.2, 0.1], [0.3, 0, Math.PI]), color: G.BRASS });
  A.add('chest', new THREE.CylinderGeometry(0.04, 0.04, 0.012, A.seg(10, 6)), { m: mat([0, 0.1, 0.16], [Math.PI / 2 - 0.3, 0, 0]), color: G.BRASS });
  A.add('chest', new THREE.OctahedronGeometry(0.018, 0), { m: mat([0, 0.1, 0.172]), color: 0xd8204a });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'solid', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  const cape: Col = founder || chroma !== null ? capeColor : t.main;
  return {
    rig: { width: 1.05, tier: 'hero', headScale: 1.1, bodyScale: 1.08, earsLow: 0.0, tailCurve: [[0, 0.12, -0.13], [0, 0.18, -0.17], [0, 0.22, -0.18], [0, 0.24, -0.18]] },
    coat,
    eyes: { inner: 0xd88a3a, outer: 0x6a3410, ring: 0x1a0c06 },
    earInner: 0xd88a8a,
    nose: 0x140c0e,
    head: 'none',
    tail: { thick: 0.6 },
    detail,
    poses,
    gear: (A) => {
      dobermanHead(A, coat);
      G.mantle(A, cape, trim ?? LINING, { r: 0.21, y: 0.15 });
      G.cape(A, cape, LINING, { len: 0.38, top: 0.15, bot: 0.3 });
      collar(A);
      medallion(A);
      extras(A);
    },
  };
}
