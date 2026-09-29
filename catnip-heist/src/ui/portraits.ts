/**
 * 2D portraits cut from frame 0 of a sheet's IDLE row (crisp pixel art, cropped to the row's
 * opaque bounds and centred). Used by the cat pick grid, HUD crew buttons, results and yard cards.
 */
import { ASSET_BASE, FRAME_PX, type SheetEntry } from '../types';
import { loadImage } from '../render/voxel/sheets';

export interface PortraitOptions {
  /** Canvas size in device pixels (square). Default 96. */
  size?: number;
  /** Row name to cut from. Default IDLE. */
  row?: string;
  frame?: number;
  base?: string;
  /** Mirror horizontally (face left). */
  flip?: boolean;
}

/** Returns a canvas immediately; the pixels arrive when the sheet image has loaded. */
export function createPortrait(entry: SheetEntry, opts: PortraitOptions = {}): HTMLCanvasElement {
  const size = opts.size ?? 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.setAttribute('aria-hidden', 'true');
  drawPortrait(c, entry, opts).catch(() => undefined);
  return c;
}

export async function drawPortrait(canvas: HTMLCanvasElement, entry: SheetEntry, opts: PortraitOptions = {}): Promise<void> {
  const base = opts.base ?? ASSET_BASE;
  const img = await loadImage(base + entry.sheet);
  const rowName = (opts.row ?? 'IDLE').toUpperCase();
  let r = entry.rows.findIndex((x) => x.name === rowName);
  if (r < 0 || entry.rows[r].frames === 0) r = Math.max(0, entry.rows.findIndex((x) => x.frames > 0));
  const row = entry.rows[r];
  const b = row?.bounds ?? { minX: 0, minY: 0, maxX: FRAME_PX - 1, maxY: FRAME_PX - 1 };
  const frame = Math.min(opts.frame ?? 0, Math.max(0, (row?.frames ?? 1) - 1));
  const bw = b.maxX - b.minX + 1, bh = b.maxY - b.minY + 1;
  const side = Math.max(bw, bh) + 4;
  const cx = (b.minX + b.maxX + 1) / 2, cy = (b.minY + b.maxY + 1) / 2;
  const sx = frame * FRAME_PX + cx - side / 2, sy = r * FRAME_PX + cy - side / 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Fill the canvas; CSS scales it again with image-rendering: pixelated anyway.
  const scale = canvas.width / side;
  const dw = side * scale;
  const off = (canvas.width - dw) / 2;
  ctx.save();
  if (opts.flip) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  // Clip the source to this frame so neighbouring frames never bleed in.
  ctx.beginPath();
  ctx.rect(off + (frame * FRAME_PX - sx) * scale, off + (r * FRAME_PX - sy) * scale, FRAME_PX * scale, FRAME_PX * scale);
  ctx.clip();
  ctx.drawImage(img, sx, sy, side, side, off, off, dw, dw);
  ctx.restore();
}
