/** Levels, XP and respawn (POC.md §6.1). */
export const XP = Object.freeze({
  maxLevel: 10,
  /** Cumulative XP to reach level n (index n − 1). Sim v12 (docs/FUN-PROGRESSION-V12.md S2, S6): levels 3 to 6 cost a
   *  little more and level 7 a lot more (v11: 0, 60, 200, 360, 580, 860, 1200, 1600, 2060, 2580). Balance gate (2,000
   *  seeds): the lobby's leader reaches level 4 at 1:05, 7 at 3:41 and 10 at 7:55 (v11 0:58, 2:44, 5:15); 16% of heroes
   *  end at level 10 (v11 70%). Sim v35 (V35-DEATHS.md): levels 8 to 10 cost more (v12 to v34: 2350, 2950, 3500), so
   *  with the bigger kill XP the heroes who win fights reach them and the others do not: the level cap no longer hides
   *  a kill lead late in the match. */
  toLevel: Object.freeze([0, 60, 210, 420, 650, 960, 1750, 2900, 4100, 5500]),
  /** Sim v12: each of n heroes sharing a minion or a kill gets shareBp[n − 1] of it (1, 2, 3 heroes: 100%, 50%, 34%),
   *  so three heroes together earn a little more in total than an equal split. The spec's start (57.5%, 39%) put the
   *  leader's level 4 at 0:54. */
  shareBp: Object.freeze([10000, 5000, 3400]),
  ultimateLevel: 4,
  talentLevels: Object.freeze([3, 6, 9]),
  /** Kill XP (v4): 80 + 15 × victim level. Sim v33 (docs/plans/moba/V33-KILLS.md, player feedback: "10 kills and 0
   *  kills are almost the same strength, at most one level apart"): 120 + 30 × victim level, and the killer gets
   *  killerBonusBp of it on top of its share, so a hero who racks up kills is 2 to 3 levels ahead (was ~1.5). */
  killBase: 220,
  killPerLevel: 55,
  killerBonusBp: 7500,
  /** Sim v35 (V35-DEATHS.md, founder: "champ kill should give much XP, much more than now"): kill XP about 1.8× v33,
   *  the killer +75% unshared (v33 +50%), and every other credited or nearby hero gets assistBp of its share, so the
   *  hero who lands the kill gains the most. A victim above its killer is worth upsetPerLevelBp more a level of that
   *  lead, at most upsetMaxBp (v4 to v34: +50% once the victim was 2+ levels up, `upsetBp`). */
  assistBp: 5000,
  upsetPerLevelBp: 2500,
  upsetMaxBp: 10000,
  /** Bounty: a victim on a takedown streak of bountyStreak+ gives +killPerStreak × streak (max killStreakMax). Sim
   *  v33: from a streak of 2, +50 a takedown, at most +250 (v4: 3, 20, 80), so ending a streak is the comeback. */
  bountyStreak: 2,
  /** Sim v35: +100 a takedown, at most +500 (v33 50, 250), scaled with the kill XP, so a shutdown stays the comeback. */
  killPerStreak: 100,
  killStreakMax: 500,
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
  /** Sim v35 (V35-DEATHS.md): 3 s + 1 s × level, capped at 13 s (v12 to v34: 0.9 s, 12 s). */
  perLevel: 30,
  cap: 390,
  /** Sim v12: no respawn is longer than 15 s, after Sunset and lead pressure (combat/damage.ts). Sim v33: 25 s, so the
   *  match-time growth (DifficultyRules.respawnGrowBp) reaches late games. Sim v35: 40 s (the death weight below). */
  hardCap: 1200,
  /** Sim v33 (player feedback: "respawns must get slower the longer the match goes, or even teams never take bases"):
   *  from growFrom the wait grows DifficultyRules.respawnGrowBp a minute (Normal and Hard +8%), at most growMaxBp more. */
  growFrom: 5400,
  /** Sim v35: at most +160% (v33 +120%), with DifficultyRules.respawnGrowBp +10% a minute on Normal and Hard. */
  growMaxBp: 16000,
  /**
   * Sim v35 (V35-DEATHS.md, founder: "deaths should be more and more punishing, each respawn longer and longer"): every
   * earlier death of the hero (its death weight, World.deathN) makes the next wait deathPerBp longer, at most deathMaxBp
   * (× DifficultyRules.deathGrowBp: Rookie none, Easy half). Each forgiveTicks a hero stays alive takes one death off
   * its weight, so a player who stops feeding gets the short waits back.
   */
  deathPerBp: 1200,
  deathMaxBp: 7200,
  forgiveTicks: 2700,
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
  /**
   * Founder bug 2026-11-08 ("close to impossible to basic attack a champ while chasing"): a hero with an attack order
   * starts its swing within its attack range + this many mm (about two ticks of a walk), so a chase that holds the gap
   * at the edge of range still swings. Keep it under the windup's landing slack (the target's radius).
   */
  chaseLeeway: 300,
  /**
   * Sim v20 (V20-CHASE.md S3): a hero's started swing lands (or fires) on a target still within its attack range +
   * this many mm when the windup ends (Wild Rift: a started basic attack completes unless the target gets "too far
   * away"; no distance is published). Equals the touch lock's melee break (LOCK_BREAK.melee).
   */
  swingBreak: 1000,
  /**
   * Sim v20 (V20-CHASE.md S2): an attack-move whose point is within the current target's radius + this many mm (the
   * player A-clicked at the unit it is already attacking) keeps that target and its swing instead of re-acquiring.
   */
  amoveClick: 1500,
});
