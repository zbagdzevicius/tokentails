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
  /** Charm (sim v9, Gabė's Under Her Spell): the charmed unit walks toward its charmer and stops this close (mm). */
  charmStop: 1000,
  /** A pull (Lambo's Tangled Lights) stops this far (mm) short of the puller's footprint, so nobody ends past him. */
  pullGap: 200,
});

/**
 * Sim v17 Steadfast (docs/plans/moba/V17.md §3.1, RESEARCH §C6 "2 s of CC in 4 s → 1 s immunity"): hard CC on a hero
 * (stun, fear, charm, root, knockback and pull) counts toward `cap` ticks of lock inside a `window`-tick window that
 * opens at the first counted CC; reaching the cap truncates that CC and grants CC immunity for the rest of the lock
 * plus `immune` ticks. Heroes only.
 */
export const CC_DR = Object.freeze({ window: 120, cap: 60, immune: 30 });

/** Zone kinds in ZoneSnap.kind (render picks the look). */
export const ZONE_KIND = Object.freeze({
  /** Sage's Sun Snare. Hidden from the enemy team's snapshot. */
  trap: 0,
  /** Sir Brutus's Champion's Challenge ring (tether). */
  arena: 1,
  /**
   * Sim v9: a burst disc (Bengas's Curtains Up!, Gabė's Heart Balloon). After `arm` ticks it pulses every `zEvery`
   * ticks (0: once, then it vanishes): enemies in it take `zDmg` and a `zSlowBp` slow for `zVal` ticks, allied heroes
   * heal `zHeal`. Visible to both teams.
   */
  burst: 2,
  /**
   * Sim v10 (GAPS B6): Sir Brutus's Guard Post, a planted dome. Enemy projectiles that reach it are blocked while it
   * lasts; it ends with its owner. Visible to both teams.
   */
  dome: 3,
});

