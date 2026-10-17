/**
 * Sponsor label texture (RoomDef.sponsor.label printed on the sponsor product), drawn on a canvas the first time a
 * sponsor room loads. Returns null without a DOM (Node tests, workers), so the product simply shows its blank panel.
 */
import { CanvasTexture, SRGBColorSpace } from 'three';

export function makeLabelTexture(text: string, bg = 0xffffff, fg = 0x2b1d2e): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  let cv: HTMLCanvasElement;
  try {
    cv = document.createElement('canvas');
  } catch {
    return null;
  }
  cv.width = 256;
  cv.height = 224;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex(bg);
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = hex(fg);
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, cv.width - 16, cv.height - 16);
  const label = (text || '').trim().slice(0, 28) || 'SPONSOR';
  ctx.fillStyle = hex(fg);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // shrink to fit, up to two lines
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > 12 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const show = lines.slice(0, 2);
  let size = 64;
  for (; size > 18; size -= 2) {
    ctx.font = `900 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
    if (show.every((l) => ctx.measureText(l).width < cv.width - 40)) break;
  }
  const lh = size * 1.05;
  const y0 = cv.height / 2 - ((show.length - 1) * lh) / 2;
  show.forEach((l, i) => ctx.fillText(l, cv.width / 2, y0 + i * lh));
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
