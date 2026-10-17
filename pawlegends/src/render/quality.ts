/**
 * Quality tiers (POC.md §10): PPK `QUALITY` (low / med / high) merged with the Heist FPS-probe governor
 * (pattern: catnip-heist/src/render/quality.ts). `?quality=low|med|high` forces a tier. Otherwise the renderer starts
 * on med; an FpsProbe measures ~2 s after a warm-up and drops to low under LOW_FPS, and the governor keeps watching
 * and steps down on a sustained drop. Render side only: never feeds the sim.
 *
 * Low: DPR 1.25, no shadows, no bloom, no outlines.
 */
import { QUALITY } from './ppk/core/config.js';

export type QualityTier = 'low' | 'med' | 'high';
export const TIERS: readonly QualityTier[] = ['low', 'med', 'high'];

/** Average fps under which the probe and the governor drop a tier. */
export const LOW_FPS = 42;

export interface TierSettings {
  tier: QualityTier;
  maxDpr: number;
  shadows: boolean;
  bloom: boolean;
  outlines: boolean;
  antialias: boolean;
}

interface PpkQuality {
  maxDpr?: number;
  shadows?: string;
  cinematic?: boolean;
  outline?: string;
}

/** Settings for a tier: PPK values where they exist, the §10 Low rules always. */
export function tierSettings(tier: QualityTier): TierSettings {
  const q = ((QUALITY as Record<string, PpkQuality | undefined>)[tier] ?? {}) as PpkQuality;
  if (tier === 'low') return { tier, maxDpr: 1.25, shadows: false, bloom: false, outlines: false, antialias: false };
  return {
    tier,
    maxDpr: Math.max(1.25, q.maxDpr ?? 1.5),
    shadows: (q.shadows ?? 'none') !== 'none',
    bloom: tier === 'high' && q.cinematic !== false,
    outlines: (q.outline ?? 'none') !== 'none',
    antialias: true,
  };
}

/** Forced tier from the URL, or null for auto. */
export function qualityOverride(search: string = typeof location !== 'undefined' ? location.search : ''): QualityTier | null {
  try {
    const q = new URLSearchParams(search).get('quality');
    return q === 'low' || q === 'med' || q === 'high' ? q : null;
  } catch {
    return null;
  }
}

const KEY = 'pawlegends.quality';

export function rememberedTier(): QualityTier | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === 'low' || v === 'med' || v === 'high' ? v : null;
  } catch {
    return null;
  }
}

export function rememberTier(t: QualityTier): void {
  try {
    sessionStorage.setItem(KEY, t);
  } catch {
    /* storage blocked */
  }
}

/** Starting tier: URL override, else this session's probe result, else med with a probe. */
export function startTier(search?: string): { tier: QualityTier; probe: FpsProbe | null } {
  const forced = qualityOverride(search);
  if (forced) return { tier: forced, probe: null };
  const r = rememberedTier();
  if (r) return { tier: r, probe: null };
  return { tier: 'med', probe: new FpsProbe() };
}

/**
 * Measures frame times for `seconds` after `warmup` seconds. Frames over 1 s (tab switches, shader compiles) are
 * ignored; four frames in a row under 15 fps decide 'low' at once.
 */
export class FpsProbe {
  private t = 0;
  private frames = 0;
  private measured = 0;
  private slowRun = 0;
  private result: 'low' | 'ok' | null = null;

  constructor(
    private readonly seconds = 2,
    private readonly warmup = 0.6,
    private readonly lowFps = LOW_FPS,
  ) {}

  get done(): boolean {
    return this.result !== null;
  }

  get fps(): number {
    return this.measured > 0 ? this.frames / this.measured : 0;
  }

  /** Feed one frame's dt (s). Returns 'low' or 'ok' once decided, else null. */
  sample(dt: number): 'low' | 'ok' | null {
    if (this.result) return this.result;
    if (!(dt > 0) || dt > 1) return null;
    this.t += dt;
    if (this.t < this.warmup) return null;
    this.slowRun = dt > 1 / 15 ? this.slowRun + 1 : 0;
    this.frames++;
    this.measured += dt;
    if (this.slowRun >= 4) this.result = 'low';
    else if (this.measured >= this.seconds) this.result = this.fps < this.lowFps ? 'low' : 'ok';
    return this.result;
  }
}

/** After the probe: a sustained drop (window average under LOW_FPS for `window` s) steps one tier down. */
export class QualityGovernor {
  private acc = 0;
  private frames = 0;

  constructor(
    private readonly window = 4,
    private readonly lowFps = LOW_FPS,
  ) {}

  /** Returns the tier to switch to, or null to stay. */
  sample(dt: number, tier: QualityTier): QualityTier | null {
    if (!(dt > 0) || dt > 1) return null;
    this.acc += dt;
    this.frames++;
    if (this.acc < this.window) return null;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (fps >= this.lowFps || tier === 'low') return null;
    return TIERS[TIERS.indexOf(tier) - 1];
  }
}
