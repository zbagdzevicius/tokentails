/**
 * Marshmallow (sim v13, original dog; build spec docs/plans/moba/DOGS-V13.md §1.2 "Render"): everything the render
 * needs that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw) read the constants exported here. Import only types from specs.ts (it imports this module).
 *
 * The other cute one: a Samoyed puppy. From the iso camera she is "the white ball with a hat": a smooth round white
 * body (no fluff puffs: Duchess is the fluffy one), a big round head with puffy cheeks, small rounded ears poking out
 * under a team bobble hat, the Samoyed smile (a black lip line with upturned corners and a pink tongue), black
 * button eyes, and a plume tail curled over her back. Team colour on the hat and the scarf.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import { blushDots, C, dogEyes, dogNose, faceLine, mixC, pointedEar, smooth, shawl } from './dogParts';

/** Her poses: a puppy sit with the head tilted (the cute idle) and a two-paw ready stance. */
export const POSES: Record<string, PoseDef> = {
  pupSit: {
    body: { p: [0, -0.1, -0.02] },
    joints: { hips: [-0.16, 0, 0], chest: [0.08, 0, 0], head: [0.02, 0, 0.22], thighL: [-1.45, 0.25, 0.14], thighR: [-1.45, -0.25, -0.14], kneeL: [0.25, 0, 0], kneeR: [0.25, 0, 0], footL: [-0.3, 0.3, 0], footR: [-0.3, -0.3, 0] },
    arms: { L: { fk: { shoulder: [-0.3, 0, 0.08], elbow: [-0.3, 0, 0] } }, R: { fk: { shoulder: [-0.3, 0, -0.08], elbow: [-0.3, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  pupReady: {
    joints: { chest: [0.05, 0, 0], head: [-0.08, 0, 0.1], thighL: [-0.15, 0.1, 0.08], thighR: [-0.15, -0.1, -0.08], kneeL: [0.3, 0, 0], kneeR: [0.3, 0, 0], footL: [-0.1, 0.3, 0], footR: [-0.1, -0.3, 0] },
    arms: { L: { fk: { shoulder: [-0.7, 0, 0.25], elbow: [-0.9, 0, 0] } }, R: { fk: { shoulder: [-0.7, 0, -0.25], elbow: [-0.9, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  // The Belly Slide: flat on her belly (the body turned a quarter forward, lowered), paws stretched out ahead.
  bellySlide: {
    body: { p: [0, 0.17, -0.28], r: [Math.PI / 2, 0, 0] },
    joints: { head: [-1.25, 0, 0], thighL: [0.15, 0, 0.1], thighR: [0.15, 0, -0.1] },
    arms: { L: { fk: { shoulder: [-2.8, 0, 0.2], elbow: [0, 0, 0] } }, R: { fk: { shoulder: [-2.8, 0, -0.2], elbow: [0, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
  // SNOW DAY!'s snow angel: on her back (the body turned a quarter backward, lowered), arms and legs spread.
  snowAngel: {
    body: { p: [0, 0.17, 0.28], r: [-Math.PI / 2, 0, 0] },
    joints: { head: [0.45, 0, 0], thighL: [-0.4, 0, 0.6], thighR: [-0.4, 0, -0.6] },
    arms: { L: { fk: { shoulder: [-0.2, 0, 1.5], elbow: [0, 0, 0] } }, R: { fk: { shoulder: [-0.2, 0, -1.5], elbow: [0, 0, 0] } } },
    sword: { mode: 'hidden' },
  },
};

/** Idle sits with a head tilt, runs on a bouncy puppy hop, casts with a cheer, attacks with a two-paw toss. */
export const MOTION: MotionProfile = { idle: 'pupSit', run: 'pupReady', cast: 'cheer', attack: 'paw', stride: 1.25 };
/** Authored standing height (m); the match draws HEIGHT × HERO_BUILD.h. */
export const HEIGHT = 2.15;
/** Top of the bind-pose bounds (m: the bobble), measured from the built chibi (readability.test: within 4%). */
export const TOP = 2.85;
/** Relation ring under her (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.marshmallow.ring;
export const COLOR_CSS = '#e8f4ff';
/** A soft, swishy plume and small ears. */
export const SPRINGS: SpringTuning = { tail: { k: 90, c: 7, lag: 0.5 }, ears: { k: 120, c: 9, lag: 0 } };
export const ULT_NAME = 'SNOW DAY!';
/** Cast accent (combat-vfx.test: no gold-family colour). */
export const ACCENT: number | null = 0x9fe8ff;

/** Smooth white: no pattern, a faint warm shade underneath. */
const COAT: CoatSpec = { pattern: 'solid', base: 0xf8f6f2, deep: 0xdcd6cc, light: 0xffffff, cream: 0xffffff };
const EAR_PINK = 0xf8c4cc;
const KNIT_WHITE = 0xfaf6ee;
/** The plume tail: up off the rump and curled forward over her back. */
const TAIL: readonly (readonly [number, number, number])[] = [[0, 0.22, -0.13], [0, 0.34, -0.26], [0, 0.5, -0.25], [0, 0.55, -0.13]];

/**
 * The Samoyed puppy head: a big round white skull, puffy cheeks, a short muzzle with a black nose, the smile (a black
 * lip line with upturned corners, a pink tongue in it), black button eyes with big catchlights, pink blush, and
 * small rounded ears.
 */
function samoyedHead(A: Assembly, coat: CoatSpec): void {
  const white = C(coat.base as number);
  const shade = C(coat.deep as number);
  const skin = (_v: THREE.Vector3, _n: THREE.Vector3, lp: THREE.Vector3): RGB => mixC(white, shade, smooth(0.0, -0.14, lp.z) * 0.5 + smooth(0.12, 0.04, lp.y) * 0.2);
  A.add('head', new THREE.SphereGeometry(0.158, A.seg(20, 10), A.seg(14, 8)).scale(1.16, 1.0, 1.04).translate(0, 0.17, 0), { color: skin });
  // the puffy cheeks
  for (const s of [1, -1]) A.add('head', new THREE.SphereGeometry(0.082, A.seg(10, 6), A.seg(7, 4)).scale(1, 0.88, 0.85).translate(s * 0.095, 0.1, 0.06), { color: skin });
  // the short muzzle
  A.add('head', new THREE.SphereGeometry(0.062, A.seg(12, 7), A.seg(8, 5)).scale(1.08, 0.78, 1.0).translate(0, 0.108, 0.148), { color: white });
  dogNose(A, [0, 0.13, 0.206], 0.024);
  // the Samoyed smile: a wide black lip line, corners turned up, a pink tongue inside it
  faceLine(A, [[-0.062, 0.112, 0.168], [-0.05, 0.096, 0.186], [-0.026, 0.084, 0.199], [0, 0.081, 0.203], [0.026, 0.084, 0.199], [0.05, 0.096, 0.186], [0.062, 0.112, 0.168]], 0.0055, 0x1a1216);
  A.add('head', new THREE.SphereGeometry(0.024, A.seg(8, 5), A.seg(6, 4)).scale(1.1, 0.6, 0.6), { m: mat([0, 0.078, 0.195], [0.3, 0, 0]), color: 0xf47a90 });
  dogEyes(A, { inner: 0x3a2a26, outer: 0x1a1214, ring: 0x0a0808 }, { x: 0.068, y: 0.192, z: 0.135, r: 0.045 }, { wet: true });
  blushDots(A, 0.1, 0.128, 0.115, 0.028);
  // small triangle ears with soft tips, poking up out of the hat (the Samoyed read: never round bear ears)
  for (const s of ['L', 'R'] as const) pointedEar(A, s, { r: 0.062, h: 0.135, depth: 0.55, tilt: 0.12, lean: -0.1, y: 0.0, outer: white, inner: EAR_PINK });
}

/**
 * The bobble hat: a knit crown in the team colour over the top of the skull, a cream ribbed cuff, and a white
 * pompom on top (the silhouette's mark).
 */
function bobbleHat(A: Assembly, color: Col): void {
  const at = mat([0, 0.2, -0.012], [-0.1, 0, 0], [1.17, 0.98, 1.1]);
  A.add('head', new THREE.SphereGeometry(0.162, A.seg(16, 9), A.seg(7, 4), 0, Math.PI * 2, 0, Math.PI * 0.42), { m: at, color });
  const rimY = Math.cos(Math.PI * 0.42) * 0.162;
  const rimR = Math.sin(Math.PI * 0.42) * 0.162;
  A.add('head', new THREE.CylinderGeometry(rimR * 1.02, rimR * 1.06, 0.045, A.seg(16, 9), 1, true), { m: at.clone().multiply(mat([0, rimY - 0.012, 0])), color: KNIT_WHITE });
  // knit ribs on the crown (darker lines from the cuff up)
  A.add('head', new THREE.IcosahedronGeometry(0.058, A.detail >= 0.9 ? 1 : 0), { m: mat([0, 0.385, -0.03]), color: KNIT_WHITE });
}

/** The scarf: a team mantle with two knitted tails hanging down her chest, cream fringe. */
function scarf(A: Assembly, color: Col, trim: Col): void {
  shawl(A, color, trim, { r: 0.19, y: 0.17 });
  for (const [x, len, rz] of [[0.05, 0.16, 0.12], [-0.02, 0.12, -0.08]] as const) {
    A.add('chest', new THREE.BoxGeometry(0.06, len, 0.022), { m: mat([x, 0.19 - len / 2, 0.15], [-0.3, 0, rz]), color });
    A.add('chest', new THREE.BoxGeometry(0.062, 0.02, 0.024), { m: mat([x + Math.sin(rz) * len * 0.5, 0.19 - len - 0.005, 0.15 + len * 0.15], [-0.3, 0, rz]), color: KNIT_WHITE });
  }
}

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: 'solid', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  return {
    rig: { width: 1.3, tier: 'kid', headScale: 1.15, bodyScale: 1.2, tailCurve: TAIL },
    coat,
    eyes: { inner: 0x3a2a26, outer: 0x1a1214, ring: 0x0a0808 },
    earInner: EAR_PINK,
    nose: 0x1a1216,
    head: 'none',
    tail: { thick: 1.75 },
    detail,
    poses,
    gear: (A) => {
      samoyedHead(A, coat);
      bobbleHat(A, t.main);
      scarf(A, t.main, trim ?? KNIT_WHITE);
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.2, top: 0.14, bot: 0.2 });
      extras(A);
    },
  };
}
