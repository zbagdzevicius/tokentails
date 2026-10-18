/**
 * Bot difficulties and the bot brain's tuning (POC.md §7.2). Hard is MVP. 'rookie' (sim v4) is match 1 only; it is
 * appended so 'easy' and 'normal' keep their index (shared/caps.ts PAWLEGENDS_LEVELS has the same order).
 */
export type Difficulty = 'easy' | 'normal' | 'rookie';
export const DIFFICULTIES: readonly Difficulty[] = Object.freeze(['easy', 'normal', 'rookie'] as Difficulty[]);

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
  /** Walks over a Frenzy Catnip within BOT_AI.pickupRange (and a Fish Snack when hurt). */
  pickups: boolean;
  /**
   * Sim v4: a grouped team this far ahead (takedowns + 3 per tower) turns back to defend a raided lane only with
   * strictly more heroes near than raiders, so its lead becomes a push instead of letting the trailing team back in
   * (balance gate: trailing at 3:30 wins 30% to 40%). 0 = off (defend with as many as the raiders).
   */
  pressAhead: number;
}

/** Match rules that depend on the difficulty (sim v4), beyond the bots. */
export interface DifficultyRules {
  /** Cores cannot be hit before this tick (0 = from the start; Sudden Death decay still applies). Paces the end. */
  coreOpenAt: number;
  /**
   * Sim v5: before this tick the human's team's core never drops below humanCoreFloorBp of its max HP (0 = off).
   * Rookie (match 1): the enemy cannot end the first match before 6:00, so a first-timer who dies a lot still gets
   * a full match and a comeback, instead of a 4:30 defeat; an idle human still loses soon after.
   */
  humanCoreOpenAt: number;
  humanCoreFloorBp: number;
  /** Sim v5: data/heroes SIDE_EDGE applies (bot-vs-bot species balance; Normal). Off where the human's help knobs set
   *  the odds instead (Rookie, Easy), so a first-timer's odds do not depend on whether it picked a cat or a dog. */
  sideEdge: boolean;
  /** Sim v5: the human's allied bots hit enemy structures only while the human plays (bots/brain.ts humanEngaged). */
  pushNeedsHuman: boolean;
  /** Sim v5: Nine Lives starts at this share of max HP lost in a second (data/xp.ts NINE_LIVES.lossBp is Easy's). */
  nineLivesLossBp: number;
  /** Backdoor protection (TOWERS.backdoorBp) for the enemy's structures; off on Rookie. */
  enemyBackdoor: boolean;
  /** Towers start at this share of their HP, cores at coreHpBp. */
  structureHpBp: number;
  coreHpBp: number;
  /** The human's (slot 0) respawn time × this. */
  humanRespawnBp: number;
  /** Any ally within XP.shareRange of a dying enemy hero counts as an assist (not just the ones who hit it). */
  nearAssists: boolean;
  /** Towers knock the human's team's low-level heroes back on the first hit (TOWERS.rookieKnockback). */
  towerKnockback: boolean;
  /**
   * How many of the human's allies play "carry" (bots/brain.ts): they follow the human, peel for it and leave it the
   * kill. 1 = the roamer (slot 2) only, so the Puddle laner keeps its lane; 2 = both.
   */
  carryAllies: number;
  /** The enemy bots play the human's lane (where it stands), so the fights come to it. */
  enemiesToHuman: boolean;
  /**
   * First-match help for the human only (10000 = none): it deals humanDamageBp of its damage and takes
   * humanTakenBp of the damage enemy heroes, towers and minions deal it. The allies get nothing, so a player who
   * does nothing still loses.
   */
  humanDamageBp: number;
  humanTakenBp: number;
  /** The human's out-of-combat regen × this (10000 = the same as everyone): first-match help that tops a first-timer
   *  up between skirmishes, so it starts its fights near full HP instead of dying from chip damage. */
  humanRegenBp: number;
  /** "Scaredy cat": the human moves this much faster (bp) while below PANIC.hpBp of its max HP, so a first-timer's
   *  walk home usually gets it home (0 = off). */
  humanPanicBp: number;
  /** Enemy bots choosing a foe count the human as this much healthier (HP points): they focus it less. */
  spareHuman: number;
  /** Enemy heroes' respawn × this. */
  enemyRespawnBp: number;
  /** The enemy team gets underdog waves too (COMEBACK); off on Rookie, where only the human's team does. */
  enemyComeback: boolean;
  /**
   * Rally: every takedown the human takes part in (kill or assist) makes its team's later minions +rallyBp HP and
   * damage, up to rallyCap takedowns. The player's own kills push the lanes.
   */
  rallyBp: number;
  rallyCap: number;
  /** Slot 3 walks into Sunny Lane at scriptFrom and fights there until scriptUntil (the first fight); 0 = off. */
  scriptFrom: number;
  scriptUntil: number;
}

export const DIFFICULTY_RULES: Readonly<Record<Difficulty, Readonly<DifficultyRules>>> = Object.freeze({
  rookie: Object.freeze({ coreOpenAt: 0, humanCoreOpenAt: 10800, humanCoreFloorBp: 1500, pushNeedsHuman: true, sideEdge: false, nineLivesLossBp: 2800, enemyBackdoor: false, structureHpBp: 10000, coreHpBp: 10000, humanRespawnBp: 6000, nearAssists: true, towerKnockback: true, carryAllies: 2, enemiesToHuman: true, humanDamageBp: 14000, humanTakenBp: 9500, humanRegenBp: 40000, humanPanicBp: 7000, spareHuman: 500, enemyRespawnBp: 17500, enemyComeback: false, rallyBp: 1100, rallyCap: 8, scriptFrom: 450, scriptUntil: 1800 }),
  easy: Object.freeze({ coreOpenAt: 10800, humanCoreOpenAt: 0, humanCoreFloorBp: 0, pushNeedsHuman: false, sideEdge: false, nineLivesLossBp: 2800, enemyBackdoor: true, structureHpBp: 10000, coreHpBp: 10000, humanRespawnBp: 10000, nearAssists: true, towerKnockback: false, carryAllies: 2, enemiesToHuman: false, humanDamageBp: 10500, humanTakenBp: 10000, humanRegenBp: 10000, humanPanicBp: 0, spareHuman: 0, enemyRespawnBp: 10000, enemyComeback: true, rallyBp: 0, rallyCap: 0, scriptFrom: 0, scriptUntil: 0 }),
  normal: Object.freeze({ coreOpenAt: 0, humanCoreOpenAt: 0, humanCoreFloorBp: 0, pushNeedsHuman: false, sideEdge: true, nineLivesLossBp: 4000, enemyBackdoor: true, structureHpBp: 13500, coreHpBp: 13000, humanRespawnBp: 10000, nearAssists: false, towerKnockback: false, carryAllies: 0, enemiesToHuman: false, humanDamageBp: 10000, humanTakenBp: 10000, humanRegenBp: 10000, humanPanicBp: 0, spareHuman: 0, enemyRespawnBp: 10000, enemyComeback: true, rallyBp: 0, rallyCap: 0, scriptFrom: 0, scriptUntil: 0 }),
});

export const BOTS: Readonly<Record<Difficulty, Readonly<BotParams>>> = Object.freeze({
  /** Match 1 (sim v4): slow, inaccurate, takes bad fights, rarely casts. */
  rookie: Object.freeze({
    reactionTicks: 30,
    /** ±35° aim error. */
    aimErrorSteps: 400,
    mistakeBp: 3500,
    /** Stays in a losing fight down to 12% (a first-timer can catch it). */
    retreatHpBp: 1200,
    trick: 'never' as TrickUse,
    contestPuddingBp: 2000,
    abilityUseBp: 2000,
    waveClear: false,
    /** 3:30 */
    groupAt: 6300,
    dives: false,
    /** Hits a tanked tower before the wave: an idle human loses its lane. */
    structureFirst: true,
    /** Takes bad fights: engages at 40% of the other side's power. */
    fightPowerBp: 4000,
    pickups: false,
    pressAhead: 0,
  }),
  easy: Object.freeze({
    reactionTicks: 18,
    /** ±20° skillshot aim error, in 1/4096 turn (20/360 × 4096 ≈ 228). */
    aimErrorSteps: 228,
    mistakeBp: 2500,
    retreatHpBp: 800,
    trick: 'never' as TrickUse,
    /** "rarely" contests Pudding. */
    contestPuddingBp: 2000,
    /** v4: 2500 (1000 before), so match 2+ lands at 70% to 80% wins for a naive player. */
    abilityUseBp: 2500,
    waveClear: false,
    /** 4:30 (v4; 6:00 before). */
    groupAt: 5400,
    dives: false,
    structureFirst: false,
    fightPowerBp: 16000,
    pickups: true,
    pressAhead: 0,
  }),
  normal: Object.freeze({
    reactionTicks: 9,
    aimErrorSteps: 114,
    mistakeBp: 1000,
    retreatHpBp: 1200,
    trick: 'defensive' as TrickUse,
    contestPuddingBp: 10000,
    abilityUseBp: 10000,
    waveClear: true,
    /**
     * 3:55 (sim v3; was 5:00 in v2 and 6:00 before that: grouping at 6:00 left even teams trading at mid past 10:00
     * in ~6% of matches, §15 item 11 p95). At 5:00 the novice (§7.2, §15 item 12) beat Normal only 41.5% of 400 seeds,
     * next to the 40% floor: it keeps to Sunny Lane, so the push it is not in decided the match. Grouping earlier
     * lets its two Normal allies take that push while the enemy is still spread: 49.4% of 800 seeds, with the
     * Normal-vs-Normal gates green (seeds 1..2,000 and 2,001..4,000: median 7:36 / 7:37, p95 8:41, Purrhaven 49.0% /
     * 46.9%, heroes 44.1% to 53.7%; the 200-seed day-to-day run 47.0%). Tried on 400 to 800 seeds: 3:30 47.4%, 3:50
     * 52.0% (200-seed side 45.0%, on the floor), 4:00 50.1% (200-seed side 44.5%, fails), 4:10 45.3%, 4:30 43.0%;
     * allies grouping in the human's lane 31.8%; weaker Normal bots (abilityUseBp 7000, fightPowerBp 10000) 37% to
     * 39%. The allies group with the enemy difficulty (bots/index.ts ALLIES), so vs Easy they still wait for 6:00.
     */
    groupAt: 7050,
    dives: true,
    structureFirst: true,
    fightPowerBp: 6000,
    pickups: true,
    pressAhead: 3,
  }),
});

/**
 * Who plays at which difficulty (POC.md §7.2, recorded 2026-10-17): the match difficulty sets the ENEMY
 * bots (Woof, slots 3..5). The human's two allied bots always play at `allies`, so "vs Easy bots" means an easy
 * enemy team, and a novice is carried by competent teammates instead of two more easy bots.
 */
/** Rally: a minion stores its damage bonus in `level` in steps of this many bp (whole percent). */
export const RALLY_LEVEL_BP = 100;

export const BOT_TEAMS = Object.freeze({ allies: 'normal' as Difficulty });
/**
 * Rookie (match 1) allies: the Easy table with these numbers (src/sim/bots/index.ts ALLIES), so tuning Easy's enemies
 * for match 2+ does not change match 1.
 */
export const ROOKIE_ALLIES = Object.freeze({ retreatHpBp: 1200, abilityUseBp: 1500 });
// The allies take one number from the enemy difficulty: `groupAt` (src/sim/bots/index.ts `ALLIES`). Grouping at
// 4:00 (Normal's tried value) against Easy bots that hold their lanes until 6:00 left those lanes open: the novice beat Easy only
// 84.3% of 800 seeds (93.9% when the allies wait for 6:00 too).

/** Bot brain tuning (src/sim/bots). Integer mm, ticks, bp. Not in POC.md; change them here. */
export const BOT_AI = Object.freeze({
  /** Enemy heroes within this distance enter the bot's awareness (then the reaction delay runs). */
  awareRange: 12000,
  /** Fight an enemy hero this close (centre to centre). */
  engageRange: 7500,
  /** Keep fighting a foe that is still within engageRange + this. */
  chaseSlack: 5000,
  /** Count heroes within this distance of the foe for the fight power check. */
  powerRange: 10000,
  /** Power of a hero in the fight check (BotParams.fightPowerBp): HP + powerPerLevel × level. */
  powerPerLevel: 40,
  /** A structure covering the fight adds this to its side's power (untanked enemy towers count against us). */
  towerPower: 600,
  /** Foe choice: lowest HP + distance / distWeight (mm per HP point). */
  distWeight: 16,
  /** A foe to peel off the human (or the scripted first fight's target) scores this much better (HP points). */
  peelKey: 100000,
  /** Rookie's scripted first fight: slot 3 heads for this point of Sunny Lane (Purrhaven's side of the river). */
  scriptX: 40000,
  scriptY: 51000,
  /** A foe below this HP share is chased even into a slightly worse fight. */
  finishHpBp: 5000,
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
  /** Once grouped, a lane where a visible enemy hero is this close to the team's outermost structure is defended
   *  first (pushLane, sim v4): the two groups meet instead of racing each other's bases. */
  defendRange: 10000,
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
  /** Bots walk over a Frenzy Catnip this close (a Fish Snack: snackRange, below snackHpBp). */
  pickupRange: 9000,
  snackRange: 14000,
  pickupSnackHpBp: 7000,
  /** "Carry" allies (DifficultyRules.carryAllies): stay within followRange of the human, never more than leadMax
   *  ahead of it; leave a foe under stealHpBp to the human while it is within stealRange and hit it in the last stealTicks. */
  followRange: 7000,
  leadMax: 4000,
  stealHpBp: 2500,
  stealRange: 8000,
  stealTicks: 30,
  /** Carry leash (sim v5): carry allies follow the human only while it acted (a command or a step) in the last
   *  leashIdle ticks (8 s) and stands within leashLane of a lane or leashObjective of a rat camp or Pudding; else
   *  they go back to lane work instead of standing beside a parked human while the enemy pushes. */
  leashIdle: 240,
  leashLane: 9000,
  leashObjective: 10000,
  /** Below the retreat threshold a bot walks home only when threatened (an aware enemy hero, tower fire) or below
   *  this share of the threshold; otherwise it keeps farming without starting fights. */
  retreatAlwaysBp: 5000,
});

/** Bot modes (`World.botMode`). */
export const BOT_MODE = Object.freeze({ Lane: 0, Retreat: 1, Fight: 2, Camp: 3, Pudding: 4, Push: 5 });

/** Scripted player profiles for slot 0 in headless runs (`npm run match -- --profile ...`, tests). */
export type PlayerProfile = 'idle' | 'novice' | 'easy' | 'normal' | 'naive' | 'parked';
export const PLAYER_PROFILES: readonly PlayerProfile[] = Object.freeze(['idle', 'novice', 'easy', 'normal', 'naive', 'parked'] as PlayerProfile[]);

/** The `parked` player-bot (sim v5 carry-leash gate): walks to an off-lane jungle spot at `at` and stands there. */
export const PARKED = Object.freeze({ at: 900, x: 40000, y: 40000 });

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

/**
 * The naive player-bot (src/sim/bots/naive.ts): a scripted stand-in for a real first-timer, built from the playtest
 * diagnosis. It is the fun gate's player (`npm run match -- --gate fun1`): it chases, mashes Q/E/R, ignores towers
 * and never naps. On sim v3 it reproduced the diagnosis vs Easy (see naive.ts).
 */
export const NAIVE = Object.freeze({
  /** Notices an enemy hero after this many ticks in view. */
  reactionTicks: 12,
  /** Attack-moves to the nearest enemy hero this close. */
  seekRange: 15000,
  /** Keeps chasing its foe while it is this close. */
  chaseRange: 18000,
  /** Inside this distance it clicks the foe itself (a hard chase); further out it attack-moves at it. */
  lockRange: 6000,
  /** Casts Q / E / R at the nearest enemy (hero first, else a minion) this close. */
  castRange: 9000,
  /** Skillshot aim error ± (1/4096 turn): about ±25°. */
  aimErrorSteps: 427,
  /** Steps back from a tower only after this many consecutive tower hits and below towerHpBp. */
  towerHits: 3,
  towerHpBp: 3000,
  /** Walks home below this HP share, comes back out above returnHpBp. */
  retreatHpBp: 2000,
  returnHpBp: 8000,
  /** Walks over a pickup only when it is this close. */
  pickupRange: 6000,
  /** Hesitation: in this share of thinks it stands still for idleMin..idleMax ticks. */
  idleBp: 500,
  idleMin: 15,
  idleMax: 60,
  /** Follows its wave: attack-moves to this far behind the front allied minion (mm). */
  followBehind: 1500,
});
