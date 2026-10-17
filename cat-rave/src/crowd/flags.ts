/**
 * L-CROWD: the flag texture atlas the crowd cats' flags sample. One canvas, a grid of small flag
 * cells painted on demand with `drawFlag` (L-DATA `countries.ts`, simplified designs that read the
 * same on every OS, unlike emoji flags on Windows). A country gets a cell the first time a cat holds
 * it; cell indices are stable for the page's life.
 *
 * Cats from payouts with no known country hold no flag (cell −1): a flag means "a Moon Rave buyer
 * from there", and 10k neutral pennants would bury the real ones.
 */
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';
import { cleanCountry, drawFlag, type FlagCtx } from '../data/countries';

/**
 * Atlas grid: 16 × 16 cells of 72 × 48 px = 256 cells ≥ every country code. Each flag is painted
 * 60 × 40 (3:2, like the cloth) inside a `padX` / `padY` gutter whose pixels repeat the flag's edge,
 * so mipmaps (on: far cats draw a flag a few pixels wide and would shimmer without them) do not
 * bleed a neighbour's colours into it for the first levels.
 */
export const FLAG_ATLAS = Object.freeze({ cols: 16, rows: 16, cellW: 72, cellH: 48, padX: 6, padY: 4 });

/**
 * Pure cell allocator: country → stable cell index, −1 for unknown countries or when full. `paint`
 * runs once per new cell.
 */
export class FlagCells {
  private readonly cells = new Map<string, number>();
  constructor(
    readonly capacity: number,
    private readonly paint: (code: string, cell: number) => void = () => {},
  ) {}

  get size(): number {
    return this.cells.size;
  }

  /** Cell for this country, painting a new one if needed; −1 for null / unknown / atlas full. */
  cellOf(country: unknown): number {
    const c = cleanCountry(country);
    if (!c) return -1;
    const hit = this.cells.get(c);
    if (hit !== undefined) return hit;
    if (this.cells.size >= this.capacity) return -1;
    const cell = this.cells.size;
    this.cells.set(c, cell);
    this.paint(c, cell);
    return cell;
  }

}

/** Top-left pixel of `cell` in the atlas canvas. */
export function cellOrigin(cell: number, a = FLAG_ATLAS): { x: number; y: number } {
  return { x: (cell % a.cols) * a.cellW, y: Math.floor(cell / a.cols) * a.cellH };
}

export interface FlagAtlas {
  readonly texture: Texture | null;
  /** Cell for a country (paints it on first use), −1 for none. */
  cellOf(country: unknown): number;
  readonly size: number;
  dispose(): void;
}

/** The browser atlas. Without a DOM (tests, workers) every cat holds no flag. */
export function createFlagAtlas(): FlagAtlas {
  const a = FLAG_ATLAS;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d') ?? null;
  if (!canvas || !ctx) {
    return { texture: null, cellOf: () => -1, size: 0, dispose() {} };
  }
  canvas.width = a.cols * a.cellW;
  canvas.height = a.rows * a.cellH;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  const px = a.padX;
  const py = a.padY;
  const iw = a.cellW - 2 * px;
  const ih = a.cellH - 2 * py;
  const cells = new FlagCells(a.cols * a.rows, (code, cell) => {
    const o = cellOrigin(cell, a);
    const x = o.x + px;
    const y = o.y + py;
    drawFlag(ctx as unknown as FlagCtx, code, x, y, iw, ih);
    // Gutter: stretch the edge pixels out (left, right, then full-width top and bottom rows).
    ctx.drawImage(canvas, x, y, 1, ih, o.x, y, px, ih);
    ctx.drawImage(canvas, x + iw - 1, y, 1, ih, x + iw, y, px, ih);
    ctx.drawImage(canvas, o.x, y, a.cellW, 1, o.x, o.y, a.cellW, py);
    ctx.drawImage(canvas, o.x, y + ih - 1, a.cellW, 1, o.x, y + ih, a.cellW, py);
    texture.needsUpdate = true;
  });
  return {
    texture,
    cellOf: (c) => cells.cellOf(c),
    get size() {
      return cells.size;
    },
    dispose() {
      texture.dispose();
    },
  };
}
