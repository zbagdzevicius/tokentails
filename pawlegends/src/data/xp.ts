/** Levels, XP and respawn (POC.md §6.1). */
export const XP = Object.freeze({
  maxLevel: 10,
  /** Cumulative XP to reach level n (index n − 1). Sim v12 (docs/FUN-PROGRESSION-V12.md S2, S6): levels 3 to 6 cost a
   *  little more and level 7 a lot more (v11: 0, 60, 200, 360, 580, 860, 1200, 1600, 2060, 2580). Balance gate (2,000
   *  seeds): the lobby's leader reaches level 4 at 1:05, 7 at 3:41 and 10 at 7:55 (v11 0:58, 2:44, 5:15); 16% of heroes
   *  end at level 10 (v11 70%). */
  toLevel: Object.freeze([0, 60, 210, 420, 650, 960, 1750, 2350, 2950, 3500]),
  /** Sim v12: each of n heroes sharing a minion or a kill gets shareBp[n − 1] of it (1, 2, 3 heroes: 100%, 50%, 34%),
   *  so three heroes together earn a little more in total than an equal split. The spec's start (57.5%, 39%) put the
   *  leader's level 4 at 0:54. */
  shareBp: Object.freeze([10000, 5000, 3400]),
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
  /** Catch-up per hero (v4): bonus XP from every source per level below the enemy average. Sim v8 (playtest round 2:
   *  "once behind, the human falls 2 to 4 levels below the lobby and the gap never closes"): +35% a level, at most
   *  +75%. Sim v10 (GAPS B3): the rate and cap are DifficultyRules.catchUpPerLevelBp / catchUpMaxBp.
   *  The first level behind earns no catch-up (a small team lead stays a lead). */
  catchUpFreeLevels: 1,
  /** Fun pass (playtest #2: a fed player's enemies ran to level 9 by 3:35): a victim that died FISH.killRepeatFrom+
   *  times in a row gives this share of its kill XP (bounty not included), FISH.killFedFrom+ times killFedXpBp, as the
   *  kill Fish already does. */
  killRepeatXpBp: 7500,
  killFedXpBp: 5000,
  /** A victim more than one level above its killer gives +50% kill XP. */
  upsetBp: 15000,
  /** Sim v7 rubber band (DifficultyRules.enemyAheadXpBp): enemy heroes this many levels above the human. */
  aheadLevels: 2,
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
  /** v4: 3 s + 0.6 s × level, capped at 9 s; at most 4 s before 2:00 (earlyUntil). Sim v12 (S3): 3 s + 0.9 s × level,
   *  capped at 12 s, so a late death costs real map time. */
  base: 90,
  perLevel: 27,
  cap: 360,
  /** Sim v12: no respawn is longer than 15 s, after Sunset and lead pressure (combat/damage.ts). */
  hardCap: 450,
  earlyCap: 120,
  earlyUntil: 3600,
  /**
   * Sim v7 (DifficultyRules.leadPressure, playtest round 1): a dead hero whose team trails by more than gapFree
   * takedowns waits gapPerBp longer per extra takedown, at most gapCapBp longer (a 10-takedown gap: +64%), so the
   * team that wins the fights gets the time to take the towers.
   */
  gapFree: 2,
  gapPerBp: 800,
  gapCapBp: 6400,
  /**
   * Fun pass (playtest #10: a struggling player spent 19% to 24% of the match dead, respawns 10.6 s to 15.2 s): from
   * the human's humanStreakFrom-th death in a row (deathStreak before this death, so the third) its wait is
   * humanStreakBp of the level wait, without the lead pressure above (not on Rookie: DifficultyRules.humanRespawnBp).
   * A plain human death keeps the pressure, so the balance gates (a Normal-level player) do not move.
   */
  humanStreakFrom: 2,
  humanStreakBp: 7000,
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
