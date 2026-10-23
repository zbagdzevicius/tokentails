/**
 * Accessibility state (iteration 2 contract: API integrator-owned, the colour sets and choices belong to audio-ui).
 * The shell feeds settings in with `setA11y`; renderers and the HUD read `driftTierColors()` / `reducedMotion()` and
 * subscribe with `onA11yChange`.
 */
import { DRIFT } from '../tuning';
import type { Colourblind } from '../core/app/save';

export interface A11yState {
  reducedMotion: boolean;
  colourblind: Colourblind;
  highContrast: boolean;
  textScale: number;
  captions: boolean;
  haptics: boolean;
}

/** Drift tier colours (blue, orange, pink) per colourblind mode; audio-ui tunes the sets. */
export const TIER_COLOURS: Readonly<Record<Colourblind, readonly [number, number, number]>> = {
  off: DRIFT.colors,
  deut: [0x3aa8ff, 0xffd23f, 0xffffff],
  prot: [0x3aa8ff, 0xffd23f, 0xffffff],
  trit: [0xff4d6d, 0x2cf6f3, 0xffffff],
};

let state: A11yState = { reducedMotion: false, colourblind: 'off', highContrast: false, textScale: 1, captions: false, haptics: true };
let listeners: Array<(s: A11yState) => void> = [];

export function setA11y(next: Partial<A11yState>): void {
  state = { ...state, ...next };
  if (typeof document !== 'undefined') {
    const r = document.documentElement;
    r.dataset.contrast = state.highContrast ? 'high' : '';
    r.style.setProperty('--fm-text-scale', String(state.textScale));
    r.dataset.motion = state.reducedMotion ? 'reduced' : '';
  }
  for (const fn of listeners.slice()) fn(state);
}

export function a11y(): Readonly<A11yState> {
  return state;
}

export function driftTierColors(): readonly [number, number, number] {
  return TIER_COLOURS[state.colourblind] ?? TIER_COLOURS.off;
}

export function reducedMotion(): boolean {
  return state.reducedMotion;
}

export function onA11yChange(fn: (s: A11yState) => void): () => void {
  listeners.push(fn);
  return () => (listeners = listeners.filter((x) => x !== fn));
}
