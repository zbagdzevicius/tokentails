/**
 * Effect primitives (POC.md §4.4): shared tuning numbers that POC.md does not state per ability. Integer units:
 * mm, mm/s, ticks, bp, angle steps (1/4096 turn). Ability-specific numbers live in data/heroes/*.
 */
export const EFFECTS = Object.freeze({
  /** Dashes (Tumble, Hop Back, Jeer Slash, Pug Charge) travel at this speed. 4 m takes 6 ticks. */
  dashSpeed: 20000,
  /** A knockback covers its distance in this many ticks (hard CC while it lasts). */
  knockbackTicks: 6,
  /** Slows never take a unit below this share of its base speed. */
  minSpeedBp: 2500,
  /** Stealth (Bush Slink): an enemy unit within this distance sees through it (same as the brush reveal). */
  stealthReveal: 2000,
  /** Fear: the unit runs straight away from the source at its (slowed) move speed. */
  fearSpeedBp: 10000,
  /** A dash or knockback stops at walls; the path is sampled every this many mm. */
  wallStep: 250,
  /** Skillshot projectile hit radius when the ability gives no width (mm). */
  projectileRadius: 300,
});

/** Zone kinds in ZoneSnap.kind (render picks the look). */
export const ZONE_KIND = Object.freeze({
  /** Sage's Sun Snare. Hidden from the enemy team's snapshot. */
  trap: 0,
  /** Sir Brutus's Champion's Challenge ring (tether). */
  arena: 1,
});

