/**
 * Result card 1080 × 1350 and story card 1080 × 1920 (GDD 7.4): freeze-frame of the biggest crash, cat inset
 * (real photo circle when allowed, else the fur colour), score, stamp, rank, timeline emoji,
 * "beat {cat} → {link}". Client canvas only; returns a PNG blob.
 */
import { propKind, rgb888, seenText, type CatSpec, type PlayableRoom, type RunResult } from '../types';
import { drawPaw, type OpenerImage } from './clip/compose';
import { cardTitle, emojiTimeline, formatThousands, STAMP_LINE } from './emoji-card';

export const RESULT_CARD = { w: 1080, h: 1350 } as const;
export const STORY_CARD = { w: 1080, h: 1920 } as const;

export interface ResultCardInput {
  run: RunResult;
  play: PlayableRoom;
  cat: CatSpec;
  /** Link line, e.g. 'tokentails.com/badcat/d/18'. */
  link: string;
  /** Freeze-frame of the biggest crash (e.g. a renderer frame copied to a canvas). */
  freeze?: CanvasImageSource | null;
  /** Real photo for the inset circle (only when "show my cat's photo" is on). */
  photo?: OpenerImage | null;
  /** Round 2: the player's own cat rendered in 3D (the inset when there is no photo; the flat face is the fallback). */
  catArt?: CanvasImageSource | null;
  format?: 'result' | 'story';
}

const STAMP_COLOR: Record<string, string> = { perfect: '#3fbf6a', clean: '#f2c14e', caught: '#e25b5b' };
export const FONT = (w: number, px: number) => `${w} ${px}px "Trebuchet MS", "Avenir Next", system-ui, -apple-system, sans-serif`;

export function hex(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function coverDraw(ctx: CanvasRenderingContext2D, img: CanvasImageSource, x: number, y: number, w: number, h: number): void {
  const iw = (img as { width: number }).width || w;
  const ih = (img as { height: number }).height || h;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

/** A flat toon cat face in the cat's own colours (the inset when there is no photo). */
export function drawCatFace(ctx: CanvasRenderingContext2D, cat: CatSpec, cx: number, cy: number, r: number): void {
  const base = hex(rgb888(cat.base));
  const sec = hex(rgb888(cat.secondary));
  ctx.fillStyle = '#ffe9c9';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  const hr = r * 0.62;
  const hy = cy + r * 0.12;
  ctx.fillStyle = base;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * hr * 0.25, hy - hr * 0.8);
    ctx.lineTo(cx + side * hr * 0.95, hy - hr * 1.25);
    ctx.lineTo(cx + side * hr * 0.95, hy - hr * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, hy, hr * 1.1, hr, 0, 0, Math.PI * 2);
  ctx.fill();
  if (cat.pattern !== 'solid') {
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.ellipse(cx, hy + hr * 0.42, hr * 0.62, hr * 0.48, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2b1d2e';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + side * hr * 0.42, hy - hr * 0.08, hr * 0.13, hr * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ff8fa3';
  ctx.beginPath();
  ctx.moveTo(cx - hr * 0.1, hy + hr * 0.18);
  ctx.lineTo(cx + hr * 0.1, hy + hr * 0.18);
  ctx.lineTo(cx, hy + hr * 0.3);
  ctx.closePath();
  ctx.fill();
}

/** Draw the card into a canvas (created when omitted) and return it. */
export function drawResultCard(input: ResultCardInput, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const size = input.format === 'story' ? STORY_CARD : RESULT_CARD;
  const c = canvas ?? document.createElement('canvas');
  c.width = size.w;
  c.height = size.h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('image card: 2D canvas unavailable');
  const { run, play, cat } = input;
  const W = size.w;
  const H = size.h;

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3a2540');
  bg.addColorStop(1, '#2b1d2e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Title
  ctx.fillStyle = '#ffcf5c';
  ctx.font = FONT(800, 46);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(cardTitle(play).replace(/\s*\p{Extended_Pictographic}️?$/u, ''), W / 2, 90);

  // Freeze-frame
  const fx = 60;
  const fy = 130;
  const fw = W - 120;
  const story = input.format === 'story';
  const fh = story ? STORY_FREEZE_H : 640;
  ctx.save();
  roundRect(ctx, fx, fy, fw, fh, 36);
  ctx.clip();
  if (input.freeze) {
    coverDraw(ctx, input.freeze, fx, fy, fw, fh);
    // a soft vignette at the bottom so the inset and the stamp sit on the picture, not on a hard edge
    const v = ctx.createLinearGradient(0, fy + fh * 0.7, 0, fy + fh);
    v.addColorStop(0, 'rgba(43,29,46,0)');
    v.addColorStop(1, 'rgba(43,29,46,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(fx, fy, fw, fh);
  } else {
    const g = ctx.createLinearGradient(fx, fy, fx, fy + fh);
    g.addColorStop(0, '#f6d9b8');
    g.addColorStop(1, '#d99a6c');
    ctx.fillStyle = g;
    ctx.fillRect(fx, fy, fw, fh);
    ctx.globalAlpha = 0.25;
    drawPaw(ctx, W / 2 - 120, fy + fh / 2 - 120, 240, '#2b1d2e');
  }
  ctx.restore();

  // Cat inset circle
  const r = 110;
  const cx = fx + 40 + r;
  const cy = fy + fh;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (input.photo) coverDraw(ctx, input.photo, cx - r, cy - r, r * 2, r * 2);
  else if (input.catArt) {
    // the cat's own render on a warm disc (its plinth pose), not a generic face
    const g = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.2, cx, cy, r);
    g.addColorStop(0, '#ffe9c9');
    g.addColorStop(1, '#f6c48a');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    coverDraw(ctx, input.catArt, cx - r * 1.05, cy - r * 1.15, r * 2.1, r * 2.1);
  } else drawCatFace(ctx, cat, cx, cy, r);
  ctx.restore();

  // Stamp badge
  const stampText = (STAMP_LINE[run.stamp] ?? STAMP_LINE.clean).replace(/^\S+\s/, '');
  ctx.save();
  ctx.translate(W - 240, fy + fh);
  ctx.rotate(-0.12);
  ctx.strokeStyle = STAMP_COLOR[run.stamp] ?? '#f2c14e';
  ctx.lineWidth = 8;
  roundRect(ctx, -180, -48, 360, 96, 18);
  ctx.fillStyle = 'rgba(43,29,46,0.85)';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = STAMP_COLOR[run.stamp] ?? '#f2c14e';
  ctx.font = FONT(900, 40);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stampText, 0, 2);
  ctx.restore();

  // Score block
  let y = cy + r + 110;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = FONT(900, 120);
  ctx.fillText(formatThousands(run.score), W / 2, y);
  y += 64;
  ctx.font = FONT(700, 44);
  ctx.fillStyle = '#ffcf5c';
  ctx.fillText(run.rank, W / 2, y);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  // the story's case file has the combo / seen tiles: the line would only repeat them
  if (!story) {
    y += 60;
    ctx.font = FONT(600, 34);
    ctx.fillText(`×${run.maxCombo} combo · ${seenText(run.seenCount, run.stamp)} · ${run.targets}/3 targets`, W / 2, y);
  }
  y += 66;
  ctx.font = FONT(400, 48);
  ctx.fillText(run.timeline && run.timeline.trim() ? run.timeline.trim() : emojiTimeline(run, play), W / 2, y);

  if (story) drawStoryLower(ctx, input, y + STORY_GAP, H - STORY_BOTTOM_MARGIN);

  // Call to action
  ctx.font = FONT(800, 38);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`beat ${cat.name || 'my cat'} → ${input.link.replace(/^https?:\/\//, '')}`, W / 2, H - 60);
  return c;
}

/** Story card (1080 × 1920) geometry: the freeze-frame is shorter than 900 px so the case file gets its own band. */
export const STORY_FREEZE_H = 720;
const STORY_GAP = 40;
const STORY_BOTTOM_MARGIN = 110;
const ROW_H = 52;
const TILE_H = 130;

/** A vertical band of the story card, in canvas px (y0 inclusive top, y1 bottom). */
export interface Band {
  name: string;
  y0: number;
  y1: number;
}

/**
 * Round 3 (QA): the tiles and "Your cat next?" were drawn over the checklist. The case file is laid out as separate
 * bands, top to bottom: header, Must-Wreck list (as many rows as fit), tiles, the dare. `rows` = targets to list.
 */
export function storyLowerLayout(top: number, bottom: number, rows: number): { bands: Band[]; rows: number } {
  const header: Band = { name: 'header', y0: top + 20, y1: top + 130 };
  const dare: Band = { name: 'dare', y0: bottom - 80, y1: bottom - 20 };
  const tiles: Band = { name: 'tiles', y0: dare.y0 - 24 - TILE_H, y1: dare.y0 - 24 };
  const listTop = header.y1 + 16;
  const fit = Math.max(0, Math.floor((tiles.y0 - 20 - listTop) / ROW_H));
  const n = Math.max(0, Math.min(rows, fit));
  const list: Band = { name: 'list', y0: listTop, y1: listTop + n * ROW_H };
  return { bands: [header, list, tiles, dare], rows: n };
}

/** Every band of the story card top to bottom (title, picture, score block, case file bands, call to action). */
export function storyBands(rows = 3): Band[] {
  const H = STORY_CARD.h;
  const fy = 130;
  const insetBottom = fy + STORY_FREEZE_H + 110 + 8;
  const scoreTop = insetBottom + 10;
  const timelineBase = fy + STORY_FREEZE_H + 110 + 110 + 64 + 66;
  const lower = storyLowerLayout(timelineBase + STORY_GAP, H - STORY_BOTTOM_MARGIN, rows);
  return [
    { name: 'title', y0: 40, y1: 100 },
    { name: 'picture', y0: fy, y1: insetBottom },
    { name: 'score', y0: scoreTop, y1: timelineBase + 14 },
    ...lower.bands,
    { name: 'cta', y0: H - 95, y1: H - 50 },
  ];
}

/**
 * Round 2 (QA): the story card's lower half was empty. The rap: what got wrecked (the Must-Wreck list, stamped),
 * the run's biggest numbers as tiles, and the dare, between `top` and `bottom`.
 */
function drawStoryLower(ctx: CanvasRenderingContext2D, input: ResultCardInput, top: number, bottom: number): void {
  const { run, play, cat } = input;
  const W = ctx.canvas.width;
  const x = 60;
  const w = W - 120;
  const h = Math.max(200, bottom - top);
  const targets = play.room.props.map((p, i) => ({ p, i })).filter((t) => t.p.target);
  const lay = storyLowerLayout(top, top + h, targets.length);
  const [header, list, tilesBand, dare] = lay.bands;
  ctx.save();
  roundRect(ctx, x, top, w, h, 36);
  ctx.fillStyle = '#fff3dc';
  ctx.fill();
  // ruled paper under the list only
  ctx.clip();
  ctx.strokeStyle = 'rgba(159,211,255,0.45)';
  ctx.lineWidth = 2;
  for (let ly = list.y0 + ROW_H; ly <= list.y1; ly += ROW_H) {
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ctx.stroke();
  }
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#c46a2a';
  ctx.font = FONT(900, 34);
  ctx.fillText('CASE FILE', x + 44, header.y0 + 36);
  ctx.fillStyle = '#2a1a22';
  ctx.font = FONT(800, 40);
  ctx.fillText(`${cat.name || 'This cat'}: ${run.rank}`.slice(0, 40), x + 44, header.y0 + 94);

  // Must-Wreck list (✓ wrecked, ○ still standing), one row per band slot
  const wrecked = new Set<number>();
  for (const e of run.events) if (e.t === 'target') wrecked.add(e.prop);
  ctx.font = FONT(700, 34);
  targets.slice(0, lay.rows).forEach((t, k) => {
    const base = list.y0 + k * ROW_H + 38;
    const done = wrecked.has(t.i);
    ctx.fillStyle = done ? '#3fbf6a' : 'rgba(42,26,34,0.45)';
    ctx.fillText(done ? '✓' : '○', x + 44, base);
    ctx.fillStyle = done ? '#2a1a22' : 'rgba(42,26,34,0.55)';
    const name = propKind(t.p.kind)?.name ?? 'Something';
    ctx.fillText(done ? name : `${name} (still standing)`, x + 96, base);
  });

  // three tiles: combo, seen, crashes
  const crashes = run.events.filter((e) => e.t === 'break' || e.t === 'spill').length;
  const tiles: [string, string][] = [
    [`×${run.maxCombo}`, 'best combo'],
    [String(run.seenCount), run.seenCount === 1 ? 'time seen' : 'times seen'],
    [String(crashes), crashes === 1 ? 'crash' : 'crashes'],
  ];
  const tw = (w - 88 - 2 * 24) / 3;
  const ty = tilesBand.y0;
  const th = tilesBand.y1 - tilesBand.y0;
  tiles.forEach(([big, small], i) => {
    const tx = x + 44 + i * (tw + 24);
    roundRect(ctx, tx, ty, tw, th, 24);
    ctx.fillStyle = '#2b1d2e';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffcf5c';
    ctx.font = FONT(900, 58);
    ctx.fillText(big, tx + tw / 2, ty + 70);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = FONT(600, 28);
    ctx.fillText(small, tx + tw / 2, ty + 110);
  });

  // the dare
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2a1a22';
  ctx.font = FONT(900, 44);
  ctx.fillText('Your cat next? 😼', W / 2, dare.y1 - 12);
}

/** PNG blob of the card, or null when canvas export fails. */
export function renderResultCard(input: ResultCardInput): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const c = drawResultCard(input);
      c.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
