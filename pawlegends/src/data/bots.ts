/** Bot difficulties and the bot brain's tuning (POC.md §7.2). Hard is MVP. */
export type Difficulty = 'easy' | 'normal';
export const DIFFICULTIES: readonly Difficulty[] = Object.freeze(['easy', 'normal'] as Difficulty[]);

export type TrickUse = 'never' | 'defensive';

export interface BotParams {
  reactionTicks: number;
  /** Skillshot aim error, ± this many 1/4096-turn steps (seeded). */
  aimErrorSteps: number;
  /** Mistake rate per think: miss a last-hit, chase too far, ignore a gank. */
  mistakeBp: number;
  retreatHpBp: number;
  trick: TrickUse;
  /** Chance per Pudding spawn that the bot contests it ("rarely" for Easy). */
  contestPuddingBp: number;
  /**
   * Beyond the POC.md §7.2 table (M3 tuning, so Easy plays clearly worse than Normal): chance per think that the
   * bot uses a ready ability in a fight, whether it clears waves with abilities, when it groups, whether it dives
   * and how good a fight it needs before it engages.
   */
  abilityUseBp: number;
  waveClear: boolean;
  /** Tick from which the bot groups with its team in one lane (BOT_AI's push), instead of its own lane. */
  groupAt: number;
  /** Hits a core (or a nearly dead tower) with no minion tanking it (BOT_AI.diveHpBp). */
  dives: boolean;
  /** Hits a tanked enemy structure before the enemy wave (objectives first); else only once no minion is near. */
  structureFirst: boolean;
  /** Engage when our side's power is at least this share of theirs (lower = takes worse fights). */
  fightPowerBp: number;
}

export const BOTS: Readonly<Record<Difficulty, Readonly<BotParams>>> = Object.freeze({
  easy: Object.freeze({
    reactionTicks: 18,
    /** ±20° skillshot aim error, in 1/4096 turn (20/360 × 4096 ≈ 228). */
    aimErrorSteps: 228,
    mistakeBp: 2500,
    retreatHpBp: 2500,
    trick: 'never' as TrickUse,
    /** "rarely" contests Pudding. */
    contestPuddingBp: 2000,
    abilityUseBp: 1000,
    waveClear: false,
    groupAt: 10800,
    dives: false,
    structureFirst: false,
    fightPowerBp: 16000,
  }),
  normal: Object.freeze({
    reactionTicks: 9,
    aimErrorSteps: 114,
    mistakeBp: 1000,
    retreatHpBp: 3000,
    trick: 'defensive' as TrickUse,
    contestPuddingBp: 10000,
    abilityUseBp: 10000,
    waveClear: true,
    /**
     * 5:00, when Pudding spawns (was 6:00; moved for the §15 item 11 p95 gate: grouping at 6:00 left
     * even teams trading at mid past 10:00 in ~6% of matches).
     */
    groupAt: 9000,
    dives: true,
    structureFirst: true,
    fightPowerBp: 8500,
  }),
});

/**
 * Who plays at which difficulty (POC.md §7.2, recorded 2026-10-17): the match difficulty sets the ENEMY
 * bots (Woof, slots 3..5). The human's two allied bots always play at `allies`, so "vs Easy bots" means an easy
 * enemy team, and a novice is carried by competent teammates instead of two more easy bots.
 */
export const BOT_TEAMS = Object.freeze({ allies: 'normal' as Difficulty });

/** Bot brain tuning (src/sim/bots). Integer mm, ticks, bp. Not in POC.md; change them here. */
export const BOT_AI = Object.freeze({
  /** Enemy heroes within this distance enter the bot's awareness (then the reaction delay runs). */
  awareRange: 12000,
  /** Fight an enemy hero this close (centre to centre). */
  engageRange: 7500,
  /** Keep fighting a foe that is still within engageRange + this. */
  chaseSlack: 3000,
  /** Count heroes within this distance of the foe for the fight power check. */
  powerRange: 10000,
  /** Power of a hero in the fight check (BotParams.fightPowerBp): HP + powerPerLevel × level. */
  powerPerLevel: 40,
  /** A structure covering the fight adds this to its side's power (untanked enemy towers count against us). */
  towerPower: 600,
  /** Foe choice: lowest HP + distance / distWeight (mm per HP point). */
  distWeight: 16,
  /** A foe below this HP share is chased even into a slightly worse fight. */
  finishHpBp: 3000,
  /** Leave retreat (at the fountain) once HP is back to this share. */
  retreatExitBp: 9000,
  /** Nap only with no visible enemy hero within this distance, and only when the fountain is further than napMinDist. */
  napSafeRange: 10000,
  napMinDist: 22000,
  /** Stand this far behind the lane front (melee, ranged). */
  holdMelee: 1000,
  holdRanged: 3500,
  /** Margin kept outside an enemy tower's reach when no allied minion tanks it. */
  towerMargin: 1500,
  /** With no allied minion in the lane: stand this far in front of the outermost own structure. */
  holdAhead: 3000,
  /** Last-hit look-ahead: minions within attack range + this. */
  farmReach: 3000,
  /** Once grouped (BotParams.groupAt), Pudding is not contested while an enemy structure is this close (a siege is on). */
  siegeRange: 15000,
  /** Leave the lane for Pudding or the camp only above this HP share. */
  objectiveHpBp: 5000,
  /** Abilities on minions (wave clear) need at least this many minions in the shape. */
  waveClearMin: 2,
  /** Waveclear only above this HP share. */
  waveClearHpBp: 4000,
  /** Re-issue a move only when the goal moved more than this (mm). */
  repeatSlack: 1500,
  /** A "defensive" Paw Trick fires when an enemy hero is this close while retreating. */
  trickThreat: 5000,
  /** Sage hops back when an enemy hero is this close. */
  kiteRange: 3000,
  /** Snack Break fires below this HP share with no enemy hero within trickThreat. */
  snackHpBp: 5000,
  /** Ultimates on a foe below this HP share (Moonshot, Pack Hunt). */
  executeHpBp: 5500,
  /** Dive: a healthy bot (HP share ≥ diveHpBp) hits a core, or a tower at or below diveTowerHp, with no minion tank. */
  diveHpBp: 6000,
  diveTowerHp: 600,
  /**
   * Push after a won fight: once grouped (BotParams.groupAt), a diving bot also hits an untanked tower while its team
   * has at least this many more heroes alive than the enemy. Stops the even late-game stalemates (§15 item 11 p95).
   */
  pushAdvantage: 1,
  /**
   * Mistakes (§7.2 "mistake rate"): once every slipEvery ticks a bot rolls its mistakeBp; a hit starts a mistake that
   * lasts slipTicks: it ignores enemy heroes (a gank), or chases with no leash and into towers, or misses its
   * last-hits (one of the three, seeded).
   */
  slipEvery: 30,
  slipTicks: 45,
  /** Pudding is contested only with at least this many allied heroes alive above objectiveHpBp (self included). */
  pudAllies: 2,
  /** Below the retreat threshold a bot walks home only when threatened (an aware enemy hero, tower fire) or below
   *  this share of the threshold; otherwise it keeps farming without starting fights. */
  retreatAlwaysBp: 5000,
});

/** Bot modes (`World.botMode`). */
export const BOT_MODE = Object.freeze({ Lane: 0, Retreat: 1, Fight: 2, Camp: 3, Pudding: 4, Push: 5 });

/** Scripted player profiles for slot 0 in headless runs (`npm run match -- --profile ...`, tests). */
export type PlayerProfile = 'idle' | 'novice' | 'easy' | 'normal';
export const PLAYER_PROFILES: readonly PlayerProfile[] = Object.freeze(['idle', 'novice', 'easy', 'normal'] as PlayerProfile[]);

/** The novice player-bot (§7.2 tuning target): plays one lane, attack-moves, casts on cooldown, walks home low. */
export const NOVICE = Object.freeze({
  /** Notices an enemy hero after this many ticks in view (a human's reaction). */
  reactionTicks: 15,
  /** Fights enemy heroes this close. */
  fightRange: 6500,
  /** Below this HP share it walks home when an enemy hero is in view or a tower shoots it (always below
   *  retreatAlwaysBp), and comes back out above returnHpBp. */
  retreatHpBp: 4000,
  retreatAlwaysBp: 2000,
  threatRange: 10000,
  returnHpBp: 8000,
  /** Starts no fight below this HP share. */
  fightHpBp: 5000,
  /** Counts heroes this close for the "never fight outnumbered" tip. */
  countRange: 8000,
  /** Skillshot aim error ± (1/4096 turn): about ±15°. */
  aimErrorSteps: 170,
  /** Follows its wave: attack-moves to this far behind the front allied minion (mm). */
  followBehind: 1500,
});
