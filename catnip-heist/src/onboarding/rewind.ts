/**
 * "Rewind 5 s" (plan G10 "Heist", decision #72): on the first three levels, a detection offers to
 * go back to five seconds before the cat was seen.
 *
 * The rewind never touches the sim or the server verifier. It cuts the recorded input log back to
 * that tick and re-simulates the cut log from the start (`HeistSession.rewindTo`), so the state on
 * screen is exactly the state any replay of the cut log reaches. Play then continues from there and
 * the saved run is the cut-then-continued log: an ordinary input log that `verifyRun` replays from
 * tick 0 like any other.
 */
import { TICK_HZ } from '../types';
import { LEVEL_IDS } from '../levels';

/** How far a rewind goes back: 5 s of sim time. */
export const REWIND_TICKS = 5 * TICK_HZ;
/** How long the offer stays up after a detection: 6 s of play (sim ticks, so pause does not count). */
export const REWIND_OFFER_TICKS = 6 * TICK_HZ;
export const REWIND_OFFER_MS = (REWIND_OFFER_TICKS / TICK_HZ) * 1000;
/** Levels with the rewind: the first three of the campaign. */
export const REWIND_LEVELS: readonly string[] = LEVEL_IDS.slice(0, 3);

export function canRewind(levelId: string): boolean {
  return REWIND_LEVELS.includes(levelId);
}

/** The tick a rewind for a detection on `spottedTick` returns to. */
export function rewindTarget(spottedTick: number): number {
  return Math.max(0, Math.floor(spottedTick) - REWIND_TICKS);
}

/**
 * The rewind's analytics funnel, per run: `ftue_hint_shown {hint:'rewind'}` on the first offer and
 * `ftue_hint_done {hint:'rewind'}` on the first rewind, each at most once, so "done" can never
 * exceed "shown" and done/shown reads as the share of runs that used the offer. How many rewinds a
 * run used is on the end events (`rewinds`).
 */
export class RewindFunnel {
  private shown = false;
  private done = false;

  /** A new run. */
  reset(): void {
    this.shown = false;
    this.done = false;
  }

  /** The offer went up: true when `ftue_hint_shown` should be sent. */
  offered(): boolean {
    if (this.shown) return false;
    this.shown = true;
    return true;
  }

  /** The player rewound: true when `ftue_hint_done` should be sent. */
  rewound(): boolean {
    if (this.done || !this.shown) return false;
    this.done = true;
    return true;
  }
}
