/** L5 UI + input + game loop public API (LANES.md). */
import type { EnvInfo, GameServices, InputSource } from '../types';
import { startApp as startShell } from './app-shell';
import { createInput as createGameInput } from './input/source';

export { quantiseStick, keysToDir, stickAngle, sectorOf, STICK_REST, type StickState } from './input/quantise';
export { advance, createLoop, TICK_MS, type Loop, type LoopHooks, type Clock } from './loop';
export { reduce, planFor, initialRouter, routeScreen, Router, type Screen, type SheetKind, type RouterState, type RouterEvent, type RouterCtx, type Entry, type RunPlan } from './router';
export { emojiTimeline, rankFor, formatScore, formatClock } from './copy';
export type { GameInput } from './input/source';
export { entryFromLink, silentAudio, type QaHook } from './app-shell';

/** Boots the router state machine (GDD 13.5) inside `root`. */
export function startApp(root: HTMLElement, services: GameServices): void {
  startShell(root, services);
}

/** Touch stick + SWAT/JUMP buttons (mobile) and keyboard (desktop), quantised with hysteresis. */
export function createInput(stage: HTMLElement, env: EnvInfo): InputSource {
  return createGameInput(stage, env);
}
