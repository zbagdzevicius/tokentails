/**
 * Pickups (sim v4): Frenzy Catnip in the river and near the lanes, Fish Snacks behind each team's outer tower. A
 * hero walks over one to take it (within `radius` of its centre). Integer mm, ticks, bp.
 */
export type PickupKind = 'frenzy' | 'snack';
/** `pkKind` values and the snapshot `sub`. */
export const PICKUP_KINDS: readonly PickupKind[] = Object.freeze(['frenzy', 'snack'] as PickupKind[]);

export const PICKUPS = Object.freeze({
  radius: 1500,
  frenzy: Object.freeze({
    /** 0:45, then every 30 s (the plan said 40 s); a new pair replaces the old one. */
    first: 1350,
    every: 900,
    /** +25% damage, +20% move speed for 8 s, and 20% max HP back at once. */
    dmgBp: 2500,
    speedBp: 2000,
    ticks: 240,
    healBp: 2000,
  }),
  snack: Object.freeze({
    /** Every 30 s from 0:30, one per team (only that team takes it); the lane alternates Sunny / Puddle. */
    first: 900,
    every: 900,
    /** Heals 35% of max HP and refreshes Zoomies. */
    healBp: 3500,
  }),
});

/**
 * Frenzy spots: each spawn places a pair, both on the river (x = 50 m, so each spot is its own mirror and neither
 * team is closer). Spawns alternate between the river's lane crossings (Sunny and Puddle Lane, where the fights
 * are) and its two jungle spots.
 */
export const FRENZY_SPOTS = Object.freeze([
  Object.freeze([50000, 52000, 50000, 8000] as const),
  Object.freeze([50000, 41000, 50000, 19000] as const),
]);

/** Fish Snack spot: this far behind (toward the own core) the team's outer tower of the lane, or its inner one. */
export const SNACK_BEHIND = 4000;
