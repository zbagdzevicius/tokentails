/** Levels, XP and respawn (POC.md §6.1). */
export const XP = Object.freeze({
  maxLevel: 10,
  /** Cumulative XP to reach level n (index n − 1). */
  toLevel: Object.freeze([0, 120, 300, 540, 840, 1200, 1620, 2100, 2640, 3240]),
  ultimateLevel: 4,
  talentLevels: Object.freeze([3, 6, 9]),
  /** Kill XP: 100 + 20 × victim level, +25 per victim streak step (max +100). */
  killBase: 100,
  killPerLevel: 20,
  killPerStreak: 25,
  killStreakMax: 100,
  shareRange: 10000,
  /** Assists count if they hit the victim in the last 6 s. */
  assistWindow: 180,
  /** Catch-up +20% when the team's total level is behind. */
  catchUpBp: 12000,
});

export const RESPAWN = Object.freeze({
  /** 4 s + 0.8 s × level, capped at 12 s. */
  base: 120,
  perLevel: 24,
  cap: 360,
});

export const HERO_RULES = Object.freeze({
  /** Nap (recall): 4 s channel, broken by damage. */
  napChannel: 120,
  /** Regen 1% max HP a second out of combat (no damage for 5 s). */
  regenBpPerSecond: 100,
  outOfCombat: 150,
  /** Damage formula: idiv(dmg × armourBase, armourBase + armour). */
  armourBase: 100,
  /** Basic attack windup (ticks from the swing to the hit). */
  attackWindup: 8,
  /** Heroes with a range above this fire a bolt (mm/s below) instead of hitting at the end of the windup. */
  meleeMaxRange: 3000,
  projectile: 18000,
  /** Attack-move and idle heroes acquire enemies within this distance (edge to edge). */
  acquireRange: 6000,
});
