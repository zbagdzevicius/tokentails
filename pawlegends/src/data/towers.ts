/** Towers, cores and their rules (POC.md §5 tower rules). */
export const TOWERS = Object.freeze({
  /** Sim v4: outer 1,800 and inner 2,200 HP (2,500 and 3,000 before); Rookie × DIFFICULTY_RULES.structureHpBp. */
  outer: Object.freeze({ hp: 1800, armour: 40, range: 7000, attackEvery: 30 }),
  inner: Object.freeze({ hp: 2200, armour: 50, range: 7000, attackEvery: 30 }),
  /** Damage to heroes, +20% per consecutive hit on the same hero, capped at +60% (v4: 90 / 20% / 60%, was 150 / 25% / 100%). */
  heroDamage: 90,
  rampBp: 2000,
  rampCapBp: 6000,
  /**
   * Lock-on (v4): a tower or core that switches to a hero first marks it for 1.2 s (a `windup` event, slot 4) and
   * only then fires; a hero that leaves its range during the lock-on is not shot.
   */
  lockOnTicks: 36,
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
 * Hour wave, and (sim v9) Lambo's Tuna Toss and Bengas's Burnt Toast.
 */
export const PROJECTILE_KIND = Object.freeze({ ranged: 0, siege: 1, tower: 2, core: 3, hero: 4, arrow: 5, pierce: 6, moonshot: 7, wave: 8, tuna: 9, toast: 10, lance: 11 });
