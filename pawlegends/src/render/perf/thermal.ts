/**
 * PERF-IOS P2-7: the iOS thermal state and Low Power Mode, when the app shell forwards them
 * (`pawlegends-app/ios/App/App/GameViewController.swift` sets `window.__PL_THERMAL__ = { state, lowPower }` and fires
 * a `pl-thermal` event on each change). Older binaries and the web build have none: `thermal()` is then null and the
 * governor works from frame times alone, so OTA bundles keep working everywhere.
 */
import type { ThermalState } from './governor';

export interface ThermalInfo {
  state: ThermalState | null;
  lowPower: boolean;
}

export function parseThermal(v: unknown): ThermalInfo {
  const o = (v && typeof v === 'object' ? v : {}) as { state?: unknown; lowPower?: unknown };
  const s = o.state;
  const state = s === 'nominal' || s === 'fair' || s === 'serious' || s === 'critical' ? s : null;
  return { state, lowPower: o.lowPower === true };
}

export function thermal(): ThermalInfo {
  try {
    return parseThermal((globalThis as { __PL_THERMAL__?: unknown }).__PL_THERMAL__);
  } catch {
    return { state: null, lowPower: false };
  }
}
