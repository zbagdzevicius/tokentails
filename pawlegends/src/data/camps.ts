/** Rat camp (POC.md §5). One per side in the POC: the Purrhaven one at RAT_CAMP, the Woof one mirrored. */
export const RAT_CAMP_STATS = Object.freeze({
  rats: 2,
  hp: 450,
  dmg: 25,
  attackEvery: 30,
  /** Ticks from the swing to the bite (tuning, not in POC.md). */
  windup: 8,
  range: 1200,
  speed: 4000,
  armour: 0,
  /** A rat drops its target and runs home once it is this far from the camp (or its target is). */
  leash: 8000,
  /** 110 XP total for the camp (55 a rat; sim v12, 70 before), shared among the killer's team heroes within XP.shareRange. */
  xpTotal: 110,
  /** First at 0:30 (TIMELINE.campsUp), respawn 60 s after both rats fell. */
  respawn: 1800,
  /** Clearing the camp gives the killer's team +15% damage for 45 s (v4, a `buff` event 'pack'). */
  packDmgBp: 1500,
  packTicks: 1350,
  /** The two rats stand this far either side of the camp centre (y). */
  spread: 1200,
});

/**
 * Sim v19 (docs/plans/moba/MAP-5V5.md §1.6, §1.7): camp monster kinds by `w.sub` index. Crossing has rats only (0);
 * Hearthwood adds the buff camps (Prickle Hollow's hedgehog, Crow Roost's old crow), the Frog Pond toad, and Captain
 * Grizzlechop, the early river boss. `rats` is the monsters per camp of that kind; `xpTotal` the camp's XP; `fishLast`
 * and `fishNear` the Fish to the last hitter and to each other hero of its team in range (rats: data/fish.ts).
 */
export interface CampKind {
  readonly name: 'rat' | 'prickle' | 'crow' | 'toad' | 'boss';
  readonly rats: number;
  readonly hp: number;
  readonly dmg: number;
  readonly attackEvery: number;
  readonly windup: number;
  readonly range: number;
  readonly speed: number;
  readonly armour: number;
  readonly leash: number;
  readonly xpTotal: number;
  readonly respawn: number;
  readonly fishLast: number;
  readonly fishNear: number;
  /** Footprint radius (mm). */
  readonly radius: number;
}

export const CAMP_KIND = Object.freeze({ rat: 0, prickle: 1, crow: 2, toad: 3, boss: 4 });

export const CAMP_KINDS: readonly CampKind[] = Object.freeze([
  Object.freeze({ name: 'rat', rats: 2, hp: RAT_CAMP_STATS.hp, dmg: RAT_CAMP_STATS.dmg, attackEvery: RAT_CAMP_STATS.attackEvery, windup: RAT_CAMP_STATS.windup, range: RAT_CAMP_STATS.range, speed: RAT_CAMP_STATS.speed, armour: RAT_CAMP_STATS.armour, leash: RAT_CAMP_STATS.leash, xpTotal: RAT_CAMP_STATS.xpTotal, respawn: RAT_CAMP_STATS.respawn, fishLast: 0, fishNear: 0, radius: 500 }),
  /** Prickle Hollow: 1800 HP, 60 damage a second, leash 9 m; respawn 90 s. */
  Object.freeze({ name: 'prickle', rats: 1, hp: 1800, dmg: 60, attackEvery: 30, windup: 9, range: 1500, speed: 3600, armour: 40, leash: 9000, xpTotal: 120, respawn: 2700, fishLast: 90, fishNear: 20, radius: 700 }),
  /** Crow Roost: 1500 HP, ranged 4 m; respawn 90 s. */
  Object.freeze({ name: 'crow', rats: 1, hp: 1500, dmg: 55, attackEvery: 30, windup: 9, range: 4000, speed: 3600, armour: 30, leash: 9000, xpTotal: 120, respawn: 2700, fishLast: 90, fishNear: 20, radius: 600 }),
  /** Frog Pond: 900 HP; respawn 60 s. */
  Object.freeze({ name: 'toad', rats: 1, hp: 900, dmg: 35, attackEvery: 36, windup: 9, range: 1500, speed: 3200, armour: 20, leash: 8000, xpTotal: 80, respawn: 1800, fishLast: 70, fishNear: 15, radius: 600 }),
  /** Captain Grizzlechop (GDD §3.2): Bite 140 every 1.2 s; the team reward is GRIZZLECHOP's. */
  Object.freeze({ name: 'boss', rats: 1, hp: 3400, dmg: 140, attackEvery: 36, windup: 12, range: 2500, speed: 3200, armour: 30, leash: 10000, xpTotal: 0, respawn: 3600, fishLast: 0, fishNear: 0, radius: 1500 }),
]);

/** Sim v19: the jungle buffs (Hearthwood), in ticks and bp. */
export const JUNGLE_BUFF = Object.freeze({
  /** Prickle Coat (75 s): basic attacks on units slow 20% for 1 s and deal 3% of the target's max HP more. */
  prickleTicks: 2250,
  prickleSlowBp: 2000,
  prickleSlowTicks: 30,
  prickleMaxHpBp: 300,
  /** Prickle Coat's bonus never exceeds this per hit (so a tower or the boss is not shredded). */
  prickleCap: 90,
  /** Feather (75 s): cooldowns recover 20% faster, +5% move speed. */
  featherTicks: 2250,
  featherCdrBp: 2000,
  featherSpeedBp: 500,
});

/** Sim v19: Captain Grizzlechop's schedule and reward (Hearthwood, MAP-5V5.md §1.7). */
export const GRIZZLECHOP = Object.freeze({
  /** 2:00 first, 2:00 after he falls, no spawn after 8:30. */
  first: 3600,
  respawn: 3600,
  lastSpawn: 15300,
  /** +6% HP per whole minute at spawn. */
  hpBpPerMinute: 600,
  /** Tail Sweep: every 6 s a 1 s telegraph, then a 4 m ring for 160 and a 0.5 s 30% slow. */
  sweepEvery: 180,
  sweepTelegraph: 30,
  sweepRadius: 4000,
  sweepDamage: 160,
  sweepSlowBp: 3000,
  sweepSlowTicks: 15,
  /** He heals to full after 4 s with no hero within his leash. */
  resetTicks: 120,
  /** Reward: every hero of the team gets fish (+ per earlier take) and XP; the last hitter more; Hoard shield. */
  fish: 150,
  fishPerTake: 30,
  fishLastHit: 50,
  xp: 100,
  shieldBase: 250,
  shieldPerLevel: 25,
  shieldTicks: 1350,
  /** A team this many towers behind gets +50% of the Fish and XP. */
  behindTowers: 2,
  behindBp: 15000,
});
