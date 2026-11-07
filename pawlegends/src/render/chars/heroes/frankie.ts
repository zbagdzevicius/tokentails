/**
 * Frankie (sim v15, original dog; build spec docs/plans/moba/DOGS-V15.md §1): everything the render needs that is
 * this hero's alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase, views/models.ts
 * HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS, effects.ts ultName and heroAccentRaw) read the
 * constants exported here.
 *
 * PLACEHOLDER (LANE SIM compile stub): until the RENDER lane draws the real model, the hero is drawn as `BODY` (an
 * existing dog), with that body's motion, height and springs. Never ship this art (DOGS-V15 §7 art gate).
 */
import type { HeroId } from '../../../sim/api';
import type { SpringTuning } from '../../anim/types';
import type { Look } from '../../cosmetics';
import type { ChibiSpec } from '../chibi';
import type { PoseDef } from '../skeleton';
import type { HeroDress, MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';
import * as BASE from './nugget';

/** The existing dog this placeholder is drawn as. */
export const BODY: HeroId = 'nugget';
/** No poses of his own yet (the placeholder body's are registered by its module). */
export const POSES: Record<string, PoseDef> = {};
export const MOTION: MotionProfile = BASE.MOTION;
/** Standing height (m) in the match (the placeholder body's). */
export const HEIGHT = BASE.HEIGHT;
/** Top of the bind-pose bounds (m), the placeholder body's. */
export const TOP = BASE.TOP;
/** Relation ring under the hero (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.frankie.ring;
export const COLOR_CSS = '#d4a017';
export const SPRINGS: SpringTuning = BASE.SPRINGS;
export const ULT_NAME = 'FOOTLONG!';
/** Cast accent (combat-vfx.test: no gold-family colour). */
export const ACCENT: number | null = 0xff7a5c;

export function spec(look: Look, detail: number, dr: HeroDress): ChibiSpec {
  return BASE.spec(look, detail, dr);
}
