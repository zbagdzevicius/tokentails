/**
 * When to offer the ghost-paw route (plan G10 "Heist"): after 20 s of sim time without progress,
 * after two fails (spotted twice) on the same objective, or when the player taps the objective chip.
 * The route hides again once the objective moves on (that is `ftue_hint_done`).
 *
 * Counted in sim ticks, so pause, a background tab or the brief card never count as "stuck", and
 * the result is the same at any frame rate. Pure: unit-tested without a DOM.
 */
import { TICK_HZ, type LevelDef, type SimState } from '../types';
import { stageIndex } from './route';

/** Ticks without progress before the route is offered (20 s). */
export const ROUTE_IDLE_TICKS = 20 * TICK_HZ;
/** Times spotted on one objective before the route is offered. */
export const ROUTE_FAILS = 2;

export type RouteTrigger = 'idle' | 'fails' | 'tap';

export type HintChange = { type: 'show'; trigger: RouteTrigger } | { type: 'done'; trigger: RouteTrigger } | null;

export interface HintTrackerOptions {
  /** Offer the route on its own (idle / fails). False on levels already won: only a tap shows it. */
  auto?: boolean;
  idleTicks?: number;
  fails?: number;
}

export class RouteHintTracker {
  private readonly auto: boolean;
  private readonly idleTicks: number;
  private readonly failLimit: number;
  /** Highest stage reached (progress only counts forwards). */
  private maxStage = -1;
  private lastProgress = 0;
  private fails = 0;
  private shown: RouteTrigger | null = null;

  constructor(opts: HintTrackerOptions = {}) {
    this.auto = opts.auto ?? true;
    this.idleTicks = opts.idleTicks ?? ROUTE_IDLE_TICKS;
    this.failLimit = opts.fails ?? ROUTE_FAILS;
  }

  /** The route is on screen (and why), or null. */
  get active(): RouteTrigger | null {
    return this.shown;
  }

  /** Start (or restart after a rewind) from `s` without counting it as progress. */
  reset(level: LevelDef, s: SimState, keepShown = false): void {
    this.maxStage = stageIndex(level, s);
    this.lastProgress = s.tick;
    this.fails = 0;
    if (!keepShown) this.shown = null;
  }

  /** Feed every sim state (with its events) in order. Returns what changed, if anything. */
  observe(level: LevelDef, s: SimState): HintChange {
    if (this.maxStage < 0) this.reset(level, s);
    const stage = stageIndex(level, s);
    let progressed = false;
    for (const e of s.events) {
      if (e.type === 'KEY' || e.type === 'RESCUE' || e.type === 'CHECKPOINT' || (e.type === 'DOOR' && e.open)) progressed = true;
      if (e.type === 'SPOTTED') this.fails++;
    }
    if (stage > this.maxStage) {
      this.maxStage = stage;
      this.fails = 0;
      this.lastProgress = s.tick;
      const was = this.shown;
      this.shown = null;
      if (was) return { type: 'done', trigger: was };
      return null;
    }
    if (progressed) this.lastProgress = s.tick;
    if (this.shown || !this.auto || s.won) return null;
    if (this.fails >= this.failLimit) return this.show('fails');
    if (s.tick - this.lastProgress >= this.idleTicks) return this.show('idle');
    return null;
  }

  /** The player tapped the objective chip: show the route, or hide it when it is already up. */
  tap(): HintChange {
    if (this.shown) {
      this.shown = null;
      return null;
    }
    return this.show('tap');
  }

  private show(trigger: RouteTrigger): HintChange {
    this.shown = trigger;
    return { type: 'show', trigger };
  }
}
