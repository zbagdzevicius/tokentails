/**
 * Quality tiers (POC.md §10): PPK `QUALITY` (low / med / high) merged with the Heist FPS-probe pattern
 * (catnip-heist/src/render/quality.ts). `?quality=low|med|high` forces a tier. Otherwise the renderer starts on med
 * and an FpsProbe measures the first seconds **of the first match** (not the title screen, which every phone passed)
 * and drops to low under LOW_FPS. Render side only: never feeds the sim.
 *
 * PERF-IOS (docs/plans/moba/PERF-IOS.md): `tierSettings(tier, { phone, step })` also applies
 * - the phone profile (render/perf/device.ts): Medium's look with a 512² sun shadow map drawn every second frame, the
 *   outline hull on the own hero and enemies only, the far forest at half, the Low particle budget, the overhead canvas
 *   at DPR 1.5 and the minimap at 15 Hz;
 * - the thermal governor's step (render/perf/governor.ts): shadows → lighter overlay → Low → 30 fps → resolution.
 * The tier is remembered per device in localStorage (a player's Settings choice, or the probe's result).
 *
 * Low: DPR 1.25, no shadows, no bloom, no outlines (on a phone, the own hero and enemies keep theirs).
 */
import { QUALITY } from './ppk/core/config.js';
import { GOV_STEP } from './perf/governor';
import { isLowEndDevice, lowEndInput, type LowEndInput } from './perf/device';

export type QualityTier = 'low' | 'med' | 'high';
export const TIERS: readonly QualityTier[] = ['low', 'med', 'high'];

/** Average fps under which the probe drops a tier. */
export const LOW_FPS = 42;

/** Which heroes draw the outline hull: everyone, the own hero and enemies ("key"), the own hero, or none. */
export type OutlineScope = 'all' | 'key' | 'own' | 'none';

export interface TierSettings {
  /** The effective tier (the governor's Low step makes it 'low'). */
  tier: QualityTier;
  maxDpr: number;
  shadows: boolean;
  bloom: boolean;
  /** Any outline hull at all (outlineScope !== 'none'). */
  outlines: boolean;
  outlineScope: OutlineScope;
  antialias: boolean;
  /** MAP-GAPS A23: the sun's shadow map size (px square): 2048 on High, 1024 below, 512 on a phone. */
  shadowMap: number;
  /** The shadow map is redrawn every Nth frame (2 on a phone: 30 Hz shadows are not visible at this camera). */
  shadowEvery: number;
  /** Far forest at half (Low, phones, the governor's first step). */
  forestHalf: boolean;
  /** The particle budget tier (combat VFX). */
  vfxTier: QualityTier;
  /** The overhead bars-and-names canvas's backing-store DPR cap. */
  overheadDpr: number;
  /** Minimap redraws a second. */
  minimapHz: number;
  /** The match frame cap (the governor's 30 fps step). */
  fpsCap: number;
  /** Drawing-buffer scale on top of maxDpr (dynamic resolution, the governor's last steps). */
  resScale: number;
  phone: boolean;
  /** The governor step applied (0 = none). */
  step: number;
}

interface PpkQuality {
  maxDpr?: number;
  shadows?: string;
  cinematic?: boolean;
  outline?: string;
}

export interface ProfileOpts {
  phone?: boolean;
  step?: number;
}

function baseTier(tier: QualityTier, phone: boolean): TierSettings {
  const q = ((QUALITY as Record<string, PpkQuality | undefined>)[tier] ?? {}) as PpkQuality;
  const common = { fpsCap: 60, resScale: 1, phone, step: 0, minimapHz: phone ? 15 : 30, overheadDpr: phone ? 1.5 : 2 };
  if (tier === 'low') {
    const outlineScope: OutlineScope = phone ? 'own' : 'none';
    return { ...common, tier, maxDpr: 1.25, shadows: false, bloom: false, outlines: outlineScope !== 'none', outlineScope, antialias: false, shadowMap: 1024, shadowEvery: 1, forestHalf: true, vfxTier: 'low' };
  }
  const outlines = (q.outline ?? 'none') !== 'none';
  const phoneMed = phone && tier === 'med';
  const outlineScope: OutlineScope = !outlines ? 'none' : phoneMed ? 'key' : 'all';
  return {
    ...common,
    tier,
    maxDpr: Math.max(1.25, q.maxDpr ?? 1.5),
    shadows: (q.shadows ?? 'none') !== 'none',
    bloom: tier === 'high' && q.cinematic !== false && !phone,
    outlines: outlineScope !== 'none',
    outlineScope,
    antialias: true,
    shadowMap: tier === 'high' ? (phone ? 1024 : 2048) : phone ? 512 : 1024,
    shadowEvery: phone ? 2 : 1,
    forestHalf: phoneMed,
    vfxTier: phoneMed ? 'low' : tier,
  };
}

/** Settings for a tier: PPK values where they exist, the §10 Low rules always, then the phone profile and the step. */
export function tierSettings(tier: QualityTier, o: ProfileOpts = {}): TierSettings {
  const phone = o.phone === true;
  const step = Math.max(0, Math.min(6, (o.step ?? 0) | 0));
  let s = baseTier(step >= GOV_STEP.lowTier ? 'low' : tier, phone);
  if (step >= GOV_STEP.lowTier && s.outlineScope === 'none') s = { ...s, outlineScope: 'own', outlines: true };
  s.step = step;
  if (step >= GOV_STEP.noShadows) {
    s.shadows = false;
    s.forestHalf = true;
  }
  if (step >= GOV_STEP.lightOverlay) {
    s.overheadDpr = Math.min(s.overheadDpr, 1.25);
    s.minimapHz = Math.min(s.minimapHz, 10);
    s.vfxTier = 'low';
  }
  if (step >= GOV_STEP.fps30) s.fpsCap = 30;
  if (step >= GOV_STEP.res70) s.resScale = 0.7;
  else if (step >= GOV_STEP.res85) s.resScale = 0.85;
  return s;
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

export interface RememberedTier {
  tier: QualityTier;
  /** 'user': chosen in Settings (never raised by the game); 'probe': the first match's measurement. */
  by: 'user' | 'probe';
}

export function rememberedTier(): RememberedTier | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<RememberedTier> | null;
    if (v && (v.tier === 'low' || v.tier === 'med' || v.tier === 'high') && (v.by === 'user' || v.by === 'probe')) return { tier: v.tier, by: v.by };
  } catch {
    /* blocked or the old plain value */
  }
  return null;
}

export function rememberTier(t: QualityTier, by: RememberedTier['by']): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tier: t, by }));
  } catch {
    /* storage blocked */
  }
}

/**
 * Starting tier: URL override, else this device's remembered tier, else Low on a budget device (render/perf/device.ts
 * isLowEndDevice: the probe never raises a tier, so none runs; the player can still pick Medium in Settings), else med
 * with a probe (run in the first match).
 */
export function startTier(search?: string, device: LowEndInput = lowEndInput()): { tier: QualityTier; probe: FpsProbe | null } {
  const forced = qualityOverride(search);
  if (forced) return { tier: forced, probe: null };
  const r = rememberedTier();
  if (r) return { tier: r.tier, probe: null };
  if (isLowEndDevice(device)) return { tier: 'low', probe: null };
  return { tier: 'med', probe: new FpsProbe(4, 8) };
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
