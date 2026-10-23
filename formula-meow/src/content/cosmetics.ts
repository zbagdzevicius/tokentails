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

/** Hat names (string keys for `t()`), a menu icon and the main colour of the procedural mesh. */
export const HAT_INFO: Readonly<Record<HatId, { name: string; icon: string; color: number }>> = {
  none: { name: 'No hat', icon: '🚫', color: 0 },
  crown: { name: 'Tiny Crown', icon: '👑', color: 0xffc93c },
  beanie: { name: 'Beanie', icon: '🧶', color: 0x3aa8ff },
  bow: { name: 'Bow', icon: '🎀', color: 0xff3ea5 },
  tophat: { name: 'Top Hat', icon: '🎩', color: 0x2a1a22 },
  propeller: { name: 'Propeller Cap', icon: '🚁', color: 0xff5a5f },
  chef: { name: 'Chef Hat', icon: '👨‍🍳', color: 0xfffaf2 },
  party: { name: 'Party Hat', icon: '🥳', color: 0xb07fd8 },
  pirate: { name: 'Pirate Hat', icon: '🏴‍☠️', color: 0x1a1238 },
};

/** Trail names, icons and particle colours (the progression lane draws them behind the player's kart). */
export const TRAIL_INFO: Readonly<Record<TrailId, { name: string; icon: string; colors: readonly number[] }>> = {
  none: { name: 'No trail', icon: '🚫', colors: [] },
  sparkle: { name: 'Sparkle', icon: '✨', colors: [0xfff3a0, 0xffffff, 0xffc93c] },
  fishbones: { name: 'Fish Bones', icon: '🐟', colors: [0xf2efe9, 0xcfd8e3] },
  hearts: { name: 'Hearts', icon: '💗', colors: [0xff3ea5, 0xff8fc7, 0xff5a5f] },
  pawprints: { name: 'Paw Prints', icon: '🐾', colors: [0x2a1a22, 0x5b4636] },
  rainbow: { name: 'Rainbow', icon: '🌈', colors: [0xff5a5f, 0xff8a3d, 0xffc93c, 0x3bb273, 0x3aa8ff, 0xb07fd8] },
};

/** Kart paint presets (index stored in the save): body, trim, accent. Free, like the GDD garage paint. */
export const PAINT_PRESETS: ReadonlyArray<{ name: string; paint: [number, number, number] }> = [
  { name: 'Strawberry', paint: [0xff5a5f, 0xfff3dc, 0x2a1a22] },
  { name: 'Sky', paint: [0x3aa8ff, 0xffffff, 0x1a2a4a] },
  { name: 'Butter', paint: [0xffc93c, 0x2a1a22, 0xff5a5f] },
  { name: 'Mint', paint: [0x3bb273, 0xfff3dc, 0x1d3b2a] },
  { name: 'Lilac', paint: [0xb07fd8, 0xfff3dc, 0x2a1a3a] },
  { name: 'Tangerine', paint: [0xff8a3d, 0x2a1a22, 0xfff3dc] },
  { name: 'Neon', paint: [0x2cf6f3, 0x1a1238, 0xff3ea5] },
  { name: 'Pink Paw', paint: [0xff3ea5, 0xfff3dc, 0x1a1238] },
  { name: 'Midnight', paint: [0x1a1238, 0x2cf6f3, 0xffc93c] },
  { name: 'Snow', paint: [0xf6f4f0, 0x3aa8ff, 0x2a1a22] },
];

/** Fish rewarded the first time an achievement unlocks. */
export const ACHIEVEMENT_FISH = 25;
/** Cup trophy fish by place 1..3 (times the class multiplier). */
export const TROPHY_FISH: readonly number[] = [50, 30, 20];
/** Completing all three daily challenges on one day. */
export const DAILY_SWEEP_FISH = 20;
