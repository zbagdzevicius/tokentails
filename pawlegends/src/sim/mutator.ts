/**
 * Sim v22 (WR-BS-PLAN.md §4.4): the match's mutator row (data/mutators.ts). Every system that a mutator changes reads
 * it here; the 'none' row is neutral, so a 'none' match is byte-identical to v21.
 */
import { MUTATOR_RULES, type MutatorRules } from '../data/mutators';
import { TIMELINE } from '../data/timeline';
import { TOWERS } from '../data/towers';
import { MUTATORS, type Mutator } from './api';
import { idiv } from './fixed';
import type { World } from './world';

export const mutatorIndex = (m: Mutator | undefined): number => Math.max(0, MUTATORS.indexOf(m ?? 'none'));
export const mutatorOf = (w: World): Mutator => MUTATORS[w.mutator] ?? 'none';
export const mutOf = (w: World): MutatorRules => MUTATOR_RULES[mutatorOf(w)];
export const isBlitz = (w: World): boolean => mutatorOf(w) === 'blitz';

/** The tick the match ends at the latest: the mutator's hard end, else the map's safety end. */
export const endTickOf = (w: World): number => mutOf(w).hardEnd || TIMELINE.safetyEnd;

/** Blitz respawn: respawnFrom at 0:00 rising in a straight line to respawnTo at the hard end (−1: the normal rules). */
export function mutatorRespawn(w: World, tick: number): number {
  const r = mutOf(w);
  if (r.respawnFrom <= 0) return -1;
  const end = Math.max(1, r.hardEnd);
  const t = Math.min(Math.max(0, tick), end);
  return r.respawnFrom + idiv((r.respawnTo - r.respawnFrom) * t, end);
}

/**
 * Sim v22: the replay shape check of a record's `mutator` (no field = 'none'). Null when it is fine: a known mutator, on
 * one of its maps, never in PvP.
 */
export function mutatorProblem(mutator: unknown, map: unknown, pvp: boolean): string | null {
  if (mutator === undefined || mutator === 'none') return null;
  if (!(MUTATORS as readonly unknown[]).includes(mutator)) return `unknown mutator ${String(mutator)}`;
  if (pvp) return 'a pvp record carries no mutator';
  const maps = MUTATOR_RULES[mutator as Mutator].maps;
  if (maps.length > 0 && !(maps as readonly unknown[]).includes(map ?? 'crossing')) return `mutator ${String(mutator)} is not played on ${String(map ?? 'crossing')}`;
  return null;
}

/** Sim v21 Fortified ends at this tick (sim v22: a mutator's own, Blitz never fortifies). */
export const fortifyUntilOf = (w: World): number => {
  const f = mutOf(w).fortifyUntil;
  return f >= 0 ? f : TOWERS.fortifyUntil[w.map];
};
