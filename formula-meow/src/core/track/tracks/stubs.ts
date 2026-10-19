/**
 * Iteration 2 Stabilise shipped stub loops for the four new circuits and the battle arena; the tracks lane made each
 * one real in its own file. This module keeps the Stabilise export names for anything that imported them.
 */
import type { TrackDef } from '../../../types';
import { LAUNDRY } from './laundry';
import { YARN } from './yarn';
import { CAFE } from './cafe';
import { SHELTER } from './shelter';
import { RUG } from './rug';

export { LAUNDRY, YARN, CAFE, SHELTER, RUG };
/** The four circuits that were stubs at Stabilise (all real now). */
export const STUB_TRACKS: readonly TrackDef[] = [LAUNDRY, YARN, CAFE, SHELTER];
export const ARENAS: readonly TrackDef[] = [RUG];
