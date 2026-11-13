/** Towers, cores and their rules (POC.md §5 tower rules). */
export const TOWERS = Object.freeze({
  /**
   * Sim v4: outer 1,800 and inner 2,200 HP (2,500 and 3,000 before); Rookie × DIFFICULTY_RULES.structureHpBp. Sim v21
   * (V21-FUN.md §3, "make towers stronger"): +25%, 2,250 and 2,750.
   */
  outer: Object.freeze({ hp: 2250, armour: 40, range: 7000, attackEvery: 30 }),
  inner: Object.freeze({ hp: 2750, armour: 50, range: 7000, attackEvery: 30 }),
  /** Sim v19 (Hearthwood): the gate towers and the Hearth Guards (their HP and armour come from the map's spots). */
  gate: Object.freeze({ hp: 3200, armour: 55, range: 7000, attackEvery: 30 }),
  hearth: Object.freeze({ hp: 3000, armour: 55, range: 7000, attackEvery: 30 }),
  /**
   * A tower bolt at a hero: (heroDamage + heroMaxHpBp of the target's max HP) × (1 + streak × rampBp, at most
   * rampCapBp), × fortifyBoltBp while Fortified, then armour. Cores keep CORE_STATS.damage. History: v4 90 / 20% / 60%
   * (was 150 / 25% / 100%); sim v21 120 / 25% / 80%, so a squishy that stays under a tower dies. Sim v26
   * (docs/plans/moba/V26-TOWERS.md, "make towers more durable and hit harder, especially in early game"): 130 + 3% of
   * the target's max HP, +30% a shot to +90% (multipliers 1.0, 1.3, 1.6, 1.9, 1.9 …), ×1.25 while Fortified: a level 1
   * Sage dies to 3 shots (4 in v25), a level 9 Brutus to 8 (12).
   */
  heroDamage: 130,
  heroMaxHpBp: 300,
  rampBp: 3000,
  rampCapBp: 9000,
  /**
   * Fortified (sim v21; sim v26 V26-TOWERS.md §1.B): before fortifyUntil[map] (Crossing 4:00, Hearthwood 5:30; v21 to
   * v25 3:00 and 5:00; Blitz has its own, data/mutators.ts) heroes deal fortifyBp (v26 55%, was 65%) and minions and
   * the escort Pudding's breath fortifyMinionBp (v26 75%, was 100%) of their damage to towers, and tower bolts at
   * heroes hit fortifyBoltBp harder. The Kibble Cannon and pure damage are not reduced; v26: no takedown chip lands on
   * a Fortified tower. Cores are never Fortified.
   */
  fortifyBp: 5500,
  fortifyMinionBp: 7500,
  fortifyBoltBp: 12500,
  fortifyUntil: Object.freeze([7200, 9900]) as readonly number[],
  /**
   * Sim v26: a takedown chip (DifficultyRules.takedownTowerChipBp) never takes a tower below chipFloorBp of its max HP,
   * and towers at or below it are skipped, so heroes and minions finish every tower.
   */
  chipFloorBp: 1500,
  /**
   * Lock-on (v4): a tower or core that switches to a hero first marks it (a `windup` event, slot 4) and only then
   * fires; a hero that leaves its range during the lock-on is not shot. 1.2 s until sim v25, 1.0 s from sim v26.
   */
  lockOnTicks: 30,
  /** Rookie: the first hit on a hero of level ≤ rookieKnockLevel (the human's team) knocks it back this far. */
  rookieKnockback: 3000,
  rookieKnockLevel: 2,
  /** Damage to minions (a melee minion dies in 3 hits). */
  minionDamage: 110,
  /** Backdoor protection: −50% damage from heroes when no attacker-team minion is within 8 m. */
  backdoorBp: 5000,
  backdoorRange: 8000,
  /** Sim v4: a fallen tower gives every living hero of the team that took it this much XP (a lead in towers is a
   *  lead in levels, so the team ahead at 3:30 wins about two in three). */
  teamXp: 120,
  /** Tower and core bolts, mm/s. */
  projectile: 20000,
});

export const CORE_STATS = Object.freeze({ hp: 3000, armour: 50, damage: 120, range: 7000, attackEvery: 30 });

/**
 * Projectile kinds in ProjectileSnap.kind (render picks the look). 0..4 are homing bolts; 5.. are skillshots that fly
 * straight (POC.md §4.4 `projectile`): Sage's Volley arrows, her Steady Paw pierce shot and Moonshot, Clem's Golden
 * Hour wave, and (sim v9) Lambo's Tuna Toss and Bengas's Burnt Toast; (sim v10) Sage's Piercing Shot; (sim v11)
 * Pixel's Cap Cannon and Duchess's Fluff Puff (also Marshmallow's Snowball and Bravo's Crocodile Tears, sim v14: the
 * render picks those looks by the owner's hero); (sim v14) Nugget's Frisbee and Chili's Yap; (sim v21) the Kibble
 * Cannon's kibble and the Mega Yarn Ball's roll. Append only: the kind travels on the wire.
 */
export const PROJECTILE_KIND = Object.freeze({ ranged: 0, siege: 1, tower: 2, core: 3, hero: 4, arrow: 5, pierce: 6, moonshot: 7, wave: 8, tuna: 9, toast: 10, lance: 11, cap: 12, fluff: 13, frisbee: 14, yap: 15, kibble: 16, yarn: 17 });
