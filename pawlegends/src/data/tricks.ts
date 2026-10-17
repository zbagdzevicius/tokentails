/** Paw Tricks, one picked before the match (POC.md §6.7). */
export type TrickId = 'pounce' | 'snack' | 'hiss';
export const TRICK_IDS: readonly TrickId[] = Object.freeze(['pounce', 'snack', 'hiss'] as TrickId[]);

export const TRICKS = Object.freeze({
  /** Blink 4 m. */
  pounce: Object.freeze({ cooldown: 3600, blink: 4000 }),
  /** Heal 25% max HP over 2 s; broken by hard CC. */
  snack: Object.freeze({ cooldown: 2700, healBp: 2500, duration: 60 }),
  /** Fear 1 s in a 3 m radius. */
  hiss: Object.freeze({ cooldown: 3000, fear: 30, radius: 3000 }),
});
