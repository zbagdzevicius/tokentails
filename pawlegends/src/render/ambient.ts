/**
 * Living pass: one ambient-life level per quality tier and the reduce-motion switch, shared by the map, the
 * structures, the units and the impact FX. Render only: never feeds the sim. Low is level 0 and costs nothing.
 */
import type { QualityTier, TierSettings } from './quality';
import type { Particles } from './fx/Particles.js';
import type { Shockwaves } from './fx/Shockwaves.js';

export interface Ambient {
  /** 0 off (Low), 1 modest (Med), 2 full (High). */
  level: 0 | 1 | 2;
  tier: QualityTier;
  reduced: boolean;
  phone: boolean;
  /** Amplitude scale 0..1 (wind, waves, bob). */
  motion: number;
  /** Speed scale (reduce motion halves it). */
  speed: number;
  /** Count scale 0..1 (critters, dust, foam bits). */
  density: number;
}

export function ambientFor(s: Pick<TierSettings, 'tier' | 'phone'>, reduced: boolean): Ambient {
  const level: 0 | 1 | 2 = s.tier === 'high' ? 2 : s.tier === 'med' ? 1 : 0;
  if (level === 0) return { level, tier: s.tier, reduced, phone: s.phone, motion: 0, speed: 1, density: 0 };
  let motion = level === 2 ? 1 : 0.7;
  let density = level === 2 ? (s.phone ? 0.6 : 1) : s.phone ? 0.35 : 0.5;
  let speed = 1;
  if (reduced) {
    motion *= 0.3;
    density *= 0.4;
    speed = 0.5;
  }
  return { level, tier: s.tier, reduced, phone: s.phone, motion, speed, density };
}

/** The shared particle pools and shockwaves, for views that emit ambient bits (dust, splashes, drips). */
export interface AmbientFx {
  particles: Particles;
  shock: Shockwaves;
}

/** Calls `target.setAmbient(a)` when the target has it, so each view can add the hook on its own schedule. */
export function applyAmbient(target: unknown, a: Ambient): void {
  const t = target as { setAmbient?: (a: Ambient) => void } | null;
  if (t && typeof t.setAmbient === 'function') t.setAmbient(a);
}

/** Calls `target.setAmbientFx(fx)` when the target has it (once, after construction). */
export function attachAmbientFx(target: unknown, fx: AmbientFx): void {
  const t = target as { setAmbientFx?: (fx: AmbientFx) => void } | null;
  if (t && typeof t.setAmbientFx === 'function') t.setAmbientFx(fx);
}

/**
 * Living pass (P4): the light drift on High (renderer.ts lightDrift). Light drift at view time `t` (s): intensity factor
 * and warmth (−1 cool .. +1 warm); the renderer scales both to ±DRIFT.amp. Pure.
 */
export const DRIFT = Object.freeze({ amp: 0.03, period: 120 });
export function driftAt(t: number, out: { k: number; warm: number } = { k: 1, warm: 0 }): { k: number; warm: number } {
  const w = (Math.PI * 2) / DRIFT.period;
  // two slow, incommensurate sines: no visible loop, never past ±1
  const a = 0.7 * Math.sin(t * w) + 0.3 * Math.sin(t * w * 2.37 + 1.1);
  const b = 0.65 * Math.sin(t * w * 0.83 + 2.2) + 0.35 * Math.sin(t * w * 1.91 + 0.4);
  out.k = 1 + DRIFT.amp * b;
  out.warm = a;
  return out;
}

