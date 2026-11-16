/**
 * Timeline (POC.md §7.3): phase of the match clock and the one-shot phase events. Waves, rat camps and Pudding
 * spawns are Dev A's M1/M3 work and hook in here. Sim v32: Sunset is the last phase (Sudden Death, sim v4 to v31, is
 * gone; docs/plans/moba/V32-NO-SUDDEN-DEATH.md).
 */
import { TIMELINE } from '../data/timeline';
import type { MatchClock, MatchPhase } from './api';
import { idiv } from './fixed';
import { TICK_HZ } from '../data/timeline';

/** Phase at `tick`; `sunset` is the match's own (by difficulty, data/timeline.ts TIMELINE_BY). */
export function phaseAt(tick: number, ended: boolean, sunset: number = TIMELINE.sunset): MatchPhase {
  if (ended) return 'ended';
  if (tick < TIMELINE.barrierDrop) return 'gate';
  if (tick < sunset) return 'play';
  return 'sunset';
}

function nextPhaseTick(tick: number, sunset: number, end: number): number {
  if (tick < TIMELINE.barrierDrop) return TIMELINE.barrierDrop;
  if (tick < sunset) return sunset;
  if (end > 0 && tick < end) return end;
  return 0;
}

/**
 * Sim v22: `end` is a mode's designed end (a Blitz match's time up). Sim v32: 0 = none, so in Sunset the clock counts
 * down to nothing (the map's safety end is a last resort, never a countdown).
 */
export function clockAt(tick: number, ended: boolean, sunset: number = TIMELINE.sunset, end = 0): MatchClock {
  const next = ended ? 0 : nextPhaseTick(tick, sunset, end);
  return { tick, seconds: idiv(tick, TICK_HZ), phase: phaseAt(tick, ended, sunset), nextPhaseIn: next === 0 ? 0 : next - tick };
}

/** Is a minion wave due at `tick`, and does it carry a siege unit? (−1 none, 0 plain, 1 with siege.) */
export function waveAt(tick: number, siegeWavesSoFar: number): number {
  if (tick < TIMELINE.firstWave || (tick - TIMELINE.firstWave) % TIMELINE.waveEvery !== 0) return -1;
  if (tick < TIMELINE.siegeFrom) return 0;
  return siegeWavesSoFar % TIMELINE.siegeEveryNthWave === 0 ? 1 : 0;
}
