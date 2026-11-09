/** Pudding, the shared objective (POC.md §5). */
const C_PUDDING = Object.freeze({
  /** Calm meter, filled by damage (Pudding's HP while wild; armour 0). */
  calm: 2500,
  /** Every 4 s a scared-hop knockback ring of 4 m after a 0.8 s telegraph. */
  hopEvery: 120,
  hopRadius: 4000,
  hopTelegraph: 24,
  hopKnockback: 1500,
  /** First at 2:30 (TIMELINE.pudding), respawn 2:00 after the escort leaves (v4; 5:00 and 2:30 before). */
  respawn: 3600,
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

export type PuddingStats = { readonly [K in keyof typeof C_PUDDING]: number };
export const CROSSING_PUDDING: PuddingStats = C_PUDDING;
/** Sim v19 (MAP-5V5.md §1.7): the Great Pudding of Hearthwood, a bigger calm meter and a stronger escort. */
export const HEARTHWOOD_PUDDING: PuddingStats = Object.freeze({
  ...C_PUDDING,
  calm: 7000,
  respawn: 4500,
  escortHp: 6000,
  escortLeaveDamage: 6000,
  escortBreathDamage: 260,
});
/** Live binding (src/sim/map/runtime.ts bindMap). */
export let PUDDING: PuddingStats = C_PUDDING;
export function setPudding(p: PuddingStats): void {
  PUDDING = p;
}
