/**
 * Meatball (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.1 "Chibi", "Moves and VFX"): everything
 * the render needs that is his alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw) read the constants exported here. Import only types from specs.ts (it imports this module).
 *
 * Phase 0 scaffold: a placeholder chibi (his rig and coat, a team mantle and cape) until his own gear lands.
 */
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import type { ChibiSpec, CoatSpec } from '../chibi';
import * as G from '../gear';
import type { HeroDress, MotionProfile } from '../specs';

export const MOTION: MotionProfile = { idle: 'sit', run: 'stand', cast: 'block', attack: 'bash', stride: 0.9 };
/** Standing height (m) in the match. */
export const HEIGHT = 2.5;
/** Top of the bind-pose bounds (m), measured from the built chibi (readability.test: within 4%); re-measure after a rig or gear change. */
export const TOP = 2.9;
/** Relation ring under him (m). */
export const RING = 2.25;
export const COLOR_CSS = '#d9662b';
export const SPRINGS: SpringTuning = { tail: { k: 140, c: 12, lag: 0.55 }, ears: { k: 160, c: 12, lag: 0 } };
export const ULT_NAME = 'Chonk!';
/** Cast accent; null = his element colour (GRASS). */
export const ACCENT: number | null = null;

const COAT: CoatSpec = { pattern: 'tabby', base: 0xe07a35, deep: 0xb5521f, light: 0xf2a65e, cream: 0xfbe3c4, stripe: 0.5 };

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  return {
    rig: { width: 1.35, tier: 'hero', headScale: 0.95, bodyScale: 1.25, earsLow: 0.25 },
    coat: lc ? { pattern: 'tabby', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT,
    eyes: { inner: 0xbfe36a, outer: 0x6f9a2a, ring: 0x2c3a14, size: 0.85 },
    earInner: 0xf2a6a0,
    nose: 0xd9706a,
    head: 'cat',
    ears: { size: 1.12 },
    cheeks: 0.9,
    face: 1.4,
    whiskers: true,
    blush: true,
    tail: { thick: 1.4 },
    detail,
    poses,
    gear: (A) => {
      G.mantle(A, t.main, trim ?? t.second, { r: 0.23 });
      G.cape(A, founder || chroma !== null ? capeColor : t.main, capeHem, { len: 0.3, top: 0.15, bot: 0.26 });
      G.fishLunchbox(A, 0x7fb0d9);
      extras(A);
    },
  };
}
