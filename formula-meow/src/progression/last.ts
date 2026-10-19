/**
 * The award of the race whose results are on screen. Set on `raceEnd`; a time trial medal (modes lane) or a class the
 * shell unlocked in the same breath is merged in before the results section draws (the results layer mounts a few
 * microtasks after `raceEnd`).
 */
import type { Award } from './record';

export interface LastAward {
  award: Award;
  /** the shell's race token and the race seed when it was recorded (a section never shows another race's award) */
  token: number;
  seed: number;
  fishBefore: number;
}

let last: LastAward | null = null;

export function setLastAward(award: Award, token: number, seed: number, fishBefore: number): void {
  last = { award, token, seed, fishBefore };
}

export function lastAward(): LastAward | null {
  return last;
}
