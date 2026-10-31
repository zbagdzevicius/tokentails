/**
 * Pixel (sim v11, original cat; build spec docs/plans/moba/CATS-V11.md §2.2 "Chibi", "Moves and VFX"): everything the
 * render needs that is hers alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase,
 * views/models.ts HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and
 * heroAccentRaw, projectileView.ts's Cap Cannon look) read the constants exported here. Import only types from
 * specs.ts (it imports this module).
 *
 * Phase 0 scaffold: a placeholder chibi (her rig and coat, a team mantle and cape) until the cardboard box lands.
 */
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import type { ChibiSpec, CoatSpec } from '../chibi';
import * as G from '../gear';
import type { HeroDress, MotionProfile } from '../specs';

export const MOTION: MotionProfile = { idle: 'stand', run: 'stand', cast: 'aim', attack: 'shoot', aim: 'aim', stride: 0.85 };
/** Standing height (m) in the match. */
export const HEIGHT = 2.3;
/** Top of the bind-pose bounds (m), measured from the built chibi (readability.test: within 4%); re-measure after a rig or gear change. */
export const TOP = 2.16;
/** Relation ring under her (m). */
export const RING = 1.9;
export const COLOR_CSS = '#7fc8e8';
export const SPRINGS: SpringTuning = { tail: { k: 140, c: 12, lag: 0.55 }, ears: { k: 160, c: 12, lag: 0 } };
export const ULT_NAME = 'BOXBOT!';
/** Cast accent; null = her element colour (ICE). */
export const ACCENT: number | null = null;
/** Cap Cannon's bolt (projectileView look): size (m), height (m), colour, trail size. */
export const SHOT: readonly [number, number, number, number] = [0.3, 1.0, 0xc8d4e0, 0.16];

const COAT: CoatSpec = { pattern: 'tuxedo', base: 0x2a2a33, deep: 0x16161c, light: 0xf4f4f4, cream: 0xf4f4f4 };

export function spec(_look: Look, detail: number, dr: HeroDress): ChibiSpec {
  const { t, founder, chroma, capeColor, trim, capeHem, extras, poses, lc } = dr;
  return {
    // spec target: tier 'kid', headScale 1.35, bodyScale 0.8 with the box raising the head (the upright test needs it)
    rig: { width: 0.85, tier: 'hero', headScale: 1.0, bodyScale: 0.9 },
    coat: lc ? { pattern: 'tuxedo', base: lc.base, deep: lc.dark, light: lc.light, cream: lc.light } : COAT,
    eyes: { inner: 0xbfe8ff, outer: 0x4fa8d9, ring: 0x1a3a5a, size: 1.3 },
    earInner: 0xffb3c8,
    nose: 0xff9fb1,
    head: 'cat',
    ears: { size: 1.12 },
    cheeks: 0.7,
    face: 1.35,
    whiskers: true,
    tail: { thick: 0.85 },
    detail,
    poses,
    gear: (A) => {
      G.mantle(A, t.main, trim ?? t.second, { r: 0.23 });
      G.pauldrons(A, t.main, t.second, 0.9);
      G.cape(A, founder || chroma !== null ? capeColor : t.main, capeHem, { len: 0.3, top: 0.15, bot: 0.25 });
      G.cardboardBox(A, 0xc49a6c, t.main);
      extras(A);
    },
  };
}
