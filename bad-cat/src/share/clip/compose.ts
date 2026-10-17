/**
 * Clip composition on a 720 × 1280 2D canvas (GDD 7.3):
 *  0–2 s   opener: the real cat photo with a slow 3 % push-in, face crop aligned to FACE_RECT (match cut);
 *          without an opener the renderer's game close-up shows through
 *  2–11 s  the renderer's clip pass (one take, slow motion inside the plan's window)
 *  11–12 s cut back to frame 0's framing (seamless loop) when frame 0 is the cat photo; else the wreck shot
 *  Caption line top third (hook → URL line at 10 s), watermark top left from 1 s, both inside the safe box.
 *
 * `drawFrame` must be called synchronously inside the renderer's onFrame callback (same task as the WebGL draw),
 * because the game canvas has no preserveDrawingBuffer.
 */
import { CLIP_H, CLIP_W, FACE_RECT, type ClipPlan } from '../../types';
import { layoutFor, type ClipLayout, type Rect } from './gates';
import { OPENER_FRAMES } from './highlights';
import { drawHandlePill, drawStyledCaption } from './styles';

export type OpenerImage = CanvasImageSource & { width: number; height: number };

export const CAPTION_FONT = '800 {px}px "Trebuchet MS", "Avenir Next", system-ui, -apple-system, sans-serif';
export const OPENER_PUSH = 0.03;

/**
 * Source rectangle of the opener photo for a cover fit, with the face crop centred on FACE_RECT when known.
 * `push` 0..1 scales in by OPENER_PUSH around the face. Pure maths (tested).
 */
export function openerSourceRect(
  srcW: number,
  srcH: number,
  push: number,
  faceCrop?: Rect | null,
  out: { w: number; h: number } = { w: CLIP_W, h: CLIP_H },
): Rect {
  const cover = Math.max(out.w / srcW, out.h / srcH);
  let scale = cover;
  let cx = srcW / 2;
  let cy = srcH / 2;
  let ax = out.w / 2; // anchor in output space
  let ay = out.h / 2;
  // A crop that does not fit the opener is in another pixel space (pre-round-3 saves used source-photo pixels):
  // centre-crop instead of zooming into the wrong place.
  if (faceCrop && (faceCrop.x + faceCrop.w > srcW + 2 || faceCrop.y + faceCrop.h > srcH + 2)) faceCrop = null;
  if (faceCrop && faceCrop.w > 0 && faceCrop.h > 0) {
    scale = Math.max(cover, FACE_RECT.w / faceCrop.w);
    cx = faceCrop.x + faceCrop.w / 2;
    cy = faceCrop.y + faceCrop.h / 2;
    ax = FACE_RECT.x + FACE_RECT.w / 2;
    ay = FACE_RECT.y + FACE_RECT.h / 2;
  }
  scale *= 1 + OPENER_PUSH * Math.min(1, Math.max(0, push));
  const sw = out.w / scale;
  const sh = out.h / scale;
  let sx = cx - ax / scale;
  let sy = cy - ay / scale;
  sx = Math.min(Math.max(0, sx), Math.max(0, srcW - sw));
  sy = Math.min(Math.max(0, sy), Math.max(0, srcH - sh));
  return { x: sx, y: sy, w: sw, h: sh };
}

/** Greedy word wrap into at most `maxLines` lines, shrinking the font until it fits. */
export function fitCaption(
  ctx: Pick<CanvasRenderingContext2D, 'measureText' | 'font'>,
  text: string,
  maxW: number,
  maxLines: number,
  startPx: number,
  minPx: number,
): { px: number; lines: string[] } {
  const words = text.split(/\s+/).filter(Boolean);
  for (let px = startPx; px >= minPx; px -= 2) {
    ctx.font = CAPTION_FONT.replace('{px}', String(px));
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(next).width <= maxW || !cur) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { px, lines };
  }
  ctx.font = CAPTION_FONT.replace('{px}', String(minPx));
  return { px: minPx, lines: [text] };
}

/**
 * Source rect of a pre-aligned opener frame (already cropped to the output framing) for push 0..1: scales in by
 * OPENER_PUSH around the face anchor (FACE_RECT centre in output space). Pure maths.
 */
export function pushRect(w: number, h: number, push: number, out: { w: number; h: number } = { w: CLIP_W, h: CLIP_H }): Rect {
  const k = 1 + OPENER_PUSH * Math.min(1, Math.max(0, push));
  const ax = ((FACE_RECT.x + FACE_RECT.w / 2) / out.w) * w;
  const ay = ((FACE_RECT.y + FACE_RECT.h / 2) / out.h) * h;
  const sw = w / k;
  const sh = h / k;
  const sx = Math.min(Math.max(0, ax - ax / k), w - sw);
  const sy = Math.min(Math.max(0, ay - ay / k), h - sh);
  return { x: sx, y: sy, w: sw, h: sh };
}

/** Paw print (4 toes + pad) in a square of size s at (x, y). */
export function drawPaw(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color = '#ffffff'): void {
  ctx.save();
  ctx.fillStyle = color;
  const toe = s * 0.14;
  const toes: [number, number][] = [
    [0.2, 0.42],
    [0.38, 0.22],
    [0.62, 0.22],
    [0.8, 0.42],
  ];
  for (const [tx, ty] of toes) {
    ctx.beginPath();
    ctx.ellipse(x + tx * s, y + ty * s, toe, toe * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(x + 0.5 * s, y + 0.7 * s, s * 0.26, s * 0.21, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, rect: Rect, shortUrl: string): void {
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  const paw = rect.h * 0.8;
  drawPaw(ctx, rect.x, rect.y + (rect.h - paw) / 2, paw);
  let px = Math.round(rect.h * 0.52);
  ctx.font = CAPTION_FONT.replace('{px}', String(px));
  const maxW = rect.w - paw - 10;
  while (px > 14 && ctx.measureText(shortUrl).width > maxW) {
    px -= 2;
    ctx.font = CAPTION_FONT.replace('{px}', String(px));
  }
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(shortUrl, rect.x + paw + 10, rect.y + rect.h / 2);
  ctx.restore();
}

export interface ComposerOptions {
  plan: ClipPlan;
  shortUrl: string;
  opener?: OpenerImage | null;
  /** Video opener: up to 60 frames already cropped to the output framing (face on FACE_RECT); wins over `opener`. */
  openerFrames?: readonly OpenerImage[] | null;
  faceCrop?: Rect | null;
  layout?: ClipLayout;
  /** Caption override per output frame (household); default: hook, then the URL line / end line. */
  captionFor?: (frame: number) => string;
}

/** Draws clip frames into its own 720 × 1280 canvas. */
export class ClipComposer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly first: HTMLCanvasElement;
  private readonly firstCtx: CanvasRenderingContext2D;
  private readonly layout: ClipLayout;
  private hasFirst = false;

  constructor(private readonly opts: ComposerOptions) {
    this.layout = opts.layout ?? layoutFor(opts.plan);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.layout.width;
    this.canvas.height = this.layout.height;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    this.first = document.createElement('canvas');
    this.first.width = this.layout.width;
    this.first.height = this.layout.height;
    const fctx = this.first.getContext('2d', { alpha: false });
    if (!ctx || !fctx) throw new Error('clip: 2D canvas unavailable');
    this.ctx = ctx;
    this.firstCtx = fctx;
  }

  /** Release both 720 × 1280 backing stores now (iOS counts canvases waiting for GC against its memory cap). */
  dispose(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.first.width = 0;
    this.first.height = 0;
  }

  /** The layout this composer draws with. */
  get layoutUsed(): ClipLayout {
    return this.layout;
  }

  /** Swap the opener between two passes (household: each cat has its own face). */
  setOpener(opener: OpenerImage | null, openerFrames: readonly OpenerImage[] | null, faceCrop: Rect | null): void {
    this.opts.opener = opener;
    this.opts.openerFrames = openerFrames;
    this.opts.faceCrop = faceCrop;
  }

  private hasOpener(): boolean {
    return !!(this.opts.opener || (this.opts.openerFrames && this.opts.openerFrames.length));
  }

  /**
   * Draw output frame `frame`. `game` is the renderer's canvas for this frame (may be null); `src` is the frame index
   * inside the render pass (differs from `frame` only in the household clip).
   */
  drawFrame(game: CanvasImageSource | null, frame: number, src: number = frame): void {
    const { ctx, layout, opts } = this;
    const W = layout.width;
    const H = layout.height;
    // Loop back to frame 0 only when it is the real cat photo (or the layout loops a close-up on itself);
    // without one the game tail frames the wreck.
    const frames = opts.openerFrames;
    if (frame >= layout.loopFromFrame && this.hasFirst && (this.hasOpener() || layout.loopToFirst)) {
      ctx.drawImage(this.first, 0, 0, W, H);
    } else if (src < OPENER_FRAMES && frames && frames.length) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const f = frames[Math.min(frames.length - 1, src)];
      const r = pushRect(f.width, f.height, src / OPENER_FRAMES, { w: W, h: H });
      ctx.drawImage(f, r.x, r.y, r.w, r.h, 0, 0, W, H);
    } else if (src < OPENER_FRAMES && opts.opener) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const o = opts.opener;
      const r = openerSourceRect(o.width, o.height, src / OPENER_FRAMES, opts.faceCrop, { w: W, h: H });
      ctx.drawImage(o, r.x, r.y, r.w, r.h, 0, 0, W, H);
    } else if (game) {
      ctx.drawImage(game, 0, 0, W, H);
    } else {
      ctx.fillStyle = '#2b1d2e';
      ctx.fillRect(0, 0, W, H);
    }
    this.afterBackground(frame);
  }

  /** Draw an output frame from a 2D painter (household title and scores cards), then the overlays. */
  drawCard(frame: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number, frame: number) => void): void {
    const { ctx, layout } = this;
    ctx.save();
    paint(ctx, layout.width, layout.height, frame);
    ctx.restore();
    this.afterBackground(frame);
  }

  private afterBackground(frame: number): void {
    if (frame === 0 && !this.hasFirst) {
      this.firstCtx.drawImage(this.canvas, 0, 0);
      this.hasFirst = true;
    }
    this.drawOverlays(frame);
  }

  private drawOverlays(frame: number): void {
    const { ctx, layout, opts } = this;
    const { plan } = opts;
    const style = plan.captionStyle ?? 0;
    const urlOn = frame >= layout.urlLine.fromFrame && frame <= layout.urlLine.toFrame;
    const custom = opts.captionFor?.(frame);
    if (urlOn) {
      const line = plan.endLine ?? custom ?? plan.urlLine;
      drawStyledCaption(ctx, line, layout.urlLine.rect, plan.endLine ? 46 : 44, 2, style, frame - layout.urlLine.fromFrame);
    } else if (frame >= layout.caption.fromFrame && frame <= layout.caption.toFrame) {
      drawStyledCaption(ctx, custom ?? plan.hook, layout.caption.rect, 50, 2, style, frame - this.captionStart(frame, custom));
    }
    if (plan.overlay && frame >= layout.overlay.fromFrame && frame <= layout.overlay.toFrame) drawHandlePill(ctx, plan.overlay, layout.overlay.rect);
    // review round 1: no watermark while the URL line already shows the address (it read twice)
    const urlShown = urlOn && !plan.endLine && (custom ?? plan.urlLine).includes(opts.shortUrl);
    if (frame >= layout.watermark.fromFrame && !urlShown) drawWatermark(ctx, layout.watermark.rect, opts.shortUrl);
  }

  private lastCaption = '';
  private lastCaptionFrom = 0;
  /** Frame the current caption text first appeared (Typewriter reveal restarts on each new line). */
  private captionStart(frame: number, text: string | undefined): number {
    const t = text ?? this.opts.plan.hook;
    if (t !== this.lastCaption) {
      this.lastCaption = t;
      this.lastCaptionFrom = frame;
    }
    return this.lastCaptionFrom;
  }
}

/** Decode opener media into something drawable. Video: one frame (M0). Returns null on any failure. */
export async function loadOpenerImage(media: Blob, kind: 'photo' | 'video'): Promise<OpenerImage | null> {
  try {
    if (kind === 'photo') {
      if (typeof createImageBitmap === 'function') return await createImageBitmap(media);
      return await loadViaImg(media);
    }
    return await grabVideoFrame(media);
  } catch {
    try {
      return kind === 'photo' ? await loadViaImg(media) : null;
    } catch {
      return null;
    }
  }
}

function loadViaImg(media: Blob): Promise<OpenerImage | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(media);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d')?.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function grabVideoFrame(media: Blob): Promise<OpenerImage | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(media);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    let done = false;
    const finish = (img: OpenerImage | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(img);
    };
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
      } catch {
        finish(null);
      }
    };
    v.onseeked = () => {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext('2d');
      if (!ctx || !c.width) return finish(null);
      ctx.drawImage(v, 0, 0);
      finish(c);
    };
    v.onerror = () => finish(null);
    setTimeout(() => finish(null), 4000);
    v.src = url;
  });
}
