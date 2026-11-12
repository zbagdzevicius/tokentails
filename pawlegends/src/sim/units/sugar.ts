/**
 * Sim v22 (docs/plans/moba/MAP-5V5-STANDARD.md §6.2) Sugar Rush, Hearthwood's late-objective team buff: the team that
 * calms the Great Pudding gets it on every living hero for SUGAR_RUSH.ticks. Allied minions within SUGAR_RUSH.range of
 * such a hero take less damage and hit structures harder (combat/damage.ts), so a won Pudding fight becomes a siege on
 * any lane, while the escort pushes its own.
 */
import { SUGAR_RUSH } from '../../data/pudding';
import { dist2 } from '../fixed';
import type { MatchHandle } from '../state';
import { G, Kind, MG, RANGE, type World } from '../world';

/** Is minion `id` within range of an allied hero with Sugar Rush? (Hearthwood only; 10 heroes, no allocation.) */
export function sugared(w: World, id: number): boolean {
  if (w.mg.length === 0) return false;
  const r2 = SUGAR_RUSH.range * SUGAR_RUSH.range;
  const team = w.team[id];
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.mg[MG.Rush + h] <= 0 || w.alive[h] === 0 || w.team[h] !== team) continue;
    if (dist2(w.x[h], w.y[h], w.x[id], w.y[id]) <= r2) return true;
  }
  return false;
}

/** The Great Pudding was calmed by `team`: Sugar Rush on each of its living heroes (a `buff` event each). */
export function grantSugarRush(m: MatchHandle, team: number): void {
  const w = m.world;
  if (w.mg.length === 0) return;
  const tick = w.globals[G.Tick];
  for (let h = RANGE.heroes; h < RANGE.minions; h++) {
    if (w.kind[h] !== Kind.Hero || w.team[h] !== team || w.alive[h] === 0) continue;
    w.mg[MG.Rush + h] = SUGAR_RUSH.ticks;
    m.events.push({ type: 'buff', tick, id: h, kind: 'sugarRush', ticks: SUGAR_RUSH.ticks });
  }
}
