/**
 * Dusty (sim v31, original cat; build spec docs/plans/moba/ROSTER-V31.md §2.2 "Render"): everything the render needs
 * that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's corks) read the constants exported here. Import only types from specs.ts.
 *
 * The silhouette is "the one in the big hat": an orange tabby cowgirl under a wide-brimmed cowboy hat with a team
 * hatband (the read from the iso camera: the widest brim in the roster), a team bandana, a toy popgun in her right paw
 * with a cork in the muzzle on a string, and brown boots with brass spurs. The popgun is never team-coloured.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';

/** Her poses: none of her own; she stands and aims like the other shooters. */
export const POSES: Record<string, PoseDef> = {};

/** Idle and run standing, cast and wind-up 'aim' (the popgun up), attack 'shoot'. */
export const MOTION: MotionProfile = { idle: 'stand', run: 'stand', cast: 'aim', attack: 'shoot', aim: 'aim', stride: 1.15 };
export const HEIGHT = 2.5;
/** Top of the bind-pose bounds (m: the hat's crown), measured from the built chibi (readability.test: within 4%). */
export const TOP = 3.08;
export const RING = HERO_BUILD.dusty.ring;
export const COLOR_CSS = '#ff8a3d';
/** A bushy tabby tail that flicks and ears pressed under the hat. */
export const SPRINGS: SpringTuning = { tail: { k: 130, c: 9, lag: 0.45 }, ears: { k: 200, c: 16, lag: 0 } };
export const ULT_NAME = 'HIGH NOON';
/** Cast accent (combat-vfx.test: no gold-family colour): sunset orange-red. */
export const ACCENT: number | null = 0xff6a3a;
/** HIGH NOON's big corks (projectileView look): size (m), height (m), colour, trail size. A tan cork. */
export const SHOT: readonly [number, number, number, number] = [0.3, 1.1, 0xd8a868, 0.18];

const COAT: CoatSpec = { pattern: 'tabby', base: 0xe8954a, deep: 0xa85a22, light: 0xffe4c4, cream: 0xffe4c4 };
const HAT = 0x8a5a34;
const GUN_WOOD = 0x9a6a3a;
const CORK = 0xd8a868;

/** The cowboy hat: a pinched crown and a wide brim curled up at the sides, a team band round the crown. */
function cowboyHat(A: Assembly, band: Col): void {
  const y = 0.31;
  const brim = new THREE.CylinderGeometry(0.29, 0.29, 0.016, A.seg(18, 10));
  // curl the brim's sides up a little
  const p = brim.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, p.getY(i) + Math.pow(Math.abs(x) / 0.29, 3) * 0.06);
  }
  brim.computeVertexNormals();
  A.add('head', brim, { m: mat([0, y, -0.01], [0.12, 0, 0]), color: HAT });
  A.add('head', new THREE.CylinderGeometry(0.13, 0.155, 0.13, A.seg(14, 8)).scale(1, 1, 1.15), { m: mat([0, y + 0.07, -0.015], [0.12, 0, 0]), color: HAT });
  // the pinch on top: team-coloured felt, so the team reads from the iso camera over the wide brim
  A.add('head', new THREE.SphereGeometry(0.135, A.seg(12, 7), A.seg(5, 3), 0, Math.PI * 2, 0, Math.PI * 0.35).scale(1, 0.45, 1.15), { m: mat([0, y + 0.12, -0.02], [0.12, 0, 0]), color: band });
  A.add('head', new THREE.CylinderGeometry(0.157, 0.157, 0.045, A.seg(14, 8), 1, true).scale(1, 1, 1.15), { m: mat([0, y + 0.035, -0.012], [0.12, 0, 0]), color: band });
  // a team trim round the brim's edge
  A.add('head', new THREE.TorusGeometry(0.285, 0.018, 3, A.seg(20, 12)), { m: mat([0, y + 0.06, -0.01], [Math.PI / 2 + 0.12, 0, 0]), color: band });
}

/** The popgun on the weapon socket: a wooden stock, a steel barrel, a cork in the muzzle on a string. */
function popgun(A: Assembly): void {
  A.add('weapon', new THREE.BoxGeometry(0.06, 0.12, 0.05), { m: mat([0, -0.02, 0.02]), color: GUN_WOOD });
  A.add('weapon', new THREE.CylinderGeometry(0.024, 0.028, 0.26, A.seg(8, 5)), { m: mat([0, 0.15, 0.02]), color: G.STEEL });
  A.add('weapon', new THREE.CylinderGeometry(0.028, 0.022, 0.05, A.seg(8, 5)), { m: mat([0, 0.3, 0.02]), color: CORK });
  A.add('weapon', new THREE.CylinderGeometry(0.004, 0.004, 0.2, 3), { m: mat([0.03, 0.2, 0.02], [0, 0, 0.12]), color: 0xfff4e0 });
}

/** Spurs: a small brass star at each heel. */
function spurs(A: Assembly): void {
  for (const s of ['L', 'R'] as const) A.add(`foot${s}`, new THREE.OctahedronGeometry(0.03, 0).scale(1, 1, 0.3), { m: mat([0, 0.03, -0.09]), color: G.BRASS });
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: lc.pattern ?? 'tabby', ...(lc.patch !== undefined ? { patch: lc.patch } : {}), base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 0.95, tier: 'hero', headScale: 1.2, earSplay: 0.2 },
    coat,
    // honey eyes under the brim
    eyes: { inner: 0xffe08a, outer: 0xd88a2a, ring: 0x4a2a10, size: 1.12 },
    earInner: 0xf2a890,
    nose: 0xd86a5a,
    head: 'cat',
    ears: { size: 1.0 },
    cheeks: 0.9,
    face: 1.3,
    whiskers: true,
    tail: { thick: 1.1 },
    armoured: { feet: true },
    detail,
    poses,
    gear: (A) => {
      G.mantle(A, t.main, trim ?? 0xffffff, { r: 0.19, y: 0.15 });
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.24 });
      cowboyHat(A, t.main);
      popgun(A);
      G.boots(A, HAT, G.BRASS);
      spurs(A);
      extras(A);
    },
  };
}
