/**
 * Integer camera zoom (plan F10, G7 "Camera").
 *
 * Pixel art stays crisp only when one art pixel covers a whole number of device pixels. With the
 * F10 backing store (CSS size x capped ratio, see makeGameConfig) the camera zoom is measured in
 * backing-store pixels, so an integer camera zoom `k` is exactly that.
 *
 * `pickZoom` returns the largest integer `k` that still shows at least the target number of tiles:
 *
 *   hub         12 x 8 tiles  (Home, Shelter)
 *   platformer  14 x 9 tiles  (Purrsuit, Cupid Cat)
 *
 * The target is for landscape. In portrait the two numbers swap, so a phone held upright shows
 * 8 (or 9) tiles across instead of a thumbnail of a landscape view. The plan leaves the portrait
 * policy for platformers to a founder decision; this default is recorded in the 2e log.
 *
 * Pure and deterministic; scenes adopt it in task 6e (ZOOM and ZOOM_PIXEL stay until then).
 */

export type ZoomPreset = "hub" | "platformer";

export const ZOOM_TARGETS: Record<ZoomPreset, { cols: number; rows: number }> = {
  hub: { cols: 12, rows: 8 },
  platformer: { cols: 14, rows: 9 },
};

/** Art tile size in art pixels. */
export const TILE_SIZE = 32;

export interface PickZoomInput {
  /** Viewport size in CSS pixels. */
  width: number;
  height: number;
  /** Backing-store pixels per CSS pixel (the capped ratio). */
  dpr: number;
  preset: ZoomPreset;
  tileSize?: number;
  /** Upper bound for `k`, default 8. */
  maxZoom?: number;
}

export interface PickZoomResult {
  /** Camera zoom in backing-store pixels per art pixel; an integer of at least 1. */
  zoom: number;
  /** Art pixels per CSS pixel (`zoom / dpr`), for comparing with the old fractional ZOOM. */
  cssZoom: number;
  /** Whole tiles visible at that zoom. */
  visibleCols: number;
  visibleRows: number;
  orientation: "landscape" | "portrait";
}

const positive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

export function pickZoom(input: PickZoomInput): PickZoomResult {
  const width = positive(input.width, 1);
  const height = positive(input.height, 1);
  const dpr = positive(input.dpr, 1);
  const tile = positive(input.tileSize ?? TILE_SIZE, TILE_SIZE);
  const maxZoom = Math.max(1, Math.floor(positive(input.maxZoom ?? 8, 8)));
  const target = ZOOM_TARGETS[input.preset];
  const orientation = height > width ? "portrait" : "landscape";
  const cols = orientation === "portrait" ? target.rows : target.cols;
  const rows = orientation === "portrait" ? target.cols : target.rows;

  const backingW = width * dpr;
  const backingH = height * dpr;
  // Small epsilon so an exact fit (e.g. 896 / (14 * 32) = 2) is not floored to 1 by float error.
  const fit = Math.min(backingW / (cols * tile), backingH / (rows * tile)) + 1e-9;
  const zoom = Math.min(maxZoom, Math.max(1, Math.floor(fit)));

  return {
    zoom,
    cssZoom: zoom / dpr,
    visibleCols: Math.floor(backingW / (zoom * tile)),
    visibleRows: Math.floor(backingH / (zoom * tile)),
    orientation,
  };
}
