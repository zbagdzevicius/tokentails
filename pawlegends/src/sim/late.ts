/**
 * Sim v32 (docs/plans/moba/V32-NO-SUDDEN-DEATH.md): late Sunset, what replaced Sudden Death. From the match's late tick
 * (`G.Late`) towers and cores take more damage and respawn waits grow, a little more every minute and the same for
 * both teams (data/timeline.ts LATE_SUNSET); where the difficulty has lead pressure (Normal, Hard) the team ahead on
 * takedowns hits structures harder still (LATE_SUNSET.leadBpPerTakedown), so winning the fights still wins the match.
 * Towers also hit minions less every minute (LATE_SUNSET.towerMinionBpPerMinute, down to towerMinionMinBp), so the
 * waves push through and a won fight turns into towers. Nothing burns on its own: structures fall to heroes and minions.
 */
import { HEARTHWOOD_LATE, LATE_SUNSET, POOL_LATE, TIMELINE } from '../data/timeline';
import { BP_ONE, applyBp, idiv } from './fixed';
import { G, type World } from './world';
import { mutOf } from './mutator';
import type { MatchHandle } from './state';
import { rulesOf } from './rules';

/** The map's late Sunset table: Hearthwood's steeper one on the 5v5 map (sim v32), the pool maps' own (sim v34). */
const lateOf = (w: World) => (w.mg.length > 0 ? HEARTHWOOD_LATE : w.ob.length > 0 ? POOL_LATE : LATE_SUNSET);

/** Ticks past the late tick (0 before it). */
const lateTicks = (w: World, tick: number): number => Math.max(0, tick - w.globals[G.Late]);

/** The extra structure damage share at `tick` (bp, 0 before the late tick), prorated by the tick; a mutator scales it
 *  (MutatorRules.lateRampBp). */
export function lateStructureBp(m: MatchHandle, tick: number, srcTeam: number): number {
  const w = m.world;
  const L = lateOf(w);
  const t = lateTicks(w, tick);
  if (t === 0) return 0;
  const mut = mutOf(w);
  const scale = mut.lateRampBp;
  const ramp = Math.min(applyBp(L.structureMaxBp, scale), idiv(applyBp(L.structureBpPerMinute, scale) * t, TIMELINE.minute));
  if (!mut.lateLead || !rulesOf(m).leadPressure || (srcTeam !== 0 && srcTeam !== 1)) return ramp;
  const lead = w.globals[srcTeam === 0 ? G.Kills0 : G.Kills1] - w.globals[srcTeam === 0 ? G.Kills1 : G.Kills0];
  return lead > 0 ? ramp + Math.min(L.leadMaxBp, lead * L.leadBpPerTakedown) : ramp;
}

/** A respawn wait set at `tick`: unchanged before the late tick, then longer, at most the map's respawnHardCap. */
export function lateRespawn(w: World, tick: number, ticks: number): number {
  const L = lateOf(w);
  const t = lateTicks(w, tick);
  if (t === 0) return ticks;
  const bp = Math.min(L.respawnMaxBp, idiv(L.respawnBpPerMinute * t, TIMELINE.minute));
  return Math.max(ticks, Math.min(applyBp(ticks, BP_ONE + bp), L.respawnHardCap));
}

/** A tower's damage to a minion at `tick` (bp): full before the late tick, then less every minute, at least
 *  the map's towerMinionMinBp. */
export function lateTowerMinionBp(w: World, tick: number): number {
  const L = lateOf(w);
  const t = lateTicks(w, tick);
  if (t === 0) return BP_ONE;
  return Math.max(L.towerMinionMinBp, BP_ONE - idiv(L.towerMinionBpPerMinute * t, TIMELINE.minute));
}
