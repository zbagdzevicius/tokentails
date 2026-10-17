/**
 * Household clip cards (GDD 8, Club): the 1 s title card "Mochi vs Luna: who's worse?" (two faces bounce in, so the
 * first second has motion) and the 1 s scores card with the verdict. The caption line itself is drawn by the
 * composer (title / verdict / URL line); these paint the background.
 */
import type { CatSpec } from '../../types';
import { formatThousands } from '../emoji-card';
import { coverDraw, drawCatFace, FONT } from '../image-card';
import type { OpenerImage } from './compose';
import type { Painter } from './pipeline';

export interface HouseholdCat {
  cat: CatSpec;
  score: number;
  /** Face photo (opener still) for the round portrait; null = toon face. */
  face?: OpenerImage | null;
}

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function roundFace(ctx: CanvasRenderingContext2D, c: HouseholdCat, cx: number, cy: number, r: number, ring: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (c.face) coverDraw(ctx, c.face, cx - r, cy - r, r * 2, r * 2);
  else drawCatFace(ctx, c.cat, cx, cy, r);
  ctx.restore();
}

function bg(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#ff8fa3');
  g.addColorStop(0.5, '#3a2540');
  g.addColorStop(1, '#5fa8e8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Title card painter (frames 0..29): the two suspects bounce in, "VS" pulses. */
export function titlePainter(a: HouseholdCat, b: HouseholdCat, frames = 30): Painter {
  return (ctx, w, h, frame) => {
    bg(ctx, w, h);
    const t = Math.min(1, frame / Math.max(1, frames * 0.6));
    const k = easeOutBack(t);
    const r = w * 0.2;
    const cy = h * 0.52;
    roundFace(ctx, a, w * 0.28 - (1 - k) * w * 0.5, cy - 40, r, '#ffcf5c');
    roundFace(ctx, b, w * 0.72 + (1 - k) * w * 0.5, cy + 40, r, '#ff8fa3');
    const pulse = 1 + 0.08 * Math.sin(frame * 0.5);
    ctx.save();
    ctx.translate(w / 2, cy);
    ctx.scale(pulse, pulse);
    ctx.font = FONT(900, 110);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#1b1020';
    ctx.strokeText('VS', 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('VS', 0, 0);
    ctx.restore();
  };
}

/** Scores card painter (last 30 frames): both faces with scores, a crown on the worse cat. */
export function scoresPainter(a: HouseholdCat, b: HouseholdCat): Painter {
  return (ctx, w, h, frame) => {
    bg(ctx, w, h);
    const r = w * 0.17;
    const rows: [HouseholdCat, number][] = [
      [a, h * 0.45],
      [b, h * 0.64],
    ];
    const worst = a.score === b.score ? null : a.score > b.score ? a : b;
    for (const [c, y] of rows) {
      roundFace(ctx, c, w * 0.26, y, r, c === worst ? '#ffcf5c' : '#ffffff');
      ctx.font = FONT(900, 70);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(formatThousands(c.score), w * 0.46, y - 20);
      ctx.font = FONT(700, 36);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText((c.cat.name || '').trim() || 'Tofu', w * 0.46, y + 40);
      if (c === worst) {
        const bob = Math.sin(frame * 0.4) * 6;
        ctx.font = FONT(400, 84);
        ctx.textAlign = 'center';
        ctx.fillText('👑', w * 0.26, y - r - 40 + bob);
      }
    }
  };
}
