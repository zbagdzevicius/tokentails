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

export type PracticeSpots = { readonly spots: readonly (readonly [number, number])[]; readonly walkTo: readonly [number, number]; readonly turn: number };
/**
 * Sim v34 (V34-MAPS.md): the dummies' spots per map (MAP_IDS order): the standing dummy a step short of the middle on
 * the first lane, the walking dummy across the middle, the tower dummy in front of the enemy's first outer tower.
 * Hearthwood has no Practice ground (its row is Crossing's, never read).
 */
const row = (stand: readonly [number, number], walk: readonly [number, number], walkTo: readonly [number, number], tower: readonly [number, number]): PracticeSpots =>
  Object.freeze({ spots: Object.freeze([Object.freeze(stand), Object.freeze(walk), Object.freeze(tower)]), walkTo: Object.freeze(walkTo), turn: PRACTICE.turn });
export const PRACTICE_BY_MAP: readonly PracticeSpots[] = Object.freeze([
  PRACTICE,
  PRACTICE,
  row([46000, 50300], [44000, 19000], [56000, 19000], [60000, 50600]),
  row([46000, 52800], [45000, 7200], [56000, 7200], [61000, 52700]),
  row([46000, 51000], [45000, 9000], [56000, 9000], [60000, 51000]),
  row([46000, 52900], [45000, 7100], [56000, 7100], [62000, 52700]),
]);
