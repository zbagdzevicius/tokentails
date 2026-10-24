// A look portrait for cards (SHARE lane): WARDROBE's ugc.drawLook, or a simple procedural cat face when that draws
// nothing (before the WARDROBE lane lands).
import { ugc } from '../ugc/contract';
import type { Look } from '../wardrobe/look';

let probe: HTMLCanvasElement | null = null;

/** draw `look` into (x, y, size); returns false when the fallback face was used */
export function drawLookOr(ctx: CanvasRenderingContext2D, look: Look, x: number, y: number, size: number): boolean {
  probe ??= document.createElement('canvas');
  const n = Math.max(16, Math.round(size));
  probe.width = probe.height = n;
  const p = probe.getContext('2d', { willReadFrequently: true });
  let drew = false;
  if (p) {
    p.clearRect(0, 0, n, n);
    try {
      ugc.drawLook(p, look, 0, 0, n);
      const d = p.getImageData(0, 0, n, n).data;
      // anything opaque in the middle third counts as a portrait
      for (let yy = Math.floor(n / 3); yy < (2 * n) / 3 && !drew; yy += 3) for (let xx = Math.floor(n / 3); xx < (2 * n) / 3; xx += 3) if (d[(yy * n + xx) * 4 + 3] > 40) {
        drew = true;
        break;
      }
    } catch {
      drew = false;
    }
  }
  if (drew && p) {
    ctx.drawImage(probe, x, y, size, size);
    return true;
  }
  fallbackFace(ctx, x, y, size);
  return false;
}

/** Mochi's classic face: orange head, cream muzzle, pink ears */
function fallbackFace(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const k = s / 100;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  c.lineJoin = 'round';
  c.lineWidth = 3.5;
  c.strokeStyle = '#2a1c14';
  // ears
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.moveTo(50 + sx * 30, 44);
    c.lineTo(50 + sx * 34, 12);
    c.lineTo(50 + sx * 10, 30);
    c.closePath();
    c.fillStyle = '#ff9a3c';
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(50 + sx * 27, 38);
    c.lineTo(50 + sx * 30, 20);
    c.lineTo(50 + sx * 16, 31);
    c.closePath();
    c.fillStyle = '#ffb3c2';
    c.fill();
  }
  // head
  c.beginPath();
  c.ellipse(50, 58, 38, 32, 0, 0, Math.PI * 2);
  c.fillStyle = '#ff9a3c';
  c.fill();
  c.stroke();
  // stripes
  c.strokeStyle = '#d96a1c';
  c.lineWidth = 4;
  for (const dx of [-8, 0, 8]) {
    c.beginPath();
    c.moveTo(50 + dx, 28);
    c.lineTo(50 + dx * 0.8, 38);
    c.stroke();
  }
  // muzzle
  c.beginPath();
  c.ellipse(50, 72, 20, 14, 0, 0, Math.PI * 2);
  c.fillStyle = '#fff7ea';
  c.fill();
  // eyes
  c.fillStyle = '#2a1c14';
  for (const sx of [-1, 1]) {
    c.beginPath();
    c.ellipse(50 + sx * 15, 55, 5, 6.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(50 + sx * 15 + 1.6, 52.5, 1.8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2a1c14';
  }
  // nose + mouth
  c.fillStyle = '#ff6b8f';
  c.beginPath();
  c.moveTo(46, 66);
  c.lineTo(54, 66);
  c.lineTo(50, 71);
  c.closePath();
  c.fill();
  c.strokeStyle = '#2a1c14';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(50, 71);
  c.quadraticCurveTo(46, 77, 42, 74);
  c.moveTo(50, 71);
  c.quadraticCurveTo(54, 77, 58, 74);
  c.stroke();
  c.restore();
}
