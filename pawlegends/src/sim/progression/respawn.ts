/** Respawn (POC.md §6.1): 4 s + 0.8 s × level, capped at 12 s; × 1.5 after Sunset. */
import { RESPAWN } from '../../data/xp';
import { SUNSET, TIMELINE } from '../../data/timeline';
import { applyBp } from '../fixed';

export function respawnTicks(level: number, tick: number): number {
  const t = Math.min(RESPAWN.base + RESPAWN.perLevel * level, RESPAWN.cap);
  return tick >= TIMELINE.sunset ? applyBp(t, SUNSET.respawnBp) : t;
}
