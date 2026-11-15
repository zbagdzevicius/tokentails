/**
 * Nova (sim v31, original cat; build spec docs/plans/moba/ROSTER-V31.md §2.1 "Render"): everything the render needs
 * that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's Shooting Star look) read the constants exported here. Import only types from
 * specs.ts (it imports this module).
 *
 * The silhouette is "the one with the telescope": a slim blue-grey cat in a team stargazer's hood and cloak dotted
 * with little gold stars, a long brass telescope slung across her back that sticks up over one shoulder (the read
 * from the iso camera: nobody else carries a diagonal brass tube), and a crescent-moon pin at the throat. The
 * telescope is never team-coloured.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';

/** Her poses: the stargazer (one paw raised to shade her eyes, the head tipped up a little). */
export const POSES: Record<string, PoseDef> = {
  stargaze: {
    joints: { chest: [-0.04, 0, 0], head: [-0.12, 0.1, 0], thighL: [0, 0.05, 0.06], thighR: [0, -0.05, -0.06], footL: [0, 0.22, 0], footR: [0, -0.22, 0] },
    arms: { L: { fk: { shoulder: [-0.2, 0, 0.18], elbow: [-0.3, 0, 0] } }, R: { fk: { shoulder: [-1.9, 0, -0.3], elbow: [-1.2, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

/** Idle and run as the stargazer's stand; cast 'heal' (both paws up: calling the stars down), attack 'paw'. */
export const MOTION: MotionProfile = { idle: 'stand', run: 'stand', cast: 'heal', attack: 'paw', stride: 1.05, moods: { cheer: 'stargaze' } };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 2.55;
/** Top of the bind-pose bounds (m: the telescope's eyepiece over her shoulder), measured from the built chibi. */
export const TOP = 2.76;
export const RING = HERO_BUILD.nova.ring;
export const COLOR_CSS = '#8fa8ff';
/** A long slow tail and tall still ears (she listens to the sky). */
export const SPRINGS: SpringTuning = { tail: { k: 110, c: 10, lag: 0.55 }, ears: { k: 180, c: 14, lag: 0 } };
export const ULT_NAME = 'METEOR SHOWER';
/** Cast accent (combat-vfx.test: no gold-family colour): starlight periwinkle. */
export const ACCENT: number | null = 0x8fa8ff;
/** Shooting Star (projectileView look): size (m), height (m), colour, trail size. A white-blue star. */
export const SHOT: readonly [number, number, number, number] = [0.36, 1.2, 0xe8f0ff, 0.3];

const COAT: CoatSpec = { pattern: 'solid', base: 0x8a96aa, deep: 0x5a6478, light: 0xd0d8e4, cream: 0xd0d8e4 };
const STAR = 0xfff2a8;
const MOON = 0xf4f0ff;

/** The telescope: a brass tube across her back, the eyepiece up over her right shoulder, the big lens low on the left. */
function telescope(A: Assembly): void {
  const at = mat([0.1, 0.22, -0.16], [0.25, 0, -0.62]);
  A.add('chest', new THREE.CylinderGeometry(0.045, 0.06, 0.46, A.seg(10, 6)), { m: at, color: G.BRASS });
  A.add('chest', new THREE.CylinderGeometry(0.03, 0.035, 0.14, A.seg(8, 5)), { m: at.clone().multiply(mat([0, 0.29, 0])), color: G.BRASS });
  for (const y of [-0.12, 0.08]) A.add('chest', new THREE.TorusGeometry(0.056, 0.012, 3, A.seg(10, 6)), { m: at.clone().multiply(mat([0, y, 0], [Math.PI / 2, 0, 0])), color: G.LEATHER });
  // the lens: a pale blue disc at the wide end
  A.add('chest', new THREE.CylinderGeometry(0.052, 0.052, 0.01, A.seg(10, 6)), { m: at.clone().multiply(mat([0, -0.235, 0])), color: 0xbfe2ff });
}

/** Little gold stars over the cloak and the hood (flattened octahedra). */
function stars(A: Assembly): void {
  const pts: readonly (readonly [number, number, number])[] = [[0.12, 0.06, -0.19], [-0.1, 0.0, -0.2], [0.0, -0.05, -0.22], [-0.14, 0.12, -0.12], [0.16, 0.14, -0.08]];
  for (const p of pts) A.add('chest', new THREE.OctahedronGeometry(0.022, 0).scale(1, 1, 0.4), { m: mat([p[0], p[1], p[2]]), color: STAR });
  A.add('head', new THREE.OctahedronGeometry(0.02, 0).scale(1, 1, 0.4), { m: mat([0.1, 0.33, -0.08]), color: STAR });
}

/** A thin gold circlet with a crescent moon on her brow and a star at each side (her crown read from the iso camera). */
function starCirclet(A: Assembly): void {
  A.add('head', new THREE.TorusGeometry(0.15, 0.01, 3, A.seg(16, 9)), { m: mat([0, 0.25, 0.0], [Math.PI / 2 - 0.25, 0, 0], [1.05, 1, 1]), color: G.BRASS });
  A.add('head', new THREE.TorusGeometry(0.045, 0.014, 3, A.seg(10, 6), Math.PI * 1.25), { m: mat([0, 0.31, 0.14], [0.2, 0, 2.0]), color: MOON });
  for (const s of [1, -1]) A.add('head', new THREE.OctahedronGeometry(0.026, 0).scale(1, 1, 0.4), { m: mat([s * 0.13, 0.27, 0.07]), color: STAR });
}

/** The crescent-moon pin at her throat. */
function moonPin(A: Assembly): void {
  A.add('chest', new THREE.TorusGeometry(0.04, 0.012, 3, A.seg(10, 6), Math.PI * 1.2), { m: mat([0, 0.17, 0.15], [0, 0, 0.9]), color: MOON });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'solid', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  const cloak: Col = founder || chroma !== null ? capeColor : t.main;
  return {
    rig: { width: 0.95, tier: 'hero', headScale: 1.2, earSplay: 0.08 },
    coat,
    // pale gold-green Russian blue eyes
    eyes: { inner: 0xe6ffb8, outer: 0x7ac25a, ring: 0x234a1e, size: 1.15 },
    earInner: 0xd8a8b8,
    nose: 0x8a7a8e,
    head: 'cat',
    ears: { size: 1.1 },
    cheeks: 0.85,
    face: 1.3,
    whiskers: true,
    tail: { thick: 0.95 },
    detail,
    poses,
    gear: (A) => {
      starCirclet(A);
      G.mantle(A, t.main, trim ?? STAR, { r: 0.24, drop: 0.33 });
      G.cape(A, cloak, capeHem, { len: 0.34, top: 0.14, bot: 0.27 });
      telescope(A);
      stars(A);
      moonPin(A);
      extras(A);
    },
  };
}
