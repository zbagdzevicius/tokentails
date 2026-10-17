/**
 * Clip caption styles (GDD 8: Club cosmetics "4 clip caption styles", visible in clips). Style 0 is the default
 * white text with a soft shadow (every tier); 1..4 are the Club styles. Pure layout + one canvas painter; every
 * style stays readable with the sound off in 1 s (large, high contrast, at most 2 lines).
 */
import type { Rect } from './gates';

export interface CaptionStyleDef {
  id: number;
  name: string;
  /** Font template; `{px}` is replaced. */
  font: string;
  fill: string;
  stroke: string | null;
  /** Stroke width as a fraction of the font size. */
  strokeK: number;
  shadow: { color: string; blur: number; y: number } | null;
  /** Rounded box behind each line (TikTok "classic" text). */
  box: string | null;
  upper: boolean;
  /** Typewriter reveal: characters per frame (0 = no reveal). */
  reveal: number;
  club: boolean;
}

const SANS = '"Trebuchet MS", "Avenir Next", system-ui, -apple-system, sans-serif';

export const CAPTION_STYLES: readonly CaptionStyleDef[] = Object.freeze([
  { id: 0, name: 'Default', font: `800 {px}px ${SANS}`, fill: '#ffffff', stroke: 'rgba(0,0,0,0.35)', strokeK: 1 / 9, shadow: { color: 'rgba(0,0,0,0.55)', blur: 10, y: 2 }, box: null, upper: false, reveal: 0, club: false },
  { id: 1, name: 'Classic', font: `800 {px}px ${SANS}`, fill: '#111111', stroke: null, strokeK: 0, shadow: null, box: 'rgba(255,255,255,0.96)', upper: false, reveal: 0, club: true },
  { id: 2, name: 'Comic', font: `900 {px}px "Impact", "Arial Black", ${SANS}`, fill: '#ffe14d', stroke: '#1b1020', strokeK: 0.2, shadow: { color: 'rgba(0,0,0,0.6)', blur: 0, y: 4 }, box: null, upper: true, reveal: 0, club: true },
  { id: 3, name: 'Neon', font: `800 {px}px ${SANS}`, fill: '#fff4fb', stroke: '#ff3fb4', strokeK: 0.12, shadow: { color: '#ff3fb4', blur: 22, y: 0 }, box: null, upper: false, reveal: 0, club: true },
  { id: 4, name: 'Typewriter', font: `700 {px}px "Courier New", ui-monospace, Menlo, monospace`, fill: '#1b1020', stroke: null, strokeK: 0, shadow: null, box: 'rgba(255,248,230,0.95)', upper: false, reveal: 2, club: true },
]);

/** Style for an id (unknown or out of range = the default style 0). */
export function captionStyle(id: number | undefined): CaptionStyleDef {
  const i = typeof id === 'number' && Number.isInteger(id) ? id : 0;
  return CAPTION_STYLES[i] ?? CAPTION_STYLES[0];
}

/** Text a style shows `age` frames after the caption appeared (Typewriter reveals 2 characters a frame). */
export function revealText(text: string, style: CaptionStyleDef, age: number): string {
  const t = style.upper ? text.toUpperCase() : text;
  if (!style.reveal || age < 0) return t;
  const chars = Array.from(t);
  const n = Math.max(1, Math.floor((age + 1) * style.reveal));
  return n >= chars.length ? t : chars.slice(0, n).join('');
}

type Measure = Pick<CanvasRenderingContext2D, 'measureText' | 'font'>;

/** Greedy word wrap into at most `maxLines`, shrinking the font from startPx to minPx until it fits. */
export function fitLines(ctx: Measure, text: string, maxW: number, maxLines: number, startPx: number, minPx: number, fontTpl: string): { px: number; lines: string[] } {
  const words = text.split(/\s+/).filter(Boolean);
  for (let px = startPx; px >= minPx; px -= 2) {
    ctx.font = fontTpl.replace('{px}', String(px));
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
  ctx.font = fontTpl.replace('{px}', String(minPx));
  return { px: minPx, lines: [text] };
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Draw a caption in `rect` with a style. Layout uses the full text (so a Typewriter reveal never re-wraps); `age`
 * is frames since this caption appeared.
 */
export function drawStyledCaption(ctx: CanvasRenderingContext2D, text: string, rect: Rect, startPx: number, maxLines: number, styleId = 0, age = 9999): void {
  if (!text) return;
  const st = captionStyle(styleId);
  const full = st.upper ? text.toUpperCase() : text;
  const { px, lines } = fitLines(ctx, full, rect.w - (st.box ? 24 : 0), maxLines, startPx, 22, st.font);
  const shown = revealText(text, st, age);
  let left = Array.from(shown).length;
  ctx.save();
  ctx.font = st.font.replace('{px}', String(px));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const lh = px * (st.box ? 1.32 : 1.18);
  const top = rect.y + rect.h / 2 - ((lines.length - 1) * lh) / 2;
  const cx = rect.x + rect.w / 2;
  lines.forEach((full, i) => {
    const n = Array.from(full).length;
    const part = left >= n ? full : Array.from(full).slice(0, Math.max(0, left)).join('');
    left -= n + 1;
    const y = top + i * lh;
    if (st.box) {
      const w = ctx.measureText(full).width + 24;
      ctx.fillStyle = st.box;
      roundRectPath(ctx, cx - w / 2, y - lh / 2 + 2, w, lh - 4, 10);
      ctx.fill();
    }
    if (!part) return;
    const tx = st.reveal ? cx - ctx.measureText(full).width / 2 : cx;
    if (st.reveal) ctx.textAlign = 'left';
    if (st.shadow) {
      ctx.shadowColor = st.shadow.color;
      ctx.shadowBlur = st.shadow.blur;
      ctx.shadowOffsetY = st.shadow.y;
    }
    if (st.stroke) {
      ctx.strokeStyle = st.stroke;
      ctx.lineWidth = Math.max(3, px * st.strokeK);
      ctx.strokeText(part, tx, y);
    }
    ctx.fillStyle = st.fill;
    ctx.fillText(part, tx, y);
    ctx.shadowColor = 'transparent';
    ctx.textAlign = 'center';
  });
  ctx.restore();
}

/** The handle pill ("@luna.mom", "Replying to @luna.mom"): white bubble, dark text, top third from 2 s. */
export function drawHandlePill(ctx: CanvasRenderingContext2D, text: string, rect: Rect): void {
  if (!text) return;
  ctx.save();
  let px = Math.round(rect.h * 0.56);
  const font = (p: number) => `800 ${p}px ${SANS}`;
  ctx.font = font(px);
  const pad = Math.round(rect.h * 0.42);
  while (px > 16 && ctx.measureText(text).width + pad * 2 > rect.w) {
    px -= 2;
    ctx.font = font(px);
  }
  const w = Math.min(rect.w, ctx.measureText(text).width + pad * 2);
  const x = rect.x + (rect.w - w) / 2;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  roundRectPath(ctx, x, rect.y, w, rect.h, rect.h / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#1b1020';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, rect.y + rect.h / 2 + 1);
  ctx.restore();
}
