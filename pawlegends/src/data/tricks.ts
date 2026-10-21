/** Paw Tricks, one picked before the match (POC.md §6.7). Sim v10 (GAPS B5) adds Purr-ify as the 4th. */
export type TrickId = 'pounce' | 'snack' | 'hiss' | 'purrify';
export const TRICK_IDS: readonly TrickId[] = Object.freeze(['pounce', 'snack', 'hiss', 'purrify'] as TrickId[]);

export const TRICKS = Object.freeze({
  /** Blink 4 m. */
  pounce: Object.freeze({ cooldown: 3600, blink: 4000 }),
  /** Heal 25% max HP over 2 s; broken by hard CC. */
  snack: Object.freeze({ cooldown: 2700, healBp: 2500, duration: 60 }),
  /** Fear 1 s in a 3 m radius. */
  hiss: Object.freeze({ cooldown: 3000, fear: 30, radius: 3000 }),
  /**
   * Sim v10: cleanse stun, root, slow, fear and charm, then `immune` ticks of crowd-control immunity. Castable while
   * crowd-controlled. Wave C: cooldown 3000 to 2700 (46.1% of the 2,000-seed gate once heroes grew with levels).
   */
  purrify: Object.freeze({ cooldown: 2700, immune: 15 }),
});
