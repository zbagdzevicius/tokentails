/** Towers, cores and their rules (POC.md §5 tower rules). */
export const TOWERS = Object.freeze({
  outer: Object.freeze({ hp: 2500, armour: 40, range: 7000, attackEvery: 30 }),
  inner: Object.freeze({ hp: 3000, armour: 50, range: 7000, attackEvery: 30 }),
  /** Damage to heroes, +25% per consecutive hit on the same hero, capped at +100%. */
  heroDamage: 150,
  rampBp: 2500,
  rampCapBp: 10000,
  /** Damage to minions (a melee minion dies in 3 hits). */
  minionDamage: 110,
  /** Backdoor protection: −50% damage from heroes when no attacker-team minion is within 8 m. */
  backdoorBp: 5000,
  backdoorRange: 8000,
  /** Tower and core bolts, mm/s. */
  projectile: 20000,
});

export const CORE_STATS = Object.freeze({ hp: 4000, armour: 50, damage: 120, range: 7000, attackEvery: 30 });

/**
 * Projectile kinds in ProjectileSnap.kind (render picks the look). 0..4 are homing bolts; 5.. are skillshots that fly
 * straight (POC.md §4.4 `projectile`): Sage's Volley arrows, her Steady Paw pierce shot and Moonshot, Clem's Golden
 * Hour wave.
 */
export const PROJECTILE_KIND = Object.freeze({ ranged: 0, siege: 1, tower: 2, core: 3, hero: 4, arrow: 5, pierce: 6, moonshot: 7, wave: 8 });
