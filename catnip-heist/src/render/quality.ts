/**
 * Automatic quality tier.
 *
 *   high: HDR render target with MSAA, selective bloom, colour grade + vignette, soft shadows.
 *   low:  direct render (context MSAA only), no bloom / post, no real-time shadows (blob shadows
 *         stay), lower pixel ratio, CSS vignette.
 *
 * `?quality=low|high` forces a tier. Otherwise the renderer starts on high and an FpsProbe measures
 * ~2 s of frames (after a short warm-up); if the average is under LOW_FPS it drops to low once.
 * Render side only: never feeds back into the sim.
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
