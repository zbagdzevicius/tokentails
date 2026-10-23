/**
 * Respawn (POC.md §6.1, sim v4): 3 s + 0.6 s × level, capped at 9 s; at most 4 s before 2:00; × 1.25 after Sunset.
 * (Rookie: the human's own respawn × DIFFICULTY_RULES.humanRespawnBp, in combat/damage.ts.)
 */
import { RESPAWN } from '../../data/xp';
import { SUNSET, TIMELINE } from '../../data/timeline';
import { applyBp } from '../fixed';

export function respawnTicks(level: number, tick: number, sunset: number = TIMELINE.sunset): number {
  let t = Math.min(RESPAWN.base + RESPAWN.perLevel * level, RESPAWN.cap);
  if (tick < RESPAWN.earlyUntil) t = Math.min(t, RESPAWN.earlyCap);
  return tick >= sunset ? applyBp(t, SUNSET.respawnBp) : t;
}
