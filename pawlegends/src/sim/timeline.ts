/**
 * Timeline (POC.md §7.3): phase of the match clock and the one-shot phase events. Waves, rat camps and Pudding
 * spawns are Dev A's M1/M3 work and hook in here.
 */
import { TIMELINE } from '../data/timeline';
import type { MatchClock, MatchPhase } from './api';
import { idiv } from './fixed';
import { TICK_HZ } from '../data/timeline';

/** Phase at `tick`; `sunset` and `suddenDeath` are the match's own (by difficulty, data/timeline.ts TIMELINE_BY). */
export function phaseAt(tick: number, ended: boolean, sunset: number = TIMELINE.sunset, suddenDeath: number = TIMELINE.suddenDeath): MatchPhase {
  if (ended) return 'ended';
  if (tick < TIMELINE.barrierDrop) return 'gate';
  if (tick < sunset) return 'play';
  if (tick < suddenDeath) return 'sunset';
  return 'suddenDeath';
}

function nextPhaseTick(tick: number, sunset: number, suddenDeath: number): number {
  if (tick < TIMELINE.barrierDrop) return TIMELINE.barrierDrop;
  if (tick < sunset) return sunset;
  if (tick < suddenDeath) return suddenDeath;
  if (tick < TIMELINE.safetyEnd) return TIMELINE.safetyEnd;
  return 0;
}

export function clockAt(tick: number, ended: boolean, sunset: number = TIMELINE.sunset, suddenDeath: number = TIMELINE.suddenDeath): MatchClock {
  const next = ended ? 0 : nextPhaseTick(tick, sunset, suddenDeath);
  return { tick, seconds: idiv(tick, TICK_HZ), phase: phaseAt(tick, ended, sunset, suddenDeath), nextPhaseIn: next === 0 ? 0 : next - tick };
}

/** Is a minion wave due at `tick`, and does it carry a siege unit? (−1 none, 0 plain, 1 with siege.) */
export function waveAt(tick: number, siegeWavesSoFar: number): number {
  if (tick < TIMELINE.firstWave || (tick - TIMELINE.firstWave) % TIMELINE.waveEvery !== 0) return -1;
  if (tick < TIMELINE.siegeFrom) return 0;
  return siegeWavesSoFar % TIMELINE.siegeEveryNthWave === 0 ? 1 : 0;
}
