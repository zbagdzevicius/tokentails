/** Pudding, the shared objective (POC.md §5). */
export const PUDDING = Object.freeze({
  /** Calm meter, filled by damage (Pudding's HP while wild; armour 0). */
  calm: 5000,
  /** Every 4 s a scared-hop knockback ring of 4 m after a 0.8 s telegraph. */
  hopEvery: 120,
  hopRadius: 4000,
  hopTelegraph: 24,
  hopKnockback: 1500,
  /** First at 5:00 (TIMELINE.pudding), respawn 2:30 after the escort leaves. */
  respawn: 4500,
  /** Pudding's Courage escort (joins the calming team's next wave). */
  escortHp: 3000,
  escortBreathRange: 7000,
  escortBreathDamage: 200,
  escortBreathEvery: 60,
  /** He leaves after this much enemy damage: the sim spends it as his escort HP (keep equal to escortHp). */
  escortLeaveDamage: 3000,
  /** Escort walk speed, mm/s (tuning, not in POC.md: the siege cart's pace, so he stays with his wave). */
  escortSpeed: 3200,
  /** The escort spawns this far along its lane from the core (tuning). */
  escortSpawnOffset: 5000,
});

/** `G.PudState` values. */
export const PUD_STATE = Object.freeze({
  /** Not on the map; `G.PudAt` is the tick of the next spawn. */
  Away: 0,
  /** Wild at the river, the calm race is on. */
  Wild: 1,
  /** Calmed: waits for the calming team's next wave. */
  Waiting: 2,
  /** Walking with that wave. */
  Escort: 3,
});
