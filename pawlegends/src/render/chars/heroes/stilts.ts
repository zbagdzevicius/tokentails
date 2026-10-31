/**
 * Stilts (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.4 "Chibi", "Moves and VFX"): everything the
 * render needs that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw) read the constants exported here. Import only types from specs.ts (it imports this module).
 *
 * Phase 0 scaffold: a placeholder chibi (her rig and coat, a team mantle and scarf-cape) until her own gear lands.
 */
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import type { ChibiSpec, CoatSpec } from '../chibi';
import { SPOT_FREQ } from '../chibi';
import * as G from '../gear';
import type { HeroDress, MotionProfile } from '../specs';

export const MOTION: MotionProfile = { idle: 'ready', run: 'stand', cast: 'boop', attack: 'claw', stride: 1.35 };
/** Standing height (m) in the match: the tallest cat. */
export const HEIGHT = 2.95;
/** Top of the bind-pose bounds (m), measured from the built chibi (readability.test: within 4%); re-measure after a rig or gear change. */
export const TOP = 2.83;
/** Relation ring under her (m). */
export const RING = 1.95;
export const COLOR_CSS = '#c9874a';
export const SPRINGS: SpringTuning = { tail: { k: 220, c: 13, lag: 0.6 }, ears: { k: 180, c: 12, lag: 0 } };
export const ULT_NAME = 'Zoomies!';
/** Cast accent: terracotta, not the gold-family SAND colour (combat-vfx.test: yellow means you). */
export const ACCENT: number | null = 0xd9734a;

const COAT: CoatSpec = { pattern: 'spots', base: 0xd9a66b, deep: 0x3a2a1c, light: 0xf2dcbc, cream: 0xfaf0e0, spotFreq: SPOT_FREQ };

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  return {
    rig: { width: 0.78, tier: 'lite', headScale: 0.9, bodyScale: 0.9, earsLow: 0 },
    coat: lc ? { pattern: 'spots', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light, spotFreq: SPOT_FREQ } : COAT,
    eyes: { inner: 0xd8e86a, outer: 0x8fae2c, ring: 0x2c3a14, size: 1.1 },
    earInner: 0xe8b0a0,
    nose: 0x8a4a3a,
    head: 'cat',
    ears: { size: 1.6 },
    cheeks: 0.7,
    face: 1.35,
    whiskers: true,
    tail: { thick: 0.7 },
    detail,
    poses,
    gear: (A) => {
      G.mantle(A, t.main, trim ?? t.second, { r: 0.22 });
      G.pauldrons(A, t.main, t.second, 0.8);
      G.cape(A, founder || chroma !== null ? capeColor : t.main, capeHem, { len: 0.34, top: 0.15, bot: 0.25 });
      G.legWarmers(A, t.main);
      extras(A);
    },
  };
}
