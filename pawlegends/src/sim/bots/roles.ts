/**
 * Sim v19 (docs/plans/moba/MAP-5V5.md §4.1): the five 5v5 roles, assigned once at match start from the picks, with no
 * input and no randomness. Each team solves its 5 × 5 preference matrix (a hero's rank in the role's list, 3 when the
 * role does not list it) for the lowest total; ties go to the first assignment in slot order. Roles are physical and the
 * same for both teams (D1): Solo plays Fenceline, Mid Yarn Road, Fish Gutterway; Prowl clears its jungle and takes
 * objectives; Guard escorts the Fish laner. Crossing keeps its slot roles (bots/orders.ts laneRole).
 */
import { HEROES } from '../../data/heroes';
import type { HeroRole } from '../../data/heroes/types';
import type { MatchConfig } from '../api';

/** Role codes in `mg[MG.Role + slot]`: a lane role's code is its lane index (Fenceline 0, Yarn Road 1, Gutterway 2). */
export const ROLE = Object.freeze({ Solo: 0, Mid: 1, Fish: 2, Prowl: 3, Guard: 4 });
export type RoleName = 'solo' | 'mid' | 'fish' | 'prowl' | 'guard';
export const ROLE_NAMES: readonly RoleName[] = Object.freeze(['solo', 'mid', 'fish', 'prowl', 'guard'] as RoleName[]);

/** Preferred hero roles per bot role, best first. */
const PREFS: readonly (readonly HeroRole[])[] = [
  ['fighter', 'tank', 'assassin'],
  ['mage', 'marksman', 'assassin'],
  ['marksman', 'mage', 'assassin'],
  ['assassin', 'fighter'],
  ['support', 'tank'],
];
const MISS = 3;
const TEAM = 5;

function cost(role: number, hero: HeroRole): number {
  const i = PREFS[role].indexOf(hero);
  return i < 0 ? MISS : i;
}

/** All 120 permutations of 0..4 in lexicographic order. */
const PERMS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  const cur: number[] = [];
  const used = [false, false, false, false, false];
  const rec = (): void => {
    if (cur.length === TEAM) {
      out.push(cur.slice());
      return;
    }
    for (let r = 0; r < TEAM; r++) {
      if (used[r]) continue;
      used[r] = true;
      cur.push(r);
      rec();
      cur.pop();
      used[r] = false;
    }
  };
  rec();
  return out;
})();

/** Roles (ROLE codes) per hero slot of a Hearthwood config (10 slots); pure. */
export function assignRoles(config: Pick<MatchConfig, 'picks'>): number[] {
  const out: number[] = [];
  for (let team = 0; team < 2; team++) {
    let best = 0;
    let bestCost = -1;
    for (let p = 0; p < PERMS.length; p++) {
      let c = 0;
      for (let k = 0; k < TEAM; k++) c += cost(PERMS[p][k], HEROES[config.picks[team * TEAM + k]].role);
      if (bestCost < 0 || c < bestCost) {
        bestCost = c;
        best = p;
      }
    }
    for (let k = 0; k < TEAM; k++) out.push(PERMS[best][k]);
  }
  return out;
}

/** The role names per slot of a config (Hearthwood: 10; Crossing: [] — its roles are by slot, see laneRole). */
export function rolesOf(config: Pick<MatchConfig, 'picks' | 'map'>): RoleName[] {
  if (config.map !== 'hearthwood') return [];
  return assignRoles(config).map((r) => ROLE_NAMES[r]);
}
