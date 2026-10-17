/**
 * L-UI: quality tier pick at boot and the frame-time governor (pure parts tested).
 * SPEC.md "Performance": DPR capped per tier; the governor steps the tier down after 3 s over
 * budget and never back up in the same session.
 */
import type { Quality } from '../types';

export interface DeviceHints {
  coarsePointer: boolean;
  /** navigator.deviceMemory (GB), when the browser exposes it. */
  memoryGb: number | null;
  cores: number | null;
  /** UNMASKED_RENDERER_WEBGL, lower-cased, or ''. */
  gpu: string;
  screenPx: number;
  webgl2: boolean;
}

const WEAK_GPU = /(mali-g[1-5]\d\b|mali-t\d|mali-4|adreno \(tm\) [1-5]\d\d|adreno [1-5]\d\d|powervr|sgx|intel\(r\) hd graphics [2-5]|intel hd graphics [2-5]|swiftshader|llvmpipe|software)/;
const STRONG_GPU = /(apple m\d|rtx|radeon rx|radeon pro|geforce gtx 1[06-9]|geforce gtx 20|arc a\d)/;

export function pickQuality(h: DeviceHints): Quality {
  if (!h.webgl2 || WEAK_GPU.test(h.gpu)) return 'low';
  if (h.coarsePointer) {
    // Phones and tablets: mid on strong hardware (A14+/recent Adreno), else low. deviceMemory
    // only reports powers of two, so a 6 GB phone reports 4.
    const strong = (h.cores ?? 0) >= 6 && (h.memoryGb === null || h.memoryGb >= 4) && /(apple gpu|adreno \(tm\) [6-9]\d\d|adreno [6-9]\d\d|immortalis|mali-g7[1-9]|mali-g[6-9]\d\d)/.test(h.gpu);
    return strong ? 'mid' : 'low';
  }
  if (STRONG_GPU.test(h.gpu) && (h.memoryGb === null || h.memoryGb >= 8)) return 'high';
  if ((h.memoryGb !== null && h.memoryGb <= 4) || (h.cores !== null && h.cores <= 4)) return 'low';
  return 'mid';
}

export const stepDown = (q: Quality): Quality | null => (q === 'high' ? 'mid' : q === 'mid' ? 'low' : null);

/**
 * Frame-time governor: an exponential average of frame time against the tier budget. Over budget
 * for `windowS` seconds in a row → step down (once per warm-up). Long frames (hidden tab, GC
 * hitches > 250 ms) are ignored.
 */
export class FrameGovernor {
  private avgMs = 0;
  private overFor = 0;
  private warm = 0;

  constructor(
    private targetFps: number,
    private readonly windowS = 3,
    private readonly warmupS = 2.5,
  ) {}

  get averageMs() {
    return this.avgMs;
  }

  /** New tier target; restarts the warm-up. */
  reset(targetFps: number) {
    this.targetFps = targetFps;
    this.avgMs = 0;
    this.overFor = 0;
    this.warm = 0;
  }

  /** Returns true when the tier should step down now. */
  sample(dtS: number): boolean {
    if (!(dtS > 0) || dtS > 0.25) return false;
    const ms = dtS * 1000;
    this.avgMs = this.avgMs ? this.avgMs * 0.92 + ms * 0.08 : ms;
    this.warm += dtS;
    if (this.warm < this.warmupS) return false;
    const budget = (1000 / this.targetFps) * 1.2;
    if (this.avgMs > budget) this.overFor += dtS;
    else this.overFor = Math.max(0, this.overFor - dtS * 2);
    if (this.overFor >= this.windowS) {
      this.overFor = 0;
      this.warm = 0;
      return true;
    }
    return false;
  }
}

/** Reads the device hints in the browser (the only DOM part). */
export function readDeviceHints(): DeviceHints {
  let gpu = '';
  let webgl2 = false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webgl2 = !!gl;
    const ctx = gl ?? c.getContext('webgl');
    if (ctx) {
      const ext = ctx.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER)).toLowerCase();
      ctx.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* no WebGL: the world will fail and main shows the fallback */
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: !!window.matchMedia?.('(pointer: coarse)').matches,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    gpu,
    screenPx: Math.round(screen.width * screen.height * (window.devicePixelRatio || 1) ** 2),
    webgl2,
  };
}
