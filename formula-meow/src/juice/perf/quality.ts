// DprGovernor and the tier defaults are copied from bad-cat/src/render/quality.ts at 735cbeec (copy, never import).
/**
 * Mobile performance budget (GDD 12): the quality auto-scaler.
 *  - DPR governor: frames averaged over 1 s windows; 2 windows under 45 fps step down 0.25 (floor 0.75), 10 windows
 *    above 58 fps step back up (cap 2, 1.5 on touch devices, and the device DPR).
 *  - Tier governor: when the DPR is already at the floor and it is still slow for 3 more windows, the tier drops
 *    (high → mid → low). Tiers scale the juice: particle density, skids, AI outlines, ambient particles.
 *  - Outline LOD: AI karts beyond 40 m lose their inverted-hull outlines (GDD 12: "no outline" past 40 m); on low
 *    every AI outline is off. That is the biggest draw-call saver (one outline draw per fur / body mesh).
 *  - Post-processing (feel lane, juice/perf/post.ts): bloom and the boost grade run on the high tier only.
 * `?quality=low|mid|high` forces a tier; `?perf=1` shows fps / DPR / tier / draw calls / triangles.
 */
import type { WebGLRenderer } from 'three';

export type Tier = 'low' | 'mid' | 'high';

export interface DeviceInfo {
  isIOS: boolean;
  isAndroid: boolean;
  dpr: number;
  touch: boolean;
}

export function detectDevice(): DeviceInfo {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const touch = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0);
    return { isIOS, isAndroid, dpr, touch };
  } catch {
    return { isIOS: false, isAndroid: false, dpr: 1, touch: false };
  }
}

export const DPR_CAP = 2;
/** touch devices (phones, tablets): the governor never climbs past this (iteration 3 perf pass: DPR 2 with 171k
 * triangles on Laundry is the fill-rate risk on a mid-range phone GPU; the draw calls were fine) */
export const DPR_CAP_TOUCH = 1.5;
export const DPR_MIN = 0.75;
export const DPR_STEP = 0.25;

/** Default tier: high on desktop, mid on phones (the governors move it from there). */
export function defaultTier(d: DeviceInfo, search = ''): Tier {
  const q = new URLSearchParams(search).get('quality');
  if (q === 'low' || q === 'mid' || q === 'high') return q;
  if (d.isIOS || d.isAndroid || d.touch) return 'mid';
  return 'high';
}

export interface TierLook {
  /** bloom + boost grade (lazy post chunk) */
  post: boolean;
  /** particle / skid / star density 0..1 */
  density: number;
  skids: boolean;
  /** AI outline cut-off distance (m); 0 = no AI outlines */
  outlineDist: number;
  /** ambient particles scale */
  ambient: number;
  /** confetti scale */
  confetti: number;
  /** speed-line streaks */
  streaks: number;
}

export const TIERS: Record<Tier, TierLook> = {
  high: { post: true, density: 1, skids: true, outlineDist: 60, ambient: 1, confetti: 1, streaks: 1 },
  mid: { post: false, density: 0.7, skids: true, outlineDist: 40, ambient: 0.6, confetti: 0.75, streaks: 1 },
  low: { post: false, density: 0.4, skids: false, outlineDist: 0, ambient: 0.3, confetti: 0.5, streaks: 0 },
};

export function lowerTier(t: Tier): Tier {
  return t === 'high' ? 'mid' : 'low';
}

export class DprGovernor {
  dpr: number;
  private readonly max: number;
  private frozen = false;
  private winT = 0;
  private winN = 0;
  private fastS = 0;
  private slowS = 0;
  /** slow windows counted while already at the DPR floor (feeds the tier drop) */
  floorSlow = 0;
  /** last window's fps */
  fps = 60;

  constructor(start: number, deviceDpr: number, cap = DPR_CAP) {
    this.max = Math.max(DPR_MIN, Math.min(cap, deviceDpr));
    this.dpr = Math.max(DPR_MIN, Math.min(this.max, start));
  }

  freeze(): void {
    this.frozen = true;
  }

  unfreeze(): void {
    this.frozen = false;
    this.resetWindow();
  }

  resetWindow(): void {
    this.winT = 0;
    this.winN = 0;
    this.fastS = 0;
    this.slowS = 0;
    this.floorSlow = 0;
  }

  /** Feed one real frame dt (s); true when the DPR changed. */
  sample(dt: number): boolean {
    if (this.frozen || !(dt > 0) || dt > 0.5) return false;
    this.winT += dt;
    this.winN++;
    if (this.winT < 1) return false;
    const fps = this.winN / this.winT;
    this.fps = fps;
    this.winT = 0;
    this.winN = 0;
    this.slowS = fps < 45 ? this.slowS + 1 : 0;
    this.fastS = fps > 58 ? this.fastS + 1 : 0;
    if (fps < 45 && this.dpr <= DPR_MIN) this.floorSlow++;
    else if (fps >= 45) this.floorSlow = 0;
    if (this.slowS >= 2 && this.dpr > DPR_MIN) {
      this.dpr = Math.max(DPR_MIN, this.dpr - DPR_STEP);
      this.slowS = 0;
      this.fastS = 0;
      return true;
    }
    if (this.fastS >= 10 && this.dpr < this.max) {
      this.dpr = Math.min(this.max, this.dpr + DPR_STEP);
      this.fastS = 0;
      return true;
    }
    return false;
  }
}

export interface PerfStats {
  fps: number;
  dpr: number;
  tier: Tier;
  calls: number;
  tris: number;
}

export class Quality {
  /** the live auto-scaler (the feel lane's post-processing follows its tier) */
  static current: Quality | null = null;
  tier: Tier;
  readonly gov: DprGovernor;
  readonly stats: PerfStats;
  private readonly hud: HTMLDivElement | null = null;
  private hudT = 0;
  onTier: ((t: Tier) => void) | null = null;
  onDpr: ((dpr: number) => void) | null = null;

  constructor(
    private readonly renderer: WebGLRenderer,
    startDpr: number,
    host: HTMLElement | null,
  ) {
    const dev = detectDevice();
    const search = typeof location !== 'undefined' ? location.search : '';
    this.tier = defaultTier(dev, search);
    this.gov = new DprGovernor(startDpr, Math.max(1, dev.dpr), dev.touch ? DPR_CAP_TOUCH : DPR_CAP);
    this.stats = { fps: 60, dpr: this.gov.dpr, tier: this.tier, calls: 0, tris: 0 };
    Quality.current = this;
    if (host && new URLSearchParams(search).has('perf')) {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:50;font:11px/1.3 ui-monospace,monospace;color:#2cf6f3;background:rgba(0,0,0,.55);padding:3px 6px;border-radius:6px;pointer-events:none;white-space:pre';
      host.appendChild(d);
      this.hud = d;
    }
  }

  get look(): TierLook {
    return TIERS[this.tier];
  }

  /** Replaces the core Stage.govern: one call per frame with the real frame time. */
  sample(dt: number): void {
    const info = this.renderer.info.render;
    this.stats.calls = info.calls;
    this.stats.tris = info.triangles;
    if (this.gov.sample(dt)) this.onDpr?.(this.gov.dpr);
    if (this.gov.floorSlow >= 3 && this.tier !== 'low') {
      this.tier = lowerTier(this.tier);
      this.gov.resetWindow();
      this.onTier?.(this.tier);
    }
    this.stats.fps = this.gov.fps;
    this.stats.dpr = this.gov.dpr;
    this.stats.tier = this.tier;
    if (this.hud) {
      this.hudT += dt;
      if (this.hudT > 0.5) {
        this.hudT = 0;
        const s = this.stats;
        this.hud.textContent = `${s.fps.toFixed(0)} fps  dpr ${s.dpr.toFixed(2)}  ${s.tier}\n${s.calls} calls  ${(s.tris / 1000).toFixed(0)}k tris`;
      }
    }
  }
}
