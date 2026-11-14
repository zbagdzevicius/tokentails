/**
 * Sim v27 (docs/plans/moba/V27.md §2): the Practice ground on Purrhaven Crossing. The player's hero plays alone (its
 * allies wait at the fountain) against three training dummies, the enemy team's slots. Integer mm and ticks.
 *
 * - Slot 0 of the enemy team, the standing dummy: on Sunny Lane a step short of the river, out of both towers' reach.
 * - Slot 1, the walking dummy: paces Puddle Lane between two points out of both towers' reach.
 * - Slot 2, the tower dummy: stands in front of the enemy's Sunny outer tower, so hitting it draws that tower's fire.
 *
 * Dummies never strike or cast, come back `respawn` ticks after a takedown on their own spot, and a Reset puts them
 * back there at full HP.
 */
export const PRACTICE = Object.freeze({
  /** Spots by enemy-team slot (x, y; team 0 plays from the left, x < 50 m). */
  spots: Object.freeze([Object.freeze([47000, 50000] as const), Object.freeze([45000, 9000] as const), Object.freeze([63000, 50000] as const)]),
  /** The walking dummy (enemy slot 1) paces between its spot and this point. */
  walkTo: Object.freeze([56000, 9000] as const),
  /** Within this of a turning point the walking dummy turns round. */
  turn: 600,
});
