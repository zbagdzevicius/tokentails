/**
 * Duchess (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.3 "Chibi", "Moves and VFX"): everything
 * the render needs that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's Fluff Puff look) read the constants exported here. Import only types from
 * specs.ts (it imports this module).
 *
 * Phase 0 scaffold: a placeholder chibi (her rig and coat, a team mantle and cape) until the cushion and fluff land.
 */
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import type { ChibiSpec, CoatSpec } from '../chibi';
import * as G from '../gear';
import type { HeroDress, MotionProfile } from '../specs';

/** Spec target: idle and run 'sit' on the floating cushion (root lifted); the scaffold stands until the cushion lands. */
export const MOTION: MotionProfile = { idle: 'stand', run: 'stand', cast: 'groom', attack: 'paw', stride: 0.8 };
/** Standing height (m) in the match. */
export const HEIGHT = 2.6;
/** Top of the bind-pose bounds (m), measured from the built chibi (readability.test: within 4%); re-measure after a rig or gear change. */
export const TOP = 2.57;
/** Relation ring under her (m). */
export const RING = 2.1;
export const COLOR_CSS = '#8a5cd6';
export const SPRINGS: SpringTuning = { tail: { k: 140, c: 12, lag: 0.55 }, ears: { k: 160, c: 12, lag: 0 } };
export const ULT_NAME = 'Begone!';
/** Cast accent; null = her element colour (DARK). */
export const ACCENT: number | null = null;
/** Fluff Puff's bolt (projectileView look): size (m), height (m), colour, trail size. */
export const SHOT: readonly [number, number, number, number] = [0.5, 1.0, 0xfff6ee, 0.26];

const COAT: CoatSpec = { pattern: 'solid', base: 0xf4ece0, deep: 0xd8c8b0, light: 0xffffff, cream: 0xffffff };

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  return {
    rig: { width: 1.15, tier: 'hero', headScale: 1.15, bodyScale: 1.05, earsLow: 0.7, earSplay: 0.2 },
    coat: lc ? { pattern: 'solid', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT,
    eyes: { inner: 0xf2a65e, outer: 0xb5621f, ring: 0x4a2410, size: 1.15 },
    earInner: 0xf2b8b8,
    nose: 0xe89a9a,
    head: 'cat',
    ears: { size: 0.7 },
    cheeks: 1.15,
    face: 0.75,
    whiskers: false,
    tail: { thick: 1.7 },
    detail,
    poses,
    gear: (A) => {
      G.mantle(A, t.main, trim ?? t.second, { r: 0.23 });
      G.cape(A, founder || chroma !== null ? capeColor : t.main, capeHem, { len: 0.3, top: 0.15, bot: 0.25 });
      G.fluffPuffs(A, 6, 0xfffaf2);
      G.tiara(A, 0xdfe6ee, 0x8a5cd6);
      extras(A);
    },
  };
}
