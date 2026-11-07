/**
 * Match camera zoom (render only): a factor on the camera distance (renderer.ts MOBA_DIST × zoom, × the short-landscape
 * factor on phones). The wheel and the +/− keys (desktop), a pinch (touch) and the Settings / pause-menu slider move
 * the target; the match view eases toward it. Clamped to ZOOM_MIN..zoomMax(width) and remembered per viewer (browser
 * storage, a convenience only: it may be missing or throw, and the default is used then).
 */
export const ZOOM_MIN = 0.72;
export const ZOOM_MAX = 1.35;
/**
 * Round 2 ("at 1280x720 only ~25 m of field shows, long-range kits fire blind"): on desktop windows at least
 * ZOOM_WIDE_FROM CSS px wide the wheel zooms out to ZOOM_MAX_WIDE (about 1.4x the old limit).
 */
export const ZOOM_MAX_WIDE = 1.9;
export const ZOOM_WIDE_FROM = 1100;
/** The zoom-out limit for a viewport `width` CSS px wide. */
export const zoomMax = (width: number): number => (width >= ZOOM_WIDE_FROM ? ZOOM_MAX_WIDE : ZOOM_MAX);
/**
 * Default zoom, desktop and phones alike (phones multiply the distance by renderer.ts SHORT_LANDSCAPE_ZOOM).
 * Polish 2026-11-06 (founder: "zoomed in a little too much"): 0.88 → 1.03, the camera ~17% further out. Ground
 * across the hero's row: 1440x900 31 m (was 27), 844x390 30 m (was 25), 667x375 25 m (was 21), with 16–17 m on the
 * open (right) side on phones, so the longest aimed skill (12 m) and a tower's 7 m reach fit beside the hero.
 */
export const ZOOM_DEFAULT = 1.03;
/**
 * Storage key. v2 with the new default: a zoom saved under the old key was picked against the old, too-close default,
 * so everybody starts once from the new one.
 */
export const ZOOM_KEY = 'pawlegends.zoom.v2';
const KEY = ZOOM_KEY;

export const clampZoom = (z: number, max = ZOOM_MAX): number => (Number.isFinite(z) ? Math.min(max, Math.max(ZOOM_MIN, z)) : ZOOM_DEFAULT);

/**
 * The next zoom after a wheel event. One notch (deltaY ~100 px, or 3 lines) is about 9%; a trackpad's many small
 * deltas add up to the same, and one big synthetic delta (deltaY 800) moves the whole way, not one fixed step.
 */
export function wheelZoom(zoom: number, deltaY: number, deltaMode = 0, max = ZOOM_MAX): number {
  const px = deltaMode === 1 ? deltaY * 33 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const d = Math.max(-1200, Math.min(1200, px));
  return clampZoom(zoom * Math.exp(d * 0.00088), max);
}

export function loadZoom(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 ? clampZoom(v, ZOOM_MAX_WIDE) : ZOOM_DEFAULT;
  } catch {
    return ZOOM_DEFAULT;
  }
}

/** Window event sent by saveZoom (detail: the zoom), so an open slider (ui/zoomSlider.ts) follows the wheel, +/− or a pinch. */
export const ZOOM_EVENT = 'pl:zoom';

export function saveZoom(z: number): void {
  try {
    localStorage.setItem(KEY, clampZoom(z, ZOOM_MAX_WIDE).toFixed(3));
  } catch {
    /* storage blocked: the zoom just is not remembered */
  }
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent(ZOOM_EVENT, { detail: z }));
}

/** One +/− key press: the same ~9% as one wheel notch (`dir` +1 = out, −1 = in). */
export function stepZoom(zoom: number, dir: 1 | -1, max = ZOOM_MAX): number {
  return wheelZoom(zoom, dir * 100, 0, max);
}

/** A pinch: fingers `d0` px apart at `z0` now `d` px apart. Spreading the fingers zooms in (a smaller distance). */
export function pinchZoom(z0: number, d0: number, d: number, max = ZOOM_MAX): number {
  if (!(d0 > 0) || !(d > 0)) return clampZoom(z0, max);
  return clampZoom(z0 * (d0 / d), max);
}

/** The slider's label: the view size against the default (100% = default, bigger = more of the map). */
export const zoomPercent = (z: number): number => Math.round((z / ZOOM_DEFAULT) * 100);
