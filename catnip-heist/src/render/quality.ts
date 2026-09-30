/**
 * Automatic quality tier.
 *
 *   high: HDR render target with MSAA, selective bloom, colour grade + vignette, soft shadows.
 *   low:  direct render (context MSAA only), no bloom / post, no real-time shadows (blob shadows
 *         stay), lower pixel ratio, CSS vignette.
 *
 * `?quality=low|high` forces a tier. Otherwise the renderer starts on high and an FpsProbe measures
 * ~2 s of frames (after a short warm-up); if the average is under LOW_FPS it drops to low. After
 * that a QualityGovernor keeps watching (heist renderer): a sustained drop on high (thermal
 * throttling, a busy tab) steps down, and sustained headroom on low steps up once per session and
 * is re-probed, falling back for good if high does not hold. Render side only: never feeds back
 * into the sim.
 */
export type QualityTier = 'high' | 'low';

/** Average fps under which the auto probe drops to the low tier. */
export const LOW_FPS = 42;

/** Forced tier from the URL (`?quality=low|high`), or null for auto. */
export function qualityOverride(search: string = typeof location !== 'undefined' ? location.search : ''): QualityTier | null {
  try {
    const q = new URLSearchParams(search).get('quality');
    return q === 'low' || q === 'high' ? q : null;
  } catch {
    return null;
  }
}

const KEY = 'catnip-heist.quality';
let remembered: QualityTier | null = null;

/** Tier an earlier probe settled on this session (so later scenes skip re-probing), or null. */
export function rememberedTier(): QualityTier | null {
  if (remembered) return remembered;
  try {
    const v = sessionStorage.getItem(KEY);
    if (v === 'low' || v === 'high') remembered = v;
  } catch {
    /* storage blocked */
  }
  return remembered;
}

export function rememberTier(t: QualityTier): void {
  remembered = t;
  try {
    sessionStorage.setItem(KEY, t);
  } catch {
    /* storage blocked */
  }
}

/** Starting tier for a new scene: URL override, else the remembered probe result, else high. */
export function startTier(): { tier: QualityTier; probe: FpsProbe | null } {
  const forced = qualityOverride();
  if (forced) return { tier: forced, probe: null };
  const r = rememberedTier();
  if (r) return { tier: r, probe: null };
  return { tier: 'high', probe: new FpsProbe() };
}

/**
 * Measures frame times for `seconds` after `warmup` seconds and settles on a tier.
 * Frames longer than 1 s (tab switches, shader-compile hitches) are ignored; slow frames below that
 * count, so a very slow device still settles on low.
 */
export class FpsProbe {
  private t = 0;
  private frames = 0;
  private measured = 0;
  private result: QualityTier | null = null;
  private slowRun = 0;

  constructor(
    private readonly seconds = 2,
    private readonly warmup = 0.6,
    private readonly lowFps = LOW_FPS,
  ) {}

  get done(): boolean {
    return this.result !== null;
  }

  get tier(): QualityTier | null {
    return this.result;
  }

  /** Average fps over the measured window so far (0 before any sample). */
  get fps(): number {
    return this.measured > 0 ? this.frames / this.measured : 0;
  }

  reset(): void {
    this.t = 0;
    this.frames = 0;
    this.measured = 0;
    this.result = null;
    this.slowRun = 0;
  }

  /** Feed one frame's dt (seconds). Returns the tier once decided, else null. */
  sample(dt: number): QualityTier | null {
    if (this.result) return this.result;
    if (!(dt > 0) || dt > 1) return null;
    this.t += dt;
    if (this.t < this.warmup) return null;
    // Obviously too slow (several frames in a row under 15 fps): decide now, don't wait 2 s.
    this.slowRun = dt > 1 / 15 ? this.slowRun + 1 : 0;
    if (this.slowRun >= 4) {
      this.frames++;
      this.measured += dt;
      this.result = 'low';
      rememberTier('low');
      return this.result;
    }
    this.frames++;
    this.measured += dt;
    if (this.measured >= this.seconds) {
      this.result = this.fps < this.lowFps ? 'low' : 'high';
      rememberTier(this.result);
    }
    return this.result;
  }
}

/** Window (s) the governor averages over. */
const GOV_WINDOW = 2;
/** High -> low: this many consecutive windows under LOW_FPS * GOV_DOWN. */
const GOV_DOWN = 0.85;
const GOV_DOWN_RUNS = 2;
/** Low -> high: this many consecutive windows at or over UP_FPS (vsync-bound with headroom). */
export const UP_FPS = 57;
const GOV_UP_RUNS = 4;
const UP_KEY = 'catnip-heist.quality-up';
let stepUpTried = false;

function upTried(): boolean {
  if (stepUpTried) return true;
  try {
    stepUpTried = sessionStorage.getItem(UP_KEY) === '1';
  } catch {
    /* storage blocked */
  }
  return stepUpTried;
}

function markUpTried(): void {
  stepUpTried = true;
  try {
    sessionStorage.setItem(UP_KEY, '1');
  } catch {
    /* storage blocked */
  }
}

/** Test hook: forget the session's step-up attempt and remembered tier. */
export function resetQualityMemory(): void {
  stepUpTried = false;
  remembered = null;
  try {
    sessionStorage.removeItem(UP_KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * Auto tier with hysteresis: the start probe decides first (`done`), then fixed windows of frames
 * are watched. Steps down after GOV_DOWN_RUNS slow windows on high; steps up after GOV_UP_RUNS fast
 * windows on low, at most once per session, and re-probes high (dropping back if it fails).
 * `sample` returns the tier the renderer should use (null while the start probe is undecided).
 */
export class QualityGovernor {
  private tier: QualityTier;
  private retry: FpsProbe | null = null;
  private t = 0;
  private frames = 0;
  private lastFps = 0;
  private slowRuns = 0;
  private fastRuns = 0;

  constructor(
    start: QualityTier,
    private readonly probe: FpsProbe | null,
    private readonly lowFps = LOW_FPS,
    private readonly allowUp = true,
  ) {
    this.tier = start;
  }

  /** True once the start probe has decided (or there was none). */
  get done(): boolean {
    return !this.probe || this.probe.done;
  }

  /** Current tier as the governor sees it. */
  get current(): QualityTier {
    return this.tier;
  }

  /** Average fps of the last decision window (or of the probe while it runs). */
  get fps(): number {
    if (this.probe && !this.probe.done) return this.probe.fps;
    if (this.retry) return this.retry.fps;
    return this.lastFps;
  }

  /** A load hitch is not a frame: restart the window (and an undecided probe's warm-up). */
  reset(): void {
    if (this.probe && !this.probe.done) this.probe.reset();
    this.retry?.reset();
    this.t = 0;
    this.frames = 0;
    this.slowRuns = 0;
    this.fastRuns = 0;
  }

  sample(dt: number): QualityTier | null {
    if (this.probe && !this.probe.done) {
      const r = this.probe.sample(dt);
      if (r) this.tier = r;
      return r;
    }
    if (this.retry) {
      const r = this.retry.sample(dt);
      if (!r) return this.tier;
      this.retry = null;
      this.tier = r;
      this.lastFps = 0;
      return r;
    }
    if (!(dt > 0) || dt > 1) return this.tier;
    this.t += dt;
    this.frames++;
    if (this.t < GOV_WINDOW) return this.tier;
    const fps = this.frames / this.t;
    this.lastFps = fps;
    this.t = 0;
    this.frames = 0;
    if (this.tier === 'high') {
      this.slowRuns = fps < this.lowFps * GOV_DOWN ? this.slowRuns + 1 : 0;
      if (this.slowRuns >= GOV_DOWN_RUNS) {
        this.slowRuns = 0;
        this.tier = 'low';
        rememberTier('low');
      }
    } else {
      this.fastRuns = fps >= UP_FPS ? this.fastRuns + 1 : 0;
      if (this.allowUp && this.fastRuns >= GOV_UP_RUNS && !upTried()) {
        markUpTried();
        this.fastRuns = 0;
        this.tier = 'high';
        this.retry = new FpsProbe(2, 0.6, this.lowFps);
      }
    }
    return this.tier;
  }
}

/**
 * Device pixel ratio for a canvas of `w` x `h` CSS pixels: the device ratio up to `max`, lowered so
 * the drawing buffer stays within `maxPixels` (big hi-DPI screens), never below 1 (or the device
 * ratio when that is lower). Quantised to 0.05 so small resizes do not reallocate targets.
 */
export function cappedPixelRatio(dpr: number, max: number, w: number, h: number, maxPixels: number): number {
  const want = Math.min(dpr, max);
  const area = Math.max(1, w) * Math.max(1, h);
  if (area * want * want <= maxPixels) return want;
  const fit = Math.floor(Math.sqrt(maxPixels / area) * 20) / 20;
  return Math.max(Math.min(1, want), fit);
}
