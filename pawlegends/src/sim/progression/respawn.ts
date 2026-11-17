/**
 * Respawn (POC.md §6.1, sim v4): 3 s + 0.6 s × level, capped at 9 s; at most 4 s before 2:00; × 1.25 after Sunset.
 * (Rookie: the human's own respawn × DIFFICULTY_RULES.humanRespawnBp, in combat/damage.ts.)
 * Sim v33: from RESPAWN.growFrom the wait grows `growBp` a minute (DifficultyRules.respawnGrowBp), at most
 * RESPAWN.growMaxBp more, before Sunset's ×1.25: short early, long late (Wild Rift and LoL).
 * Sim v35 (docs/plans/moba/V35-DEATHS.md): × (1 + the hero's death weight × RESPAWN.deathPerBp), so every death makes
 * the next wait longer.
 */
import { RESPAWN } from '../../data/xp';
import { SUNSET, TIMELINE } from '../../data/timeline';
import { BP_ONE, applyBp, idiv } from '../fixed';

export function respawnTicks(level: number, tick: number, sunset: number = TIMELINE.sunset, growBp = 0, deathBp = 0): number {
  let t = Math.min(RESPAWN.base + RESPAWN.perLevel * level, RESPAWN.cap);
  if (tick < RESPAWN.earlyUntil) t = Math.min(t, RESPAWN.earlyCap);
  if (growBp > 0 && tick > RESPAWN.growFrom) t = applyBp(t, BP_ONE + Math.min(RESPAWN.growMaxBp, idiv(growBp * (tick - RESPAWN.growFrom), TIMELINE.minute)));
  // Sim v35: the hero's earlier deaths (deathWeightBp) on top of the match-time growth, from the same tick (deaths
  // before RESPAWN.growFrom still count, but the opening minutes keep their short waits)
  if (deathBp > 0 && tick > RESPAWN.growFrom) t = applyBp(t, BP_ONE + deathBp);
  return tick >= sunset ? applyBp(t, SUNSET.respawnBp) : t;
}

/**
 * Sim v35: the extra wait (bp) of a hero whose death weight is `weight` (deaths before this one, less one for every
 * RESPAWN.forgiveTicks lived), × the difficulty's deathGrowBp; at most RESPAWN.deathMaxBp.
 */
export function deathWeightBp(weight: number, growBp: number): number {
  if (weight <= 0 || growBp <= 0) return 0;
  return applyBp(Math.min(RESPAWN.deathMaxBp, weight * RESPAWN.deathPerBp), growBp);
}
