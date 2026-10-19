/**
 * Share lane extension points (GDD 8–9). The core shell calls these; the share lane fills them in (finish clip,
 * dare links, result card, daily cup, Pink Paw adopt line). Nothing here may move money or claim donations.
 */
import type { CatSpec, RaceConfig, RaceEvent, RaceResult } from '../types';
import type { Replay } from '../core/sim/replay';

export interface ResultAction {
  id: string;
  label: string;
  primary?: boolean;
  run(): void;
}

export interface ResultContext {
  result: RaceResult;
  replay: Replay;
  cfg: RaceConfig;
  events: readonly RaceEvent[];
}

export interface ResultExtras {
  /** extra buttons under Again / Next track (e.g. "Share clip", "Beat 1:24.31 →") */
  actions?: ResultAction[];
  /** extra lines of text (honest, measured on the device only) */
  lines?: string[];
}

export interface RouteSetup {
  trackId?: string;
  cls?: 0 | 1 | 2;
  seed?: number;
  modifiers?: number;
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
