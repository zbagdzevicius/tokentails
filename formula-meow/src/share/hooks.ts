/**
 * Share lane extension points (GDD 8–9). The core shell calls these; the share lane fills them in (finish clip,
 * dare links, result card, daily cup, Pink Paw adopt line). Nothing here may move money or claim donations.
 */
import type { CatSpec, RaceConfig, RaceEvent, RaceMode, RaceResult } from '../types';
import type { Replay } from '../core/sim/replay';

export interface ResultAction {
  id: string;
  label: string;
  primary?: boolean;
  /** 'icon' actions sit in the small row under the main buttons */
  tier?: 'main' | 'icon';
  /**
   * Iteration 4 (F7): why this button deserves a tap now (the clip after a strong highlight: "That ×4 combo deserves a
   * clip"). The results screen pulses the button and shows the reason over the footer. Quiet races leave it unset.
   */
  hype?: string;
  run(): void;
}

export interface ResultContext {
  result: RaceResult;
  replay: Replay;
  cfg: RaceConfig;
  events: readonly RaceEvent[];
  /** the race's mode and Daily Cup day as the shell started it */
  mode?: RaceMode;
  day?: number;
}

export interface ResultExtras {
  /** extra buttons under Again / Next track (e.g. "Share clip", "Beat 1:24.31 →") */
  actions?: ResultAction[];
  /** extra lines of text (honest, measured on the device only) */
  lines?: string[];
  /** a dare ghost raced this run: its row goes into the standings (time recomputed, never trusted) */
  ghost?: { name: string; time: number | null };
  /** true when this race must not unlock classes (Daily Cup and dares run at a fixed class) */
  noUnlock?: boolean;
  /**
   * Filled in after the results are up (B50: the dare ghost's time is recomputed over a few frames, not on the
   * results frame). The shell applies it only while the same results are on screen.
   */
  later?: Promise<{ ghost?: { name: string; time: number | null }; lines?: string[] } | null>;
}

export interface RouteSetup {
  trackId?: string;
  cls?: 0 | 1 | 2;
  seed?: number;
  modifiers?: number;
  /** 'daily' or 'dare' for share routes */
  mode?: RaceMode;
  /** Daily Cup day number */
  day?: number;
}

export interface ShareHooks {
  /** called once per finished race; may return extra result-screen content */
  onResult?(ctx: ResultContext): ResultExtras | void;
  /** parse the page URL (dares, UGC tracks, daily) into a race setup; null = default race */
  resolveRoute?(loc: Location): RouteSetup | null;
  /** the player's own racer (cat maker): name and coat for the player slot; null = the default cat, "You" */
  playerRacer?(): { name: string; cat: CatSpec } | null;
}

let hooks: ShareHooks = {};

export function setShareHooks(h: ShareHooks): void {
  hooks = { ...hooks, ...h };
}

export function shareHooks(): ShareHooks {
  return hooks;
}
