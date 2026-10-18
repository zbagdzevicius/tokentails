/** Levels, XP and respawn (POC.md §6.1). */
export const XP = Object.freeze({
  maxLevel: 10,
  /** Cumulative XP to reach level n (index n − 1). */
  toLevel: Object.freeze([0, 60, 200, 360, 580, 860, 1200, 1600, 2060, 2580]),
  ultimateLevel: 4,
  talentLevels: Object.freeze([3, 6, 9]),
  /** Kill XP (v4): 80 + 15 × victim level. */
  killBase: 80,
  killPerLevel: 15,
  /** Bounty: a victim on a takedown streak of bountyStreak+ gives +killPerStreak × streak (max killStreakMax). */
  bountyStreak: 3,
  killPerStreak: 20,
  killStreakMax: 80,
  shareRange: 10000,
  /** Assists count if they hit the victim in the last 10 s (v4; 6 s before). */
  assistWindow: 300,
  /** Catch-up per hero (v4): +25% XP from every source per level below the enemy average, at most +75%. */
  catchUpPerLevelBp: 2500,
  catchUpMaxBp: 7500,
  /** The first level behind earns no catch-up (a small team lead stays a lead). */
  catchUpFreeLevels: 1,
  /** A victim more than one level above its killer gives +50% kill XP. */
  upsetBp: 15000,
  /** Sim v5: the hero who last-hits a lane minion gets this share of its XP on top of its split share. */
  lastHitBp: 5000,
  /** XP trickle: per living hero per second, from the first wave on. */
  trickleXpPerSecond: 2,
  /** A level-up heals this share of max HP (the plan said 15%; 30% keeps fights short and decisive). */
  levelUpHealBp: 3000,
});

/**
 * Takedown heal (sim v4): every hero credited with a takedown (the kill or an assist) gets this share of its max HP
 * back at once (a `buff` event 'takedown'). A won fight resets the winner instead of leaving it half dead, so it
 * keeps fighting instead of walking home, and a lead turns into a push.
 */
export const TAKEDOWN_HEAL = Object.freeze({ healBp: 4000 });

/** "Scaredy cat" (DifficultyRules.humanPanicBp): below this share of max HP the human gets its speed bonus. */
export const PANIC = Object.freeze({ hpBp: 2500 });

export const RESPAWN = Object.freeze({
  /** v4: 3 s + 0.6 s × level, capped at 9 s; at most 4 s before 2:00 (earlyUntil). */
  base: 90,
  perLevel: 18,
  cap: 270,
  earlyCap: 120,
  earlyUntil: 3600,
});

/**
 * Zoomies (v4): +80% move speed for 6 s after leaving the fountain or respawning (it refreshes while the hero stands
 * in its own fountain); taking damage ends it. Fountain to lane takes about 7 s instead of 12.
 */
export const ZOOMIES = Object.freeze({ speedBp: 8000, ticks: 180 });

/**
 * Nine Lives (v4): damage beyond lossBp of max HP within the last `window` ticks is reduced by reduceBp, so no hero
 * loses much more than a third of its HP in one second. The `buff` event (the flash) fires at most once every
 * `cooldown` ticks; `nineT` (the snapshot bit) shows for `ticks` after the last reduced hit.
 */
export const NINE_LIVES = Object.freeze({ lossBp: 2800, window: 30, reduceBp: 9500, ticks: 30, cooldown: 450 });

export const HERO_RULES = Object.freeze({
  /** Nap (recall): 4 s channel, broken by damage. */
  napChannel: 120,
  /** Regen 5% max HP a second out of combat (no damage from an enemy hero for 3 s; v4, 1% after 5 s of no damage
   *  at all before): fewer walks home. */
  regenBpPerSecond: 300,
  outOfCombat: 90,
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
