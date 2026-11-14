/**
 * Biscuit (sim v29, original dog; build spec docs/plans/moba/ROSTER-V29.md §2.3 "Render"): everything the render
 * needs that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's Fetch! ball) read the constants exported here. Import only types from specs.ts.
 *
 * The silhouette is "the big golden one with the ball": a golden retriever, broad and fluffy, with a wide happy smile
 * and the tongue out, long feathered ears, a plume tail held high, a team bandana, and a bright yellow-green tennis
 * ball on a red leash: the leash runs from his collar and coils on his hip with the ball hanging at the end (the
 * read from the iso camera, together with the bright ball). The ball is never team-coloured.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { blushDots, C, dogEyes, dogNose, faceLine, mixC, smooth, shawl } from './dogParts';

/** His poses: the happy stand (chest out, front paws a little apart, head up). */
export const POSES: Record<string, PoseDef> = {
  goldenStand: {
    joints: { chest: [-0.04, 0, 0], head: [-0.08, 0, 0], thighL: [0, 0.06, 0.08], thighR: [0, -0.06, -0.08], footL: [0, 0.25, 0], footR: [0, -0.25, 0] },
    arms: { L: { fk: { shoulder: [-0.15, 0, 0.14], elbow: [-0.35, 0, 0] } }, R: { fk: { shoulder: [-0.15, 0, -0.14], elbow: [-0.35, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

export const MOTION: MotionProfile = { idle: 'goldenStand', run: 'goldenStand', cast: 'cheer', attack: 'paw', stride: 1.2 };
export const HEIGHT = 2.65;
/** Top of the bind-pose bounds (m: the skull top), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.8;
export const RING = HERO_BUILD.biscuit.ring;
export const COLOR_CSS = '#e8a94a';
/** A big plume tail that wags wide and long soft ears. */
export const SPRINGS: SpringTuning = { tail: { k: 150, c: 7, lag: 0.35 }, ears: { k: 55, c: 5, lag: 0 } };
export const ULT_NAME = 'WALKIES!';
/** Cast accent (combat-vfx.test: no gold-family colour): leash red. */
export const ACCENT: number | null = 0xff5a5a;
/** Fetch!'s ball (projectileView look): size (m), height (m), colour, trail size. A tennis ball. */
export const SHOT: readonly [number, number, number, number] = [0.34, 1.0, 0xd8f24a, 0.14];

const COAT: CoatSpec = { pattern: 'solid', base: 0xe0a24e, deep: 0xb5782e, light: 0xf8dca8, cream: 0xf8dca8 };
const BALL = 0xd8f24a;
const LEASH = 0xe0323a;

/** The retriever head: a broad soft skull, a long deep muzzle, a big smile with the tongue out, long feathered ears. */
function goldenHead(A: Assembly, coat: CoatSpec): void {
  const gold = C(coat.base as number);
  const deep = C(coat.deep as number);
  const light = C(coat.cream as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => mixC(mixC(gold, deep, smooth(0.0, -0.13, lp.z) * 0.3), light, smooth(0.14, 0.1, lp.y) * smooth(0.0, 0.07, lp.z) * 0.7);
  A.add('head', new THREE.SphereGeometry(0.155, A.seg(20, 10), A.seg(14, 8)).scale(1.08, 0.98, 1.04).translate(0, 0.172, 0), { color: skin });
  A.add('head', new THREE.SphereGeometry(0.075, A.seg(12, 7), A.seg(9, 5)).scale(1.05, 0.8, 1.3).translate(0, 0.108, 0.15), { color: (_v, _n, lp) => mixC(gold, light, smooth(0.0, -0.04, lp.y) * 0.8) });
  dogNose(A, [0, 0.136, 0.245], 0.028);
  faceLine(A, [[-0.05, 0.1, 0.19], [-0.025, 0.08, 0.215], [0, 0.084, 0.222], [0.025, 0.08, 0.215], [0.05, 0.1, 0.19]], 0.005, 0x4a1e26);
  A.add('head', new THREE.SphereGeometry(0.032, A.seg(8, 5), A.seg(6, 4)).scale(0.9, 0.5, 1.15), { m: mat([0, 0.062, 0.2], [0.5, 0, 0]), color: 0xf27a8e });
  dogEyes(A, { inner: 0x7a4a24, outer: 0x2e1a10, ring: 0x140c0a }, { x: 0.068, y: 0.195, z: 0.128, r: 0.046 });
  blushDots(A, 0.1, 0.135, 0.11);
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    // long feathered ears: two soft lobes, darker gold
    A.add(`ear${s}`, new THREE.SphereGeometry(0.085, A.seg(10, 6), A.seg(8, 5)).scale(0.85, 1.55, 0.36), { m: mat([sign * 0.07, -0.07, 0.02], [0.1, 0, sign * 0.7]), color: deep });
    A.add(`ear${s}`, new THREE.SphereGeometry(0.06, A.seg(8, 5), A.seg(6, 4)).scale(0.9, 1.2, 0.4), { m: mat([sign * 0.1, -0.15, 0.025], [0.1, 0, sign * 0.6]), color: gold });
  }
}

/** The leash and the ball: a red loop from the collar down to his left hip, a coil there, the tennis ball hanging below. */
function leashAndBall(A: Assembly): void {
  const w = A.w;
  const pts = [new THREE.Vector3(0.05, 0.2, 0.12), new THREE.Vector3(0.14 * w, 0.08, 0.1), new THREE.Vector3(0.19 * w, -0.06, 0.06)];
  A.add('chest', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), A.seg(10, 6), 0.012, 4, false), { color: LEASH });
  A.add('hips', new THREE.TorusGeometry(0.05, 0.012, 4, A.seg(12, 7)), { m: mat([0.19 * w, 0.02, 0.05], [0, Math.PI / 2, 0.3]), color: LEASH });
  A.add('hips', new THREE.CylinderGeometry(0.008, 0.008, 0.08, 4), { m: mat([0.2 * w, -0.05, 0.06]), color: LEASH });
  const ball = mat([0.2 * w, -0.12, 0.06]);
  A.add('hips', new THREE.SphereGeometry(0.06, A.seg(12, 7), A.seg(9, 5)), { m: ball, color: BALL });
  // the white seam
  A.add('hips', new THREE.TorusGeometry(0.058, 0.006, 3, A.seg(14, 8)), { m: ball.clone().multiply(mat([0, 0, 0], [0.6, 0.4, 0], [1, 1, 0.65])), color: 0xffffff });
}

/** The collar: a team band round the neck with a gold tag. */
function collar(A: Assembly, color: Col): void {
  A.add('chest', new THREE.TorusGeometry(0.125, 0.022, 4, A.seg(16, 9)), { m: mat([0, 0.21, 0.01], [Math.PI / 2 + 0.2, 0, 0], [1.08, 1, 1]), color });
  A.add('chest', new THREE.CylinderGeometry(0.026, 0.026, 0.008, A.seg(10, 6)), { m: mat([0, 0.17, 0.135], [Math.PI / 2 - 0.2, 0, 0]), color: G.BRASS });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'solid', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 1.2, tier: 'hero', headScale: 1.12, bodyScale: 1.12, earsLow: 0.8, tailCurve: [[0, 0.16, -0.14], [0, 0.28, -0.26], [0, 0.42, -0.3], [0, 0.52, -0.24]] },
    coat,
    eyes: { inner: 0x7a4a24, outer: 0x2e1a10, ring: 0x140c0a },
    earInner: 0xb5782e,
    nose: 0x1a1216,
    head: 'none',
    tail: { thick: 1.35 },
    detail,
    poses,
    gear: (A) => {
      goldenHead(A, coat);
      G.fluffPuffs(A, A.detail >= 0.9 ? 5 : 4, coat.cream as number);
      shawl(A, t.main, trim ?? t.second, { r: 0.18, y: 0.15, low: 0.5 });
      collar(A, t.main);
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.2, top: 0.14, bot: 0.2 });
      leashAndBall(A);
      extras(A);
    },
  };
}
