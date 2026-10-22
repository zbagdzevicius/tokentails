/**
 * FROZEN ids (iteration 2 contract, integrator only). Lanes refer to tracks, bodies, cosmetics, cups and achievements
 * by these ids; the numbers and prices live in the owning lane's file (karts.ts: feel, cosmetics.ts: progression,
 * cups.ts: modes). Never reorder: saves and links store the indices.
 */
import type { BodyId } from '../types';

/** Circuits (tracks lane). Kitchen and Rooftops are authored; the other four start as stubs (core/track/tracks/stubs.ts). */
export const TRACK_IDS = ['kitchen', 'rooftops', 'laundry', 'yarn', 'cafe', 'shelter'] as const;
export type TrackId = (typeof TRACK_IDS)[number];
/** Battle arenas (`kind: 'arena'`). */
export const ARENA_IDS = ['rug'] as const;
export type ArenaId = (typeof ARENA_IDS)[number];

export const BODY_IDS: readonly BodyId[] = [0, 1, 2, 3, 4, 5];
export const BODY_NAMES: Readonly<Record<BodyId, string>> = {
  0: 'Tuna Can',
  1: 'Shoebox',
  2: 'Sardine F1',
  3: 'Laundry Basket',
  4: 'Roomba',
  5: 'Teacup',
};

/** Hats: index 0 = none. */
export const HAT_IDS = ['none', 'crown', 'beanie', 'bow', 'tophat', 'propeller', 'chef', 'party', 'pirate'] as const;
export type HatId = (typeof HAT_IDS)[number];
/** Trails: index 0 = none. */
export const TRAIL_IDS = ['none', 'sparkle', 'fishbones', 'hearts', 'pawprints', 'rainbow'] as const;
export type TrailId = (typeof TRAIL_IDS)[number];

export const CUP_IDS = ['kibble', 'catnip'] as const;
export type CupId = (typeof CUP_IDS)[number];

/** 24 achievements (progression lane defines the rules and the copy). */
export const ACHIEVEMENT_IDS = [
  'first-pounce',
  'pink-turbo',
  'untouchable',
  'comeback',
  'revenge',
  'collector',
  'ghostbuster',
  'shortcut-scout',
  'gold-kibble',
  'gold-catnip',
  'medal-hunter',
  'last-cat-standing',
  'pacifist',
  'air-cat',
  'slipstreamer',
  'daily-devotee',
  'first-win',
  'podium-ten',
  'drift-master',
  'sharpshooter',
  'big-air',
  'clean-lap',
  'globetrotter',
  'track-maker',
  // iteration 4 (F12), append-only
  'loop-de-meow',
  'combo-king',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];
