/**
 * Mochi (sim v29, original cat; build spec docs/plans/moba/ROSTER-V29.md §2.1 "Render"): everything the render needs
 * that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's Pillow Toss look) read the constants exported here. Import only types from
 * specs.ts (it imports this module).
 *
 * The silhouette is "the round one in the nightcap": a ragdoll cat (cream body, chocolate points, big blue eyes) as
 * round as a dumpling under a fluffy ruff, a long floppy team-coloured nightcap whose tip droops over one side with a
 * white pom-pom (the team read from the iso camera, and nothing else in the roster wears a soft cone), a team scarf,
 * and a fat square pillow hugged in both arms. The pillow is never team-coloured: it is cream with a pink heart.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';

/** Her poses: the pillow hug (both paws in front of the chest, round the pillow). */
export const POSES: Record<string, PoseDef> = {
  pillowHug: {
    joints: { chest: [0.04, 0, 0], head: [0.02, 0, 0.06], thighL: [0, 0.06, 0.06], thighR: [0, -0.06, -0.06], footL: [0, 0.25, 0], footR: [0, -0.25, 0] },
    arms: {
      L: { paw: [0.1, 0.32, 0.22], pole: [1, -0.6, -0.3], twist: [0, 0, -0.5] },
      R: { paw: [-0.1, 0.32, 0.22], pole: [-1, -0.6, -0.3], twist: [0, 0, 0.5] },
    },
    sword: { mode: 'hidden' },
  },
};

/** Idle and run hugging the pillow; cast 'cheer' (the pillow raised), attack 'paw' (a soft pillow bop). */
export const MOTION: MotionProfile = { idle: 'pillowHug', run: 'pillowHug', cast: 'cheer', attack: 'paw', stride: 0.95 };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 2.5;
/** Top of the bind-pose bounds (m: the nightcap's peak), measured from the built chibi (readability.test: within 4%). */
export const TOP = 3.33;
/** Relation ring under her (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.mochi.ring;
export const COLOR_CSS = '#ff9ec7';
/** A thick slow tail and soft ears under the cap. */
export const SPRINGS: SpringTuning = { tail: { k: 90, c: 10, lag: 0.6 }, ears: { k: 160, c: 14, lag: 0 } };
export const ULT_NAME = 'LULLABY';
/** Cast accent (combat-vfx.test: no gold-family colour): lullaby lilac. */
export const ACCENT: number | null = 0xc9a8ff;
/** Pillow Toss (projectileView look): size (m), height (m), colour, trail size. A fat cream pillow. */
export const SHOT: readonly [number, number, number, number] = [0.5, 1.0, 0xfff4ea, 0.26];

const COAT: CoatSpec = { pattern: 'points', base: 0xf6ecdc, deep: 0x6a4a38, light: 0xffffff, cream: 0xffffff };
const PILLOW = 0xfff4ea;
const HEART = 0xff7aa8;
const POM = 0xffffff;

/**
 * The nightcap: a long soft cone from the crown that bends over to her left, its tip hanging by her ear with a white
 * pom-pom, a white fur band round the brim. Built as a tube of shrinking rings along a curve.
 */
function nightcap(A: Assembly, color: Col): void {
  const pts = [new THREE.Vector3(0, 0.26, -0.01), new THREE.Vector3(0.02, 0.34, -0.03), new THREE.Vector3(0.1, 0.39, -0.04), new THREE.Vector3(0.2, 0.35, -0.02), new THREE.Vector3(0.25, 0.25, 0.0)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = A.seg(7, 5);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const r = 0.135 * (1 - t) + 0.02;
    const p = curve.getPoint(t);
    A.add('head', new THREE.SphereGeometry(r, A.seg(9, 6), A.seg(6, 4)).scale(1, 0.75, 1), { m: mat([p.x, p.y, p.z]), color });
  }
  const tip = curve.getPoint(1);
  A.add('head', new THREE.SphereGeometry(0.045, A.seg(8, 5), A.seg(6, 4)), { m: mat([tip.x, tip.y - 0.02, tip.z]), color: POM });
  A.add('head', new THREE.TorusGeometry(0.14, 0.03, A.seg(5, 3), A.seg(12, 8)), { m: mat([0, 0.25, -0.01], [Math.PI / 2 - 0.15, 0, 0], [1.05, 1, 1]), color: POM });
}

/** The pillow she hugs: a fat squircle cushion in front of her chest, with a pink heart on the front. */
function pillow(A: Assembly): void {
  const g = new THREE.SphereGeometry(1, A.seg(9, 6), A.seg(7, 5));
  const p = g.attributes.position;
  const sq = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), e);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, sq(p.getX(i), 0.45) * 0.17, sq(p.getY(i), 0.45) * 0.14, sq(p.getZ(i), 0.6) * 0.07);
  g.computeVertexNormals();
  A.add('chest', g, { m: mat([0, 0.04, 0.2], [0.15, 0, 0]), color: PILLOW });
  // the heart: two balls and a cone
  for (const s of [1, -1]) A.add('chest', new THREE.SphereGeometry(0.03, A.seg(8, 5), A.seg(6, 4)).scale(1, 1, 0.35), { m: mat([s * 0.024, 0.06, 0.272], [0.15, 0, 0]), color: HEART });
  A.add('chest', new THREE.ConeGeometry(0.048, 0.06, A.seg(8, 5)).rotateZ(Math.PI).scale(1, 1, 0.35), { m: mat([0, 0.03, 0.27], [0.15, 0, 0]), color: HEART });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, skinCoat, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'points', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  const fur = skinCoat ? skinCoat.light : lc ? lc.light : 0xffffff;
  return {
    rig: { width: 1.18, tier: 'hero', headScale: 1.28, bodyScale: 1.12, earsLow: 0.55, earSplay: 0.18 },
    coat,
    // big sky-blue ragdoll eyes
    eyes: { inner: 0xbfe6ff, outer: 0x4f9fe8, ring: 0x1c3e6e, size: 1.2 },
    earInner: 0xf2b8c4,
    nose: 0xe8909e,
    head: 'cat',
    ears: { size: 0.95 },
    cheeks: 1.05,
    face: 1.3,
    whiskers: false,
    blush: true,
    tail: { thick: 1.4 },
    detail,
    poses,
    gear: (A) => {
      G.fluffPuffs(A, A.detail >= 0.9 ? 4 : 3, fur);
      G.mantle(A, t.main, trim ?? 0xffffff, { r: 0.21, y: 0.15 });
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.22, top: 0.14, bot: 0.2 });
      nightcap(A, t.main);
      pillow(A);
      extras(A);
    },
  };
}
