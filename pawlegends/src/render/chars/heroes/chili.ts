/**
 * Chili (sim v13, original dog; build spec docs/plans/moba/DOGS-V13.md §1): everything the render needs that is
 * this hero's alone. The shared tables (specs.ts HERO_MOTION / HERO_HEIGHT / HERO_TOP and heroBase, views/models.ts
 * HERO_RING, palette.ts HERO_COLOR_CSS, anim/common.ts HERO_SPRINGS) read the constants exported here.
 *
 * PLACEHOLDER (LANE SIM compile stub): until the RENDER lane draws the real model, the hero is drawn as `BODY` (an
 * existing dog), with that body's motion, height and springs. Never ship this art (DOGS-V13 §7 art gate).
 */
import type { HeroId } from '../../../sim/api';
import type { SpringTuning } from '../../anim/types';
import type { MotionProfile } from '../specs';
import { HERO_BUILD } from '../heroSize';

/** The existing dog this placeholder is drawn as. */
export const BODY: HeroId = 'cacklejaw';
export const MOTION: MotionProfile = { idle: 'clawReady', run: 'clawReady', cast: 'cheer', attack: 'claw', stride: 1.25 };
/** Standing height (m) in the match (the placeholder body's). */
export const HEIGHT = 2.65;
/** Top of the bind-pose bounds (m), the placeholder body's. */
export const TOP = 2.95;
/** Relation ring under the hero (m, from heroSize.ts HERO_BUILD). */
export const RING = HERO_BUILD.chili.ring;
export const COLOR_CSS = '#ff5a3c';
export const SPRINGS: SpringTuning = { tail: { k: 110, c: 9, lag: 0.5 }, ears: { k: 70, c: 6, lag: 0 } };
export const ULT_NAME = 'BIG DOG ENERGY';
/** Cast accent (combat-vfx.test: no gold-family colour). */
export const ACCENT: number | null = 0xff6a3d;
