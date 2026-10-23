/**
 * Match camera zoom (render only): a target the wheel (and later pinch) moves in smooth, delta-sized steps, eased by
 * the match view, clamped to 0.72x..1.35x of the default distance and remembered per viewer (browser storage, a
 * convenience only: it may be missing or throw, and the default is used then).
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
/** Desktop default: a little closer than the old 1.0 so a hero reads at ~70 px tall on 1280x720. */
export const ZOOM_DEFAULT = 0.88;
const KEY = 'pawlegends.zoom';

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

export function saveZoom(z: number): void {
  try {
    localStorage.setItem(KEY, clampZoom(z, ZOOM_MAX_WIDE).toFixed(3));
  } catch {
    /* storage blocked: the zoom just is not remembered */
  }
}
