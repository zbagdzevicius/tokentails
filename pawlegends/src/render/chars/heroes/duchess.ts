/**
 * Duchess (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.3 "Chibi", "Moves and VFX"): everything
 * the render needs that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's Fluff Puff look) read the constants exported here. Import only types from
 * specs.ts (it imports this module).
 *
 * The silhouette is a cloud on a cushion: a cream Persian whose body is buried in fur puffs (chest, neck ruff, hips)
 * with a plume tail over the back, sitting on a team-coloured velvet cushion with gold tassels, a tiara on top. From
 * the iso camera the cushion top and the mantle are the team read, and nothing else in the roster is a round cloud on
 * a flat square.
 *
 * Why she "stands": the shared pose library has no floating sit, and the upright gate (chars.test) measures the head
 * against the hips in the idle pose. So her rig stands in `stand` and the cushion is worn on the hips at shin height:
 * it hides the legs (no feet: `armoured.feet` drops them), rides the hips' bob as she glides (the float) and the gait
 * keeps a very short stride so no paw pokes out. The move set's idle clip lifts the root a few centimetres on a slow
 * bob, so at rest the cushion visibly hovers.
 */
import * as THREE from 'three';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import { mat, mix, type Assembly, type ChibiSpec, type Col, type CoatSpec, type RGB } from '../chibi';
import * as G from '../gear';
import type { HeroDress, MotionProfile } from '../specs';

/** Idle and run standing inside the cushion (see the header); cast 'groom' (a paw to the face), attack 'paw' (a flick). */
export const MOTION: MotionProfile = { idle: 'stand', run: 'stand', cast: 'groom', attack: 'paw', stride: 0.35 };
/** Standing height (m) in the match. */
export const HEIGHT = 2.6;
/** Top of the bind-pose bounds (m), measured from the built chibi (readability.test: within 4%); re-measure after a rig or gear change. */
export const TOP = 2.7;
/** Relation ring under her (m): the cushion is wide. */
export const RING = 2.2;
export const COLOR_CSS = '#8a5cd6';
/** A heavy plume tail (slow, lagging) and small ears that barely twitch. */
export const SPRINGS: SpringTuning = { tail: { k: 80, c: 10, lag: 0.65 }, ears: { k: 200, c: 16, lag: 0 } };
export const ULT_NAME = 'Begone!';
/** Cast accent; null = her element colour (DARK). */
export const ACCENT: number | null = null;
/** Fluff Puff's bolt (projectileView look): size (m), height (m), colour, trail size. A fat slow cream ball. */
export const SHOT: readonly [number, number, number, number] = [0.62, 0.9, 0xfff6ee, 0.3];

/** Her signature colours (render only). */
export const ROYAL = 0x8a5cd6;
export const CREAM = 0xfffaf2;
export const SILVER = 0xdfe6ee;
export const TASSEL = 0xe8c27a;

const COAT: CoatSpec = { pattern: 'solid', base: 0xf4ece0, deep: 0xd8c8b0, light: 0xffffff, cream: 0xffffff };
/** Plume curl: up the back and over it, the tip toward the head (root space, H). */
const PLUME: readonly (readonly [number, number, number])[] = [[0, 0.24, -0.14], [0.05, 0.36, -0.3], [0.07, 0.55, -0.28], [0.03, 0.64, -0.14]];

type Flat = number | string | RGB;
const rgbOf = (c: Flat): RGB => G.rgbOf(c);

// ------------------------------------------------------------------------------------------------ gear builders

/**
 * The velvet cushion she floats on, worn on the hips at shin height: a pillow (a superellipsoid: flat top, rounded
 * square corners) whose top is the team colour and whose sides and piping are `side`, with a gold tassel at each
 * corner. ~200 triangles plus the tassels.
 */
export function velvetCushion(A: Assembly, top: Col, side: Col, tassel: Col, o: { y?: number; size?: number; thick?: number } = {}): void {
  const s = (o.size ?? 0.3) * A.w;
  const h = o.thick ?? 0.058;
  const y = o.y ?? -0.2;
  const g = new THREE.SphereGeometry(1, A.seg(16, 10), A.seg(8, 6));
  const p = g.attributes.position;
  // a squircle pillow: push each vertex toward a rounded square (exponent < 1), the top flattened
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const yy = p.getY(i);
    const z = p.getZ(i);
    const sq = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), e);
    p.setXYZ(i, sq(x, 0.45) * s, sq(yy, 0.6) * h, sq(z, 0.45) * s);
  }
  g.computeVertexNormals();
  const tc = typeof top === 'function' ? top : rgbOf(top as Flat);
  const sc = typeof side === 'function' ? side : rgbOf(side as Flat);
  A.add('hips', g, { m: mat([0, y, 0]), color: (v, nn, lp, i) => (nn.y > 0.45 ? (typeof tc === 'function' ? tc(v, nn, lp, i) : tc) : typeof sc === 'function' ? sc(v, nn, lp, i) : sc) });
  // piping round the top edge
  A.add('hips', new THREE.TorusGeometry(s * 0.93, 0.012, 3, A.seg(16, 8)), { m: mat([0, y + h * 0.55, 0], [Math.PI / 2, 0, Math.PI / 4], [1, 1, 1]), color: tassel });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const cx = sx * s * 0.86;
    const cz = sz * s * 0.86;
    A.add('hips', new THREE.SphereGeometry(0.018, 5, 3), { m: mat([cx, y, cz]), color: tassel });
    A.add('hips', new THREE.ConeGeometry(0.02, 0.045, 5), { m: mat([cx * 1.02, y - 0.03, cz * 1.02], [Math.PI, 0, 0]), color: tassel });
  }
}

/** Her tiara: a thin band round the crown and three gem cones (the tallest in the middle). */
export function tiara(A: Assembly, band: Col, gem: Col): void {
  const y = 0.255;
  A.add('head', new THREE.TorusGeometry(0.11, 0.011, 3, A.seg(14, 8)), { m: mat([0, y, 0.01], [Math.PI / 2 - 0.2, 0, 0]), color: band });
  for (const [x, hgt, z] of [[0, 0.075, 0.115], [0.055, 0.05, 0.1], [-0.055, 0.05, 0.1]] as const) {
    A.add('head', new THREE.ConeGeometry(0.016, hgt, 4), { m: mat([x, y + hgt / 2 + 0.01, z - 0.02], [-0.2, Math.PI / 4, 0]), color: band });
    A.add('head', new THREE.OctahedronGeometry(0.014, 0), { m: mat([x, y + 0.012, z - 0.005]), color: gem });
  }
}

/** A silver comb in the right paw (her groom cast and her "hmph" flick). */
export function comb(A: Assembly, color: Col): void {
  A.add('pawR', new THREE.BoxGeometry(0.11, 0.025, 0.012), { m: mat([0, -0.05, 0.06], [0, 0, 0.2]), color });
  for (let i = 0; i < 5; i++) A.add('pawR', new THREE.BoxGeometry(0.008, 0.035, 0.008), { m: mat([-0.044 + i * 0.022, -0.078 - i * 0.004, 0.06], [0, 0, 0.2]), color });
}

// ------------------------------------------------------------------------------------------------ the chibi

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, skinCoat, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  const coat: CoatSpec = lc ? { pattern: 'solid', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT;
  const fur = skinCoat ? skinCoat.light : lc ? lc.light : CREAM;
  return {
    rig: { width: 1.15, tier: 'hero', headScale: 1.15, bodyScale: 1.05, earsLow: 0.7, earSplay: 0.2, tailCurve: PLUME },
    coat,
    // copper eyes, big and round
    eyes: { inner: 0xf2a65e, outer: 0xb5621f, ring: 0x4a2410, size: 1.15 },
    earInner: 0xf2b8b8,
    nose: 0xe89a9a,
    head: 'cat',
    ears: { size: 0.7 },
    cheeks: 1.15,
    face: 0.75,
    whiskers: false,
    blush: true,
    tail: { thick: 1.7 },
    armoured: { feet: true },
    detail,
    poses,
    gear: (A) => {
      velvetCushion(A, t.main, mix(rgbOf(t.deep), [0, 0, 0], 0.1), TASSEL);
      G.fluffPuffs(A, A.detail >= 0.9 ? 8 : 7, fur);
      G.mantle(A, t.main, founder ? 0xffd34d : (trim ?? t.second), { r: 0.22, y: 0.14 });
      // a founder or chroma look adds the short cape (its hem carries the chroma); the default look has none
      if (founder || chroma !== null) G.cape(A, capeColor, capeHem, { len: 0.24, top: 0.15, bot: 0.22 });
      tiara(A, SILVER, chroma ?? ROYAL);
      comb(A, SILVER);
      extras(A);
    },
  };
}
