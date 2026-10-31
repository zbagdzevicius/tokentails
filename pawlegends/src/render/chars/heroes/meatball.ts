/**
 * Meatball (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.1 "Chibi", "Moves and VFX"): everything
 * the render needs that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw) read the constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The silhouette from the iso camera is a ball: the widest, roundest body in the game (an orange tabby belly ball
 * over the hips, a small head sunk into it, stubby legs and a stub tail), a team-coloured bandana (mantle, knot
 * and a short cape: the team read), a sweatband round the head and a fish lunchbox on his hip.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec } from '../chibi';
import * as G from '../gear';
import type { HeroDress, MotionProfile } from '../specs';

/** Idle sits like a loaf, runs on a short waddle stride, casts in a braced block, attacks with a belly bash. */
export const MOTION: MotionProfile = { idle: 'sit', run: 'stand', cast: 'block', attack: 'bash', stride: 0.82 };
/** Standing height (m) in the match. */
export const HEIGHT = 2.5;
/** Top of the bind-pose bounds (m), measured from the built chibi (readability.test: within 4%); re-measure after a rig or gear change. */
export const TOP = 2.85;
/** Relation ring under him (m). */
export const RING = 2.25;
export const COLOR_CSS = '#d9662b';
/** A heavy, slow tail and floppy ears (a big soft cat). */
export const SPRINGS: SpringTuning = { tail: { k: 80, c: 9, lag: 0.6 }, ears: { k: 130, c: 11, lag: 0 } };
export const ULT_NAME = 'Chonk!';
/** Cast accent; null = his element colour (GRASS). */
export const ACCENT: number | null = null;

const COAT: CoatSpec = { pattern: 'tabby', base: 0xe07a35, deep: 0xb5521f, light: 0xf2a65e, cream: 0xfbe3c4, stripe: 0.5 };
/** Lunchbox tin blue, its lid trim and the fish on the lid. */
const TIN = 0x7fb0d9;
const FISH = 0xc8d4dc;
const SWEAT = 0xf6f2ea;
/** A short stub of a tail sticking out low off his rump (kept under the head line: from the iso camera a raised tail read as a horn). */
const TAIL: readonly (readonly [number, number, number])[] = [[0.0, 0.2, -0.17], [0.02, 0.19, -0.25], [0.04, 0.21, -0.31], [0.05, 0.25, -0.34]];

/**
 * His fish lunchbox (~120 triangles at Med): a rounded tin on his right hip with a handle and a fish on the lid.
 */
export function fishLunchbox(A: Assembly, color: Col): void {
  const w = A.w;
  const at = mat([-0.19 * w, -0.03, 0.05], [0, -0.5, 0.12]);
  A.add('hips', new THREE.BoxGeometry(0.15, 0.1, 0.075), { m: at, color });
  A.add('hips', new THREE.BoxGeometry(0.155, 0.018, 0.08), { m: at.clone().multiply(mat([0, 0.05, 0])), color: 0x4f7fa8 });
  A.add('hips', new THREE.TorusGeometry(0.03, 0.007, 3, A.seg(8, 5), Math.PI), { m: at.clone().multiply(mat([0, 0.058, 0])), color: 0x4f7fa8 });
  // the fish on the lid's face: a flat body and a tail fin
  A.add('hips', new THREE.SphereGeometry(0.03, A.seg(8, 5), A.seg(5, 3)).scale(1.4, 0.75, 0.3), { m: at.clone().multiply(mat([0.01, 0, 0.04])), color: FISH });
  A.add('hips', new THREE.ConeGeometry(0.022, 0.03, 3).rotateZ(Math.PI / 2), { m: at.clone().multiply(mat([-0.045, 0, 0.04], [0, 0, 0], [1, 1, 0.35])), color: FISH });
}

/** The belly ball: a big round coat-coloured sphere over his hips and chest, the widest round body in the game. */
function belly(A: Assembly): void {
  const w = A.w;
  A.add('hips', new THREE.SphereGeometry(0.25, A.seg(16, 9), A.seg(12, 7)).scale(1.1 * w, 0.9, 1.04), { m: mat([0, 0.07, 0.02]), color: (_v, _n, lp) => A.coat('body', lp) });
}

/** The bandana knot: a team-coloured triangle hanging on his chest under the chin. */
function bandanaKnot(A: Assembly, color: Col): void {
  const g = new THREE.ConeGeometry(0.075, 0.12, 3, 1).rotateX(Math.PI).scale(1.3, 1, 0.35);
  A.add('chest', g, { m: mat([0, 0.15, 0.16], [-0.25, 0, 0]), color });
  A.add('chest', new THREE.SphereGeometry(0.022, A.seg(6, 4), A.seg(4, 3)), { m: mat([0, 0.21, 0.155]), color });
}

/** A sweatband round his head (white with a team stripe), just under the ears. */
function sweatband(A: Assembly, stripe: Col): void {
  A.add('head', new THREE.CylinderGeometry(0.168, 0.172, 0.04, A.seg(16, 9), 1, true), { m: mat([0, 0.215, -0.005], [-0.12, 0, 0], [1.1, 1, 1.02]), color: SWEAT });
  A.add('head', new THREE.TorusGeometry(0.171, 0.006, 3, A.seg(16, 9)), { m: mat([0, 0.215, -0.005], [Math.PI / 2 - 0.12, 0, 0], [1.1, 1.02, 1]), color: stripe });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  return {
    rig: { width: 1.35, tier: 'hero', headScale: 0.95, bodyScale: 1.25, earsLow: 0.25, tailCurve: TAIL },
    coat: lc ? { pattern: 'tabby', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT,
    eyes: { inner: 0xbfe36a, outer: 0x6f9a2a, ring: 0x2c3a14, size: 0.85 },
    earInner: 0xf2a6a0,
    nose: 0xd9706a,
    head: 'cat',
    ears: { size: 1.0 },
    cheeks: 0.9,
    face: 1.4,
    whiskers: true,
    blush: true,
    tail: { thick: 1.4 },
    detail,
    poses,
    gear: (A) => {
      belly(A);
      G.mantle(A, t.main, trim ?? t.second, { r: 0.22, y: 0.16 });
      bandanaKnot(A, t.main);
      // the bandana's short tail down his back (a full cape hid the ball from the side)
      G.cape(A, founder || chroma !== null ? capeColor : t.main, capeHem, { len: 0.16, top: 0.13, bot: 0.17 });
      sweatband(A, t.main);
      fishLunchbox(A, TIN);
      extras(A);
    },
  };
}
