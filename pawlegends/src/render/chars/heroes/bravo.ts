/**
 * Bravo (sim v14, original dog; build spec docs/plans/moba/DOGS-V13.md §1.3 "Render"): everything the render needs
 * that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase, views/models.ts
 * HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and heroAccentRaw) read the
 * constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The drama queen: a small BLACK pug actor (Sir Brutus is the fawn pug in armour). From the iso camera he is "the
 * cape": a velvet cape in the team colour as wide as his outline with a silver hem, a white Elizabethan ruff, and a
 * round black pug head with huge wet eyes, tragic raised brows and one blue tear on his cheek. No armour.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { C, dogEyes, dogNose, faceLine, mixC, smooth, shawl } from './dogParts';

/** His poses: the chest-out stage stand (one paw on his heart) and the flop (on his back, legs up). */
export const POSES: Record<string, PoseDef> = {
  stageStand: {
    joints: { hips: [-0.04, 0, 0], chest: [-0.14, 0, 0], head: [-0.12, 0.12, 0], thighL: [0, 0.08, 0.08], thighR: [0, -0.08, -0.08], footL: [0, 0.3, 0], footR: [0, -0.3, 0] },
    arms: { L: { fk: { shoulder: [-1.15, 0, -0.35], elbow: [-1.4, 0, 0] } }, R: { fk: { shoulder: [-0.2, 0, -0.55], elbow: [-0.5, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  // The flop: flat on his back (the body turned a quarter backward, lowered), legs in the air, arms flung out.
  playDead: {
    body: { p: [0, 0.16, 0.28], r: [-Math.PI / 2, 0, 0] },
    joints: { head: [0.5, 0, 0.3], thighL: [-1.4, 0, 0.15], thighR: [-1.4, 0, -0.15], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0] },
    arms: { L: { fk: { shoulder: [-0.6, 0, 1.4], elbow: [-0.4, 0, 0] } }, R: { fk: { shoulder: [-0.6, 0, -1.4], elbow: [-0.4, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

/** Idle stands chest out, runs on a prancing stride, casts with a cheer, attacks with a cape swat (bash). */
export const MOTION: MotionProfile = { idle: 'stageStand', run: 'stageStand', cast: 'cheer', attack: 'bash', stride: 1.1 };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 2.45;
/** Top of the bind-pose bounds (m: the skull top), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.4;
/** Relation ring under him (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.bravo.ring;
/** A light lilac (his card and portrait backdrop): a black pug on dark purple read as a smudge (QA 2026-11-06). */
export const COLOR_CSS = '#b693e6';
/** A stiff curly tail and soft folded ears. */
export const SPRINGS: SpringTuning = { tail: { k: 300, c: 20, lag: 0.3 }, ears: { k: 160, c: 12, lag: 0 } };
export const ULT_NAME = 'ENCORE!';
/** Cast accent (combat-vfx.test: no gold-family colour). */
export const ACCENT: number | null = 0xb07cff;

/**
 * The black pug coat: a soft slate charcoal with a strong silver-lilac sheen on top (his rim light: on the dark map a
 * true black pug read as a thin dark sliver), the chest a touch lighter.
 */
const COAT: CoatSpec = { pattern: 'solid', base: 0x575163, deep: 0x2e2b35, light: 0xa69fb6, cream: 0x7a7488 };
const MUZZLE = 0x26232b;
const WRINKLE = 0x8a8496;
const TEAR = 0x8fd8ff;
const RUFF = 0xfaf7f2;
const RUFF_RIB = 0xd8d4de;
/** The cape's hem (silver, never gold: combat-vfx.test keeps gold for "you"). */
export const SILVER = 0xd0d6de;
/** A tight curly pug tail over the rump. */
const TAIL: readonly (readonly [number, number, number])[] = [[0, 0.22, -0.13], [0.03, 0.3, -0.2], [0.0, 0.34, -0.15], [-0.02, 0.3, -0.12]];

/**
 * The black pug head: a wide round skull with a soft sheen on top, jowly cheeks, a flat dark muzzle with a big nose,
 * brow wrinkles, tragic raised eyebrows (the inner ends up), huge wet puppy eyes (three catchlights), a tongue tip and
 * one blue tear on his left cheek. Velvet folded ears.
 */
function actorPugHead(A: Assembly, coat: CoatSpec): void {
  const fur = C(coat.base as number);
  const sheen = C(coat.light as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => mixC(fur, sheen, smooth(0.2, 0.31, lp.y) * smooth(-0.08, 0.06, lp.z) * 0.6);
  A.add('head', new THREE.SphereGeometry(0.152, A.seg(20, 10), A.seg(14, 8)).scale(1.22, 0.95, 1.0).translate(0, 0.165, 0), { color: skin });
  for (const s of [1, -1]) A.add('head', new THREE.SphereGeometry(0.075, A.seg(9, 6), A.seg(7, 4)).scale(1, 0.85, 0.9).translate(s * 0.075, 0.09, 0.09), { color: skin });
  A.add('head', new THREE.SphereGeometry(0.075, A.seg(10, 6), A.seg(8, 5)).scale(1.2, 0.8, 0.72).translate(0, 0.1, 0.14), { color: MUZZLE });
  dogNose(A, [0, 0.132, 0.196], 0.032, 0x0c0a0e);
  // jowl creases (a lighter grey so they read on black)
  for (const s of [1, -1]) A.add('head', new THREE.TorusGeometry(0.036, 0.006, 3, 6, Math.PI * 0.6), { m: mat([s * 0.034, 0.112, 0.19], [-0.25, s * 0.4, -Math.PI * 0.8]), color: WRINKLE });
  // tragic eyebrows: the inner ends raised (the theatre "oh no" face)
  for (const s of [1, -1]) faceLine(A, [[s * 0.03, 0.262, 0.15], [s * 0.065, 0.252, 0.145], [s * 0.1, 0.236, 0.13]], 0.007, 0xc8c2cc);
  // tongue tip
  A.add('head', new THREE.SphereGeometry(0.022, 6, 4).scale(1, 0.5, 1), { m: mat([0.012, 0.058, 0.168]), color: 0xe58a93 });
  dogEyes(A, { inner: 0x9a6a44, outer: 0x4a2a1a, ring: 0x0c0a0c }, { x: 0.08, y: 0.185, z: 0.15, r: 0.052, pupil: 0.55 }, { wet: true });
  // the tear on his left cheek: a drop, point up
  A.add('head', new THREE.SphereGeometry(0.018, A.seg(8, 5), A.seg(6, 4)).scale(0.8, 1.2, 0.5), { m: mat([0.112, 0.128, 0.13], [0, 0.6, 0]), color: TEAR });
  A.add('head', new THREE.ConeGeometry(0.0125, 0.024, A.seg(6, 4)).scale(1, 1, 0.5), { m: mat([0.112, 0.153, 0.13], [0, 0.6, 0]), color: TEAR });
  // folded velvet ears
  for (const s of ['L', 'R'] as const) {
    const sign = s === 'L' ? 1 : -1;
    A.add(`ear${s}`, new THREE.SphereGeometry(0.075, A.seg(8, 5), A.seg(6, 4)).scale(0.95, 0.75, 0.32), { m: mat([sign * 0.03, -0.015, 0.03], [0.9, 0, sign * 0.9]), color: 0x2c2933 });
  }
}

/**
 * The Elizabethan ruff: a ring of flattened, alternating white and pale-lilac pleats round his neck (ribbed, so it
 * reads as a collar, not fluff).
 */
function ruff(A: Assembly): void {
  const n = A.detail >= 0.9 ? 16 : 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // each pleat a flattened disc standing out from the neck, tipped up a little
    A.add('chest', new THREE.SphereGeometry(0.07, A.seg(8, 5), A.seg(6, 4)).scale(0.5, 0.36, 1), {
      m: mat([Math.sin(a) * 0.13 * A.w, 0.235, Math.cos(a) * 0.125], [-0.25, a, 0]),
      color: i % 2 ? RUFF_RIB : RUFF,
    });
  }
}

/** The velvet cape: the full width of his outline from above (the team read), a high collar, a silver hem and clasp. */
function velvetCape(A: Assembly, color: Col, hem: Col): void {
  G.cape(A, color, hem, { len: 0.42, top: 0.17, bot: 0.34 });
  shawl(A, color, hem, { r: 0.2, y: 0.12 });
  // the silver clasp at his throat
  A.add('chest', new THREE.OctahedronGeometry(0.026, 0), { m: mat([0, 0.2, 0.15], [0, 0, 0], [1, 1, 0.6]), color: SILVER });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, capeColor, trim, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: 'solid', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 1.1, tier: 'hero', headScale: 1.1, bodyScale: 1.05, earsLow: 0.6, tailCurve: TAIL },
    coat,
    eyes: { inner: 0x9a6a44, outer: 0x4a2a1a, ring: 0x0c0a0c },
    earInner: 0x161418,
    nose: 0x0c0a0e,
    head: 'none',
    tail: { thick: 0.85 },
    detail,
    poses,
    gear: (A) => {
      actorPugHead(A, coat);
      velvetCape(A, capeColor, trim ?? SILVER);
      ruff(A);
      void t;
      extras(A);
    },
  };
}
