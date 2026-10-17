/**
 * Quality tiers and the DPR governor (GDD 11.2): start at 1.25 on Android and 1.5 on iOS, step down
 * 0.25 after 2 s under 45 fps, step up 0.25 after 10 s above 58 fps, cap 2.0 (and the device DPR).
 * Frozen during the clip pass so it never fights the 720 × 1280 resize. Tier: shadows (high only:
 * one 1024 shadow map; low/mid use blob shadows) and MSAA. Pure, unit-tested.
 */
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
export const DPR_MIN = 0.75;
export const DPR_STEP = 0.25;

export function startDpr(d: DeviceInfo): number {
  const want = d.isIOS ? 1.5 : d.isAndroid ? 1.25 : 1.5;
  return Math.max(Math.min(1, d.dpr), Math.min(want, d.dpr, DPR_CAP));
}

/** Default tier: high on desktop, mid on iOS, low on Android (the governor still moves DPR). */
export function defaultTier(d: DeviceInfo, forced?: Tier): Tier {
  if (forced) return forced;
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('quality') : null;
    if (q === 'low' || q === 'mid' || q === 'high') return q;
  } catch {
    /* no location */
  }
  if (d.isAndroid) return 'low';
  if (d.isIOS || d.touch) return 'mid';
  return 'high';
}

export class DprGovernor {
  dpr: number;
  private readonly max: number;
  private frozen = false;
  private winT = 0;
  private winN = 0;
  private fastS = 0;
  private slowS = 0;

  constructor(start: number, deviceDpr: number, cap = DPR_CAP) {
    this.max = Math.max(DPR_MIN, Math.min(cap, deviceDpr));
    this.dpr = Math.max(DPR_MIN, Math.min(this.max, start));
  }

  get isFrozen(): boolean {
    return this.frozen;
  }

  freeze(): void {
    this.frozen = true;
  }

  unfreeze(): void {
    this.frozen = false;
    this.resetWindow();
  }

  /** Forget the current windows (after a load hitch, a resize or a context restore). */
  resetWindow(): void {
    this.winT = 0;
    this.winN = 0;
    this.fastS = 0;
    this.slowS = 0;
  }

  /**
   * Feed one frame's real delta in seconds; returns true when the DPR changed. Frames are averaged
   * over 1 s windows: 2 windows in a row under 45 fps step down, 10 in a row above 58 fps step up.
   */
  sample(dt: number): boolean {
    if (this.frozen || !(dt > 0) || dt > 0.5) return false;
    this.winT += dt;
    this.winN++;
    if (this.winT < 1) return false;
    const fps = this.winN / this.winT;
    this.winT = 0;
    this.winN = 0;
    this.slowS = fps < 45 ? this.slowS + 1 : 0;
    this.fastS = fps > 58 ? this.fastS + 1 : 0;
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
