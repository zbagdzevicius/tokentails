/**
 * Ranger (sim v31, original dog; build spec docs/plans/moba/ROSTER-V31.md §2.4 "Render"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's Tracer Ball) read the constants exported here. Import only types from specs.ts.
 *
 * The silhouette is "the bush with a tube": a tricolour beagle (tan head, white blaze and muzzle, long brown ears)
 * under a leafy camouflage cape with leaf tufts on his back and a sprig on his head (the read from the iso camera: a
 * green leafy hump), a team bandana, and a long green tennis-ball launcher in his paw with a yellow ball at the muzzle.
 * The leaves and the launcher are never team-coloured.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type CoatSpec, type RGB } from '../chibi';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { C, blushDots, dogEyes, dogNose, faceLine, mixC, shawl, smooth } from './dogParts';

/** His poses: none of his own; he stands and aims like the other shooters. */
export const POSES: Record<string, PoseDef> = {};

export const MOTION: MotionProfile = { idle: 'stand', run: 'stand', cast: 'aim', attack: 'shoot', aim: 'aim', stride: 1.25 };
export const HEIGHT = 2.6;
/** Top of the bind-pose bounds (m: the leaf sprig), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.9;
export const RING = HERO_BUILD.ranger.ring;
export const COLOR_CSS = '#7cc46a';
/** A white-tipped tail held up and long soft ears. */
export const SPRINGS: SpringTuning = { tail: { k: 160, c: 9, lag: 0.3 }, ears: { k: 60, c: 6, lag: 0 } };
export const ULT_NAME = 'LONG SHOT';
/** Cast accent (combat-vfx.test: no gold-family colour): leaf green. */
export const ACCENT: number | null = 0x6ad04a;
/** Tracer Ball and LONG SHOT (projectileView look): size (m), height (m), colour, trail size. A tennis ball. */
export const SHOT: readonly [number, number, number, number] = [0.3, 1.1, 0xd8f24a, 0.18];

const COAT: CoatSpec = { pattern: 'solid', base: 0xc07a3a, deep: 0x2a2220, light: 0xfaf6ee, cream: 0xfaf6ee };
const LEAF = 0x4f8a36;
const LEAF_LIGHT = 0x7ab84a;
const TUBE = 0x4f9a3e;
const BALL = 0xd8f24a;

/** The beagle head: a round tan skull with a white blaze, a white muzzle, long brown ears, a happy face. */
function beagleHead(A: Assembly, coat: CoatSpec): void {
  const tan = C(coat.base as number);
  const white = C(coat.cream as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => mixC(tan, white, smooth(0.035, 0.015, Math.abs(lp.x)) * smooth(0.05, 0.1, lp.z));
  A.add('head', new THREE.SphereGeometry(0.15, A.seg(20, 10), A.seg(14, 8)).scale(1.06, 1.0, 1.02).translate(0, 0.175, 0), { color: skin });
  A.add('head', new THREE.SphereGeometry(0.075, A.seg(12, 7), A.seg(9, 5)).scale(1.0, 0.8, 1.25).translate(0, 0.112, 0.145), { color: white });
  dogNose(A, [0, 0.14, 0.235], 0.028);
  faceLine(A, [[-0.045, 0.1, 0.19], [-0.02, 0.085, 0.21], [0, 0.09, 0.215], [0.02, 0.085, 0.21], [0.045, 0.1, 0.19]], 0.005, 0x3a1e18);
  dogEyes(A, { inner: 0x7a4a24, outer: 0x2e1a10, ring: 0x140c0a }, { x: 0.066, y: 0.198, z: 0.124, r: 0.045 });
  blushDots(A, 0.1, 0.14, 0.11);
  const ear = C(0x7a4422);
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    // long beagle ears: soft lobes hanging below the jaw
    A.add(`ear${s}`, new THREE.SphereGeometry(0.08, A.seg(10, 6), A.seg(8, 5)).scale(0.8, 1.9, 0.32), { m: mat([sign * 0.07, -0.1, 0.02], [0.05, 0, sign * 0.35]), color: ear });
  }
}

/** The ghillie cape: leaf tufts over the back and shoulders, a sprig on the head. */
function leaves(A: Assembly): void {
  const pts: readonly (readonly [number, number, number, number])[] = [
    [0.0, 0.18, -0.17, 1.1], [0.12, 0.12, -0.15, 0.9], [-0.12, 0.12, -0.15, 0.9], [0.06, 0.02, -0.19, 1.0], [-0.07, 0.03, -0.19, 1.0],
    [0.17, 0.2, -0.04, 0.8], [-0.17, 0.2, -0.04, 0.8], [0.0, -0.08, -0.17, 0.9],
    [0.2, 0.24, 0.04, 0.9], [-0.2, 0.24, 0.04, 0.9], [0.1, 0.27, -0.08, 1.0], [-0.1, 0.27, -0.08, 1.0],
  ];
  pts.forEach((p, i) => A.add('chest', new THREE.IcosahedronGeometry(0.06 * p[3], 0).scale(1.2, 0.6, 1), { m: mat([p[0], p[1], p[2]], [0.3 * (i % 3), i * 0.7, 0]), color: i % 2 === 0 ? LEAF : LEAF_LIGHT }));
  for (const k of [0, 1, 2]) A.add('head', new THREE.SphereGeometry(0.04, A.seg(6, 4), A.seg(4, 3)).scale(0.5, 1.4, 0.2), { m: mat([0.05 + k * 0.02, 0.33 + k * 0.01, -0.02], [0, 0, -0.5 + k * 0.4]), color: k === 1 ? LEAF_LIGHT : LEAF });
}

/** The launcher on the weapon socket: a long green tube, a grip, a tennis ball sitting in the muzzle. */
function launcher(A: Assembly): void {
  A.add('weapon', new THREE.CylinderGeometry(0.055, 0.06, 0.46, A.seg(10, 6)), { m: mat([0, 0.18, 0.02]), color: TUBE });
  A.add('weapon', new THREE.TorusGeometry(0.058, 0.012, 3, A.seg(10, 6)), { m: mat([0, 0.4, 0.02], [Math.PI / 2, 0, 0]), color: 0xf2f2e8 });
  A.add('weapon', new THREE.BoxGeometry(0.05, 0.1, 0.06), { m: mat([0, -0.04, 0.06]), color: 0x2a2a2a });
  A.add('weapon', new THREE.SphereGeometry(0.055, A.seg(8, 5), A.seg(6, 4)), { m: mat([0, 0.43, 0.02]), color: BALL });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, trim, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'solid', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 1.05, tier: 'hero', headScale: 1.14, bodyScale: 1.04, earsLow: 0.8, tailCurve: [[0, 0.16, -0.14], [0, 0.28, -0.2], [0, 0.4, -0.2], [0, 0.48, -0.16]] },
    coat,
    eyes: { inner: 0x7a4a24, outer: 0x2e1a10, ring: 0x140c0a },
    earInner: 0x7a4422,
    nose: 0x1a1216,
    head: 'none',
    tail: { thick: 0.9 },
    detail,
    poses,
    gear: (A) => {
      beagleHead(A, coat);
      shawl(A, t.main, trim ?? t.second, { r: 0.18, y: 0.15, low: 0.45 });
      leaves(A);
      launcher(A);
      extras(A);
    },
  };
}
