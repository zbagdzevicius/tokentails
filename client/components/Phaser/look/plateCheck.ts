/**
 * Rejects manifest plates whose alpha has a rectangular crop (task 6e review, finding 1).
 *
 * A plate is drawn full width, scaled by a whole factor and anchored to the top or bottom of the
 * view, so any straight horizontal alpha edge inside the plate lands mid-screen as a hard-edged
 * block. The art fix (feathered or silhouette edges) belongs to the art pass (task 6d); until it
 * lands, the backdrop draws the procedural plate for such a layer instead.
 *
 * The check: per column, the lowest opaque row. A run of at least `minRun` neighbouring columns
 * that all end on the same row above the plate's last two rows is a straight crop. A silhouette
 * that reaches the plate's bottom edge, or one with a ragged lower edge, passes.
 *
 * Pure module: no Phaser import (Jest, SSR).
 */

/** Alpha above this counts as opaque. */
export const ALPHA_OPAQUE = 8;

/** The longest run of columns that end on the same row inside the plate (0 when none). */
export function straightCropRun(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  stride = 1,
  offset = 0,
): number {
  let best = 0;
  let run = 0;
  let previous = -2;
  for (let x = 0; x < width; x += 1) {
    let lowest = -1;
    for (let y = height - 1; y >= 0; y -= 1) {
      if (alpha[(y * width + x) * stride + offset] > ALPHA_OPAQUE) {
        lowest = y;
        break;
      }
    }
    const inside = lowest >= 0 && lowest < height - 2;
    if (inside && lowest === previous) run += 1;
    else run = inside ? 1 : 0;
    previous = inside ? lowest : -2;
    if (run > best) best = run;
  }
  return best;
}

/** The run length that counts as a crop: 16 art px, or 2% of a wide plate. */
export const minCropRun = (width: number) => Math.max(16, Math.round(width * 0.02));

/** True when RGBA pixel data has a straight crop edge inside the plate. */
export function hasStraightCrop(rgba: ArrayLike<number>, width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  return straightCropRun(rgba, width, height, 4, 3) >= minCropRun(width);
}

type ImageLike = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

const verdicts = new WeakMap<object, boolean>();

/**
 * Reads a loaded image's pixels once (cached per image) and checks it. Unreadable pixels (no
 * canvas, a cross-origin image) count as clean: the plate is drawn as before.
 */
export function imageHasStraightCrop(image: ImageLike | null | undefined): boolean {
  if (!image || typeof document === "undefined") return false;
  const cached = verdicts.get(image as object);
  if (cached !== undefined) return cached;
  let verdict = false;
  try {
    const width = Math.floor(image.width || 0);
    const height = Math.floor(image.height || 0);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx && width > 0 && height > 0) {
      ctx.drawImage(image, 0, 0);
      verdict = hasStraightCrop(ctx.getImageData(0, 0, width, height).data, width, height);
    }
  } catch {
    verdict = false;
  }
  verdicts.set(image as object, verdict);
  return verdict;
}
