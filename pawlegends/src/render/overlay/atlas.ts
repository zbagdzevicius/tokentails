/**
 * PERF-IOS §8 Track A: the overlay's stamp atlas. Everything on the overhead plates that is not a plain rectangle or
 * line (names and their pills, level numbers, crowns, status chips, arrows, glyphs) is painted ONCE with the same
 * Canvas 2D code as before into a cell of this atlas, keyed by what it shows, and then drawn as a textured quad every
 * frame (render/overlay/quadBatch.ts). A busy fight reaches ~40 distinct stamps; they repaint only when a name, a
 * level, a status or the drawing-buffer scale changes, so the steady frame does no Canvas 2D work at all.
 *
 * Cells are packed on shelves. When the atlas fills past FULL_SHARE (or the scale changes, or a web font arrives) it
 * is cleared at the start of the next frame and refilled on demand. Stamps are painted centred on (0, 0) in CSS px.
 */
import type { StampRegion } from './quadBatch';

/** Cell padding (device px) around each stamp: linear filtering of a scaled stamp never reads a neighbour. */
export const ATLAS_PAD = 2;
/** The atlas is cleared at the next frame start once this share of its rows is used. */
export const FULL_SHARE = 0.8;

/** Shelf packer (pure): returns the top-left of a w × h cell, or null when it does not fit. */
export class ShelfPacker {
  private shelfY = 0;
  private shelfH = 0;
  private x = 0;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  /** Rows used, as a share of the height. */
  get used(): number {
    return (this.shelfY + this.shelfH) / this.height;
  }

  reset(): void {
    this.shelfY = this.shelfH = this.x = 0;
  }

  alloc(w: number, h: number): { x: number; y: number } | null {
    if (w > this.width || h > this.height) return null;
    if (this.x + w > this.width) {
      this.shelfY += this.shelfH;
      this.shelfH = 0;
      this.x = 0;
    }
    if (this.shelfY + h > this.height) return null;
    const at = { x: this.x, y: this.shelfY };
    this.x += w;
    this.shelfH = Math.max(this.shelfH, h);
    return at;
  }
}

export type Paint = (g: CanvasRenderingContext2D) => void;

export class StampAtlas {
  readonly canvas: HTMLCanvasElement | null;
  /** The atlas's 2D context (stamps paint into it; text is measured with it). Tests may swap in a stand-in. */
  g: CanvasRenderingContext2D | null;
  readonly packer: ShelfPacker;
  /** Device px per CSS px the stamps are painted at. */
  scale = 1;
  /** Bumped on every clear (glOverlay re-uploads the whole texture). */
  generation = 0;
  /** The canvas changed since the last upload. */
  dirty = true;
  /** Stamps painted so far (tests, the perf readout). */
  paints = 0;
  private readonly map = new Map<string, StampRegion>();
  private wantReset = false;
  /** The white block's texel centre (rects and lines sample it). */
  readonly white = { u: 0, v: 0 };

  constructor(
    readonly width = 1024,
    readonly height = 1024,
  ) {
    this.packer = new ShelfPacker(width, height);
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (c) {
      c.width = width;
      c.height = height;
    }
    this.canvas = c;
    let g: CanvasRenderingContext2D | null = null;
    try {
      g = c?.getContext('2d') ?? null;
    } catch {
      g = null;
    }
    this.g = g;
    this.clear();
    // a web font that arrives later (Fredoka) repaints every stamp drawn with the fallback face
    try {
      document.fonts?.addEventListener?.('loadingdone', () => this.invalidate());
    } catch {
      /* no font loading API */
    }
  }

  /** Clear at the next frame start (font change, settings). */
  invalidate(): void {
    this.wantReset = true;
    this.widths.clear();
  }

  /** Call once per frame before any `get`: applies a pending clear, a scale change or a full atlas. */
  beginFrame(scale: number): void {
    const s = scale > 0 ? scale : 1;
    if (s !== this.scale || this.wantReset || this.packer.used > FULL_SHARE) {
      this.scale = s;
      this.clear();
    }
  }

  private clear(): void {
    this.wantReset = false;
    this.map.clear();
    this.packer.reset();
    this.generation++;
    this.dirty = true;
    const g = this.g;
    if (g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.width, this.height);
      // a 4 × 4 white block at the origin: its centre texel is the solid colour every rect and line samples
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 4, 4);
    }
    this.packer.alloc(4 + ATLAS_PAD, 4 + ATLAS_PAD);
    this.white.u = 2 / this.width;
    this.white.v = 2 / this.height;
  }

  /** Number of stamps held. */
  get size(): number {
    return this.map.size;
  }

  /**
   * The stamp for `key`: painted on first use by `paint` (centred on (0, 0), CSS px, inside a w × h CSS px box), then
   * reused. Null when the atlas is full this frame (the stamp shows from the next frame, after the clear).
   */
  get(key: string, w: number, h: number, paint: Paint): StampRegion | null {
    const hit = this.map.get(key);
    if (hit) return hit;
    const s = this.scale;
    // whole device px, even, so the centre sits on a pixel edge
    const pw = Math.max(2, Math.ceil((w * s) / 2) * 2);
    const ph = Math.max(2, Math.ceil((h * s) / 2) * 2);
    const at = this.packer.alloc(pw + ATLAS_PAD * 2, ph + ATLAS_PAD * 2);
    if (!at) {
      this.wantReset = true;
      return null;
    }
    const x = at.x + ATLAS_PAD;
    const y = at.y + ATLAS_PAD;
    const g = this.g;
    if (g) {
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.beginPath();
      g.rect(x, y, pw, ph);
      g.clip();
      g.setTransform(s, 0, 0, s, x + pw / 2, y + ph / 2);
      g.globalAlpha = 1;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      paint(g);
      g.restore();
    }
    this.paints++;
    this.dirty = true;
    const r: StampRegion = { u0: x / this.width, v0: y / this.height, u1: (x + pw) / this.width, v1: (y + ph) / this.height, pw, ph };
    this.map.set(key, r);
    return r;
  }

  private readonly widths = new Map<string, number>();
  /** Text width (CSS px) of `text` in `font`, cached. */
  measure(text: string, font: string): number {
    const key = `${font}|${text}`;
    const hit = this.widths.get(key);
    if (hit !== undefined) return hit;
    const g = this.g;
    let w = text.length * 6;
    if (g) {
      g.save();
      g.font = font;
      w = g.measureText(text).width;
      g.restore();
    }
    if (this.widths.size > 2048) this.widths.clear();
    this.widths.set(key, w);
    return w;
  }

  /** Forget measured widths (a web font arrived). */
  forgetWidths(): void {
    this.widths.clear();
  }
}
