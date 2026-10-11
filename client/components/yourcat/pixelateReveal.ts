/**
 * The S3 reveal's pixelate steps (docs/plans/yourcat-v2.md §1 S3): the visitor's photo is drawn on a
 * canvas in ever smaller blocks (32 → 16 → 8 px, about 200 ms each, nearest-neighbour), then the page
 * cross-fades to the result. A late pixel portrait gets the same treatment from 16 px over 300 ms.
 */

export const REVEAL_BLOCKS = [32, 16, 8] as const;
export const REVEAL_STEP_MS = 200;
export const LATE_BLOCKS = [16, 8, 4] as const;
export const LATE_STEP_MS = 100;
export const CROSSFADE_MS = 200;
export const REDUCED_FADE_MS = 120;

/**
 * Draws `image` into the canvas as `block`-pixel squares: down to a tiny canvas, then back up with
 * smoothing off. The image covers the canvas (centre crop, like `object-fit: cover`).
 */
export function drawPixelated(canvas: HTMLCanvasElement, image: CanvasImageSource & { width: number; height: number }, block: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(width / block));
  small.height = Math.max(1, Math.round(height / block));
  const sctx = small.getContext("2d");
  if (!sctx) return;
  const crop = coverCrop(image.width, image.height, width / height);
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, width, height);
}

/** The source rect that covers a box of the given aspect ratio (centre crop). */
export function coverCrop(sw: number, sh: number, aspect: number): { x: number; y: number; w: number; h: number } {
  if (sw <= 0 || sh <= 0) return { x: 0, y: 0, w: Math.max(1, sw), h: Math.max(1, sh) };
  if (sw / sh > aspect) {
    const w = sh * aspect;
    return { x: (sw - w) / 2, y: 0, w, h: sh };
  }
  const h = sw / aspect;
  return { x: 0, y: (sh - h) / 2, w: sw, h };
}

/** An image that has not loaded by then is skipped: the reveal never waits on a slow network. */
export const REVEAL_IMAGE_TIMEOUT_MS = 2000;

/** Loads an image (same-origin object URL or a CORS CDN URL); null when it fails or is too slow. */
export function loadRevealImage(url: string, timeoutMs: number = REVEAL_IMAGE_TIMEOUT_MS): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    if (/^https?:\/\//i.test(url)) img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Runs the steps on the canvas, one per `stepMs`. Resolves when the last step was drawn, or right
 * away when cancelled (`isCancelled` is checked before each step).
 */
export async function runPixelate(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource & { width: number; height: number },
  blocks: readonly number[],
  stepMs: number,
  isCancelled: () => boolean,
): Promise<void> {
  for (const block of blocks) {
    if (isCancelled()) return;
    drawPixelated(canvas, image, block);
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
}
