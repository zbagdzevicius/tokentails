/**
 * The S3 transformation clock's drawing (docs/plans/yourcat-polish.md §4.2): the photo cracks into
 * ever BIGGER gold-tinted blocks (4 → 8 → 16 → 32 → 48 px, 120 ms each; M1 ran backwards), then the
 * target gathers out of them (a cross-dissolve at 48, then 24, 12 and crisp, 75 ms each).
 *
 * Block sizes are canvas px at a 384 px canvas and scale with the real canvas (768 px: twice as big),
 * so the look is the same at every device pixel ratio. Pure drawing and a pure cue list: the timing
 * itself is `startCueClock` (motion.ts), so the cue list is testable with a fake clock.
 */

/** The crack, in order: the painting breaks into bigger and bigger blocks. */
export const REVEAL_BLOCKS = [4, 8, 16, 32, 48] as const;
/** The gather, in order: 48 (the cross-dissolve), 24, 12, then 0 = crisp. */
export const GATHER_BLOCKS = [48, 24, 12, 0] as const;
/** A pixel portrait that lands after the clock gathers at 70 ms steps. */
export const LATE_GATHER_STEP_MS = 70;
/** Block sizes are given at this canvas width. */
export const BLOCK_BASE_PX = 384;
/** The largest canvas side (inner box x devicePixelRatio is capped here). */
export const MAX_CANVAS_PX = 768;
/** The gold `color` composite drawn over every crack step. */
export const TINT_ALPHA = 0.25;
/** The cross-dissolve's target alpha at block 48. */
export const DISSOLVE_ALPHA = 0.5;
/** The pending target and the S2 overlay quantise the photo to this many cells across. */
export const PENDING_CELLS = 32;
export const BEAT_C_CELLS = 16;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RevealSource = CanvasImageSource & { width: number; height: number };

export interface DrawOptions {
  /** A colour drawn over the result with `globalCompositeOperation = "color"` at `TINT_ALPHA`. */
  tint?: string;
  /** Draw at this alpha over what is already on the canvas (no clear). Default 1 (clears first). */
  alpha?: number;
  /** The source rect; default: the centre crop that covers the canvas (`object-fit: cover`). */
  crop?: Rect;
  /** Block 0 only: true draws with smoothing (a photo), false nearest-neighbour (pixel art). */
  smooth?: boolean;
}

/** The canvas side for an inner box: `inner x dpr`, rounded, capped at 768. */
export function canvasSide(innerPx: number, dpr: number): number {
  return Math.max(1, Math.min(MAX_CANVAS_PX, Math.round(innerPx * (dpr > 0 ? dpr : 1))));
}

/** The block size (canvas px) for `cells` blocks across a 384 canvas. */
export function blockForCells(cells: number): number {
  return BLOCK_BASE_PX / cells;
}

let scratch: HTMLCanvasElement | null = null;
function scratchCanvas(w: number, h: number): HTMLCanvasElement {
  if (!scratch) scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;
  return scratch;
}

/**
 * Draws `image` into the canvas as `block`-pixel squares (block at a 384 canvas, scaled): down to a
 * tiny canvas with smoothing, then back up with smoothing off. Block 0 draws the image crisp.
 */
export function drawPixelated(canvas: HTMLCanvasElement, image: RevealSource, block: number, opts: DrawOptions = {}): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const crop = opts.crop ?? coverCrop(image.width, image.height, width / height);
  const alpha = opts.alpha ?? 1;
  ctx.save();
  if (alpha >= 1) ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = alpha;
  if (block <= 0) {
    ctx.imageSmoothingEnabled = !!opts.smooth;
    ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  } else {
    const px = Math.max(1, (block * width) / BLOCK_BASE_PX);
    const small = scratchCanvas(Math.max(1, Math.round(width / px)), Math.max(1, Math.round(height / px)));
    const sctx = small.getContext("2d");
    if (!sctx) {
      ctx.restore();
      return;
    }
    sctx.imageSmoothingEnabled = true;
    sctx.clearRect(0, 0, small.width, small.height);
    sctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, width, height);
  }
  ctx.restore();
  if (opts.tint) {
    ctx.save();
    ctx.globalCompositeOperation = "color";
    ctx.globalAlpha = TINT_ALPHA;
    ctx.fillStyle = opts.tint;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/** The source rect that covers a box of the given aspect ratio (centre crop). */
export function coverCrop(sw: number, sh: number, aspect: number): Rect {
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
 * Loads and decodes the pixel portrait before S2 hands over to the clock (R2-01), so the gather lands
 * on it with no blank frame. The same `crossOrigin` as `loadRevealImage`, so the clock's own load is a
 * cache hit. Null when it fails or when loading is slower than `timeoutMs`. A `decode()` that fails, or
 * is still running when `timeoutMs` has passed since the start, counts as loaded (the bytes are there,
 * the browser decodes on first paint): the wait is never longer than `timeoutMs`.
 */
export async function decodeRevealImage(url: string, timeoutMs: number = REVEAL_IMAGE_TIMEOUT_MS): Promise<HTMLImageElement | null> {
  const startedAt = Date.now();
  const image = await loadRevealImage(url, timeoutMs);
  if (!image) return null;
  if (typeof image.decode !== "function") return image;
  const left = Math.max(0, timeoutMs - (Date.now() - startedAt));
  let timer: ReturnType<typeof setTimeout> | null = null;
  await Promise.race([
    image.decode().catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, left);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return image;
}

/** The pending target (§4.2): the photo quantised to `PENDING_CELLS` cells across, gold-tinted. */
export function pendingTarget(image: RevealSource, tint: string): RevealTarget {
  return { image, minBlock: blockForCells(PENDING_CELLS), tint };
}

// ---- the cue list ----------------------------------------------------------------------------

/** The clock times this file needs (the `CLOCK` constants in motion.ts). */
export interface RevealTiming {
  HOLD: number;
  CRACK_START: number;
  CRACK_STEP: number;
  GATHER_START: number;
  GATHER_STEP: number;
  STEP_OUT: number;
  TITLE: number;
  DONE: number;
}

/** What the gather resolves into. */
export interface RevealTarget {
  image: RevealSource;
  /** The smallest block: 0 = crisp (the avatar), 12 = the photo quantised to 32 cells (pending). */
  minBlock: number;
  tint?: string;
  crop?: Rect;
}

export type RevealCue = "hold" | "stepOut" | "title" | "done";

export interface Cue {
  at: number;
  run(): void;
}

/** One draw of the clock, for tests and for the canvas. */
export type RevealDraw =
  | { kind: "photo" }
  | { kind: "crack"; block: number }
  | { kind: "dissolve"; block: number }
  | { kind: "gather"; block: number };

/** The draws of the clock, in time order. */
export function revealDraws(t: RevealTiming): Array<{ at: number; draw: RevealDraw }> {
  const out: Array<{ at: number; draw: RevealDraw }> = [{ at: t.HOLD, draw: { kind: "photo" } }];
  REVEAL_BLOCKS.forEach((block, i) => out.push({ at: t.CRACK_START + i * t.CRACK_STEP, draw: { kind: "crack", block } }));
  GATHER_BLOCKS.forEach((block, i) =>
    out.push({ at: t.GATHER_START + i * t.GATHER_STEP, draw: i === 0 ? { kind: "dissolve", block } : { kind: "gather", block } }),
  );
  return out;
}

/**
 * Executes one draw on the canvas. The crack is tinted gold; the dissolve lays the target at 48 and
 * alpha .5 over the photo at 48; the gather never goes finer than the target's `minBlock`.
 */
export function drawRevealStep(
  canvas: HTMLCanvasElement,
  draw: RevealDraw,
  photo: RevealSource,
  target: RevealTarget,
  gold: string,
): void {
  switch (draw.kind) {
    case "photo":
      drawPixelated(canvas, photo, 0, { smooth: true });
      return;
    case "crack":
      drawPixelated(canvas, photo, draw.block, { tint: gold });
      return;
    case "dissolve":
      drawPixelated(canvas, photo, draw.block, { tint: gold });
      drawPixelated(canvas, target.image, Math.max(draw.block, target.minBlock), {
        alpha: DISSOLVE_ALPHA,
        tint: target.tint,
        crop: target.crop,
      });
      return;
    case "gather":
      drawTarget(canvas, target, draw.block);
  }
}

/** The target at `block` (never finer than its `minBlock`). */
export function drawTarget(canvas: HTMLCanvasElement, target: RevealTarget, block: number): void {
  const b = block === 0 ? target.minBlock : Math.max(block, target.minBlock);
  drawPixelated(canvas, target.image, b, { tint: target.tint, crop: target.crop });
}

/**
 * The full 1,450 ms cue list: the draws plus the four page cues (`hold` 0, `stepOut` 1,050, `title`
 * 1,170, `done` 1,450). Cues at the same time keep this order (draw first, then the page cue).
 */
export function buildRevealCues(
  t: RevealTiming,
  hooks: { draw(draw: RevealDraw): void; cue(cue: RevealCue): void },
): Cue[] {
  const cues: Cue[] = revealDraws(t).map(({ at, draw }) => ({ at, run: () => hooks.draw(draw) }));
  cues.splice(1, 0, { at: t.HOLD, run: () => hooks.cue("hold") });
  cues.push(
    { at: t.STEP_OUT, run: () => hooks.cue("stepOut") },
    { at: t.TITLE, run: () => hooks.cue("title") },
    { at: t.DONE, run: () => hooks.cue("done") },
  );
  return cues;
}

/** The late-avatar mini gather: 48, 24, 12, crisp at 70 ms steps; `landed` runs after the last. */
export function buildLateGatherCues(draw: (block: number) => void, landed: () => void): Cue[] {
  const cues: Cue[] = GATHER_BLOCKS.map((block, i) => ({ at: i * LATE_GATHER_STEP_MS, run: () => draw(block) }));
  cues.push({ at: GATHER_BLOCKS.length * LATE_GATHER_STEP_MS, run: landed });
  return cues;
}
