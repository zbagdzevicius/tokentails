/**
 * Cosmetics prices and unlock rules (iteration 2; the progression lane owns the numbers, ids are frozen in ids.ts).
 * Fish coins are an in-game currency only: no real money, no purchase path, no ads.
 */
import type { BodyId } from '../types';
import type { HatId, TrailId } from './ids';

/** Fish to unlock a body (0 = free from the start). */
export const BODY_PRICES: Readonly<Record<BodyId, number>> = { 0: 0, 1: 0, 2: 0, 3: 200, 4: 400, 5: 600 };

/** Fish to unlock a hat (`none` is free). */
export const HAT_PRICES: Readonly<Record<HatId, number>> = {
  none: 0,
  crown: 250,
  beanie: 60,
  bow: 80,
  tophat: 150,
  propeller: 120,
  chef: 100,
  party: 60,
  pirate: 200,
};

/** Trails are earned, not bought (GDD 7): the first podium on a track group unlocks one. */
export const TRAIL_RULES: Readonly<Record<TrailId, string>> = {
  none: '',
  sparkle: 'kitchen',
  fishbones: 'rooftops',
  hearts: 'shelter',
  pawprints: 'laundry',
  rainbow: 'yarn',
};
