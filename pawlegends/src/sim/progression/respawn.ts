/**
 * Respawn (POC.md §6.1, sim v4): 3 s + 0.6 s × level, capped at 9 s; at most 4 s before 2:00; × 1.25 after Sunset.
 * (Rookie: the human's own respawn × DIFFICULTY_RULES.humanRespawnBp, in combat/damage.ts.)
 * Sim v33: from RESPAWN.growFrom the wait grows `growBp` a minute (DifficultyRules.respawnGrowBp), at most
 * RESPAWN.growMaxBp more, before Sunset's ×1.25: short early, long late (Wild Rift and LoL).
 */
import { RESPAWN } from '../../data/xp';
import { SUNSET, TIMELINE } from '../../data/timeline';
import { BP_ONE, applyBp, idiv } from '../fixed';

export function respawnTicks(level: number, tick: number, sunset: number = TIMELINE.sunset, growBp = 0): number {
  let t = Math.min(RESPAWN.base + RESPAWN.perLevel * level, RESPAWN.cap);
  if (tick < RESPAWN.earlyUntil) t = Math.min(t, RESPAWN.earlyCap);
  if (growBp > 0 && tick > RESPAWN.growFrom) t = applyBp(t, BP_ONE + Math.min(RESPAWN.growMaxBp, idiv(growBp * (tick - RESPAWN.growFrom), TIMELINE.minute)));
  return tick >= sunset ? applyBp(t, SUNSET.respawnBp) : t;
}
