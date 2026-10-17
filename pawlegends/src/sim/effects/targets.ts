/**
 * Who an ability can hit: enemy heroes, minions, camp monsters and Pudding that `team` can target and see (never
 * structures, never untargetable or hidden units). Ascending id, so every area effect resolves in a fixed order.
 */
import { RANGE, type World } from '../world';
import { radiusOf, targetable } from '../units/kinds';

/** Ids `team`'s abilities may hit, ascending. */
export function isAbilityTarget(w: World, e: number, team: number): boolean {
  if (e >= RANGE.towers && e < RANGE.camps) return false;
  return targetable(w, e, team);
}

/**
 * Collect the ability targets of `team` that pass `test(e, radius)` into `out`; returns the count. `heroesOnly`
 * restricts to hero ids.
 */
export function collect(
  w: World,
  team: number,
  out: Int32Array,
  test: (e: number, r: number) => boolean,
  heroesOnly = false,
): number {
  let n = 0;
  const end = heroesOnly ? RANGE.minions : RANGE.end;
  for (let e = 0; e < end; e++) {
    if (!isAbilityTarget(w, e, team)) continue;
    if (test(e, radiusOf(w, e))) out[n++] = e;
  }
  return n;
}
