/**
 * Image cards beyond the result card (GDD 7.4, 8, 9.2): Rap Sheet mugshot 1080 x 1920 (with the Club gold stamps
 * and an animated variant), cat card 1080 x 1350 (plinth portrait), cameo card 1080 x 1350, and the carousel's
 * photo and "Your cat next?" slides. Client canvas only; text comes from card-text.ts.
 */
import { rgb888, type CardInput, type CatSpec, type RapSheetSummary, type WeeklySummary } from '../types';
import { drawPaw } from './clip/compose';
import {
  PATTERN_LABEL,
  bareUrl,
  cameoLine,
  catName,
  fitText,
  makeYourCatLine,
  mostWantedLine,
  rapSheetStats,
  wantedFor,
  yourCatNextLine,
  type CameoWhere,
  type Measurer,
} from './card-text';
import { formatThousands } from './emoji-card';
import { FONT, coverDraw, drawCatFace, hex, renderResultCard, roundRect } from './image-card';

export const RAPSHEET_CARD = { w: 1080, h: 1920 } as const;
export const CAT_CARD = { w: 1080, h: 1350 } as const;
export const CAMEO_CARD = { w: 1080, h: 1350 } as const;
export const CAROUSEL_SLIDE = { w: 1080, h: 1350 } as const;

type Img = CanvasImageSource & { width: number; height: number };

function canvasOf(w: number, h: number, c?: HTMLCanvasElement): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const cv = c ?? document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('cards: 2D canvas unavailable');
  return { c: cv, ctx };
}

function measurer(ctx: CanvasRenderingContext2D, weight: number): Measurer {
  return (text, px) => {
    ctx.font = FONT(weight, px);
    return ctx.measureText(text).width;
  };
}

/** Centred, fitted text block; returns the y below it. */
function textBlock(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, maxLines: number, startPx: number, minPx: number, weight: number, color: string): number {
  const fit = fitText(measurer(ctx, weight), text, maxW, maxLines, startPx, minPx);
  ctx.font = FONT(weight, fit.px);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const lh = fit.px * 1.18;
  fit.lines.forEach((l, i) => ctx.fillText(l, cx, y + fit.px + i * lh));
  return y + fit.px + (fit.lines.length - 1) * lh + fit.px * 0.4;
}

function background(ctx: CanvasRenderingContext2D, w: number, h: number, top = '#3a2540', bottom = '#2b1d2e'): void {
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, top);
  bg.addColorStop(1, bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
}

/** Portrait (render.renderCatPortrait), else the photo, else the flat toon face in the cat's colours. */
function catPicture(ctx: CanvasRenderingContext2D, cat: CatSpec, portrait: Img | null | undefined, photo: Img | null | undefined, x: number, y: number, w: number, h: number): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, 32);
  ctx.clip();
  if (portrait) coverDraw(ctx, portrait, x, y, w, h);
  else if (photo) coverDraw(ctx, photo, x, y, w, h);
  else {
    ctx.fillStyle = '#ffe9c9';
    ctx.fillRect(x, y, w, h);
    const r = Math.min(w, h) * 0.36;
    drawCatFace(ctx, cat, x + w / 2, y + h / 2, r);
  }
  ctx.restore();
}

function footer(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
  const y = h - 70;
  ctx.save();
  ctx.globalAlpha = 0.95;
  drawPaw(ctx, w / 2 - 40, y - 150, 80, '#ffcf5c');
  ctx.restore();
  textBlock(ctx, text, w / 2, y - 60, w - 120, 1, 44, 26, 800, '#ffffff');
}

// ---------------------------------------------------------------------------------------------
// Rap Sheet mugshot
// ---------------------------------------------------------------------------------------------

export interface RapSheetInput {
  cat: CatSpec;
  portrait?: Img | null;
  photo?: Img | null;
  summary: RapSheetSummary;
  week?: WeeklySummary | null;
  link: string;
  club?: boolean;
}

/** Stamp thump-in for the animated card: 0..1 scale/alpha of stamp `i` at time `t` seconds (3 s loop). */
export function stampAnim(i: number, t: number): { scale: number; alpha: number } {
  const start = 0.35 + i * 0.35;
  const u = (t % 3) - start;
  if (u < 0) return { scale: 0, alpha: 0 };
  if (u < 0.18) {
    const k = u / 0.18;
    return { scale: 1.6 - 0.6 * k, alpha: k };
  }
  if (t % 3 > 2.7) return { scale: 1, alpha: Math.max(0, (3 - (t % 3)) / 0.3) };
  return { scale: 1, alpha: 1 };
}

/** Draw the Rap Sheet mugshot card. `t` (seconds) animates the Club stamps; undefined = all stamps shown. */
export function drawRapSheetCard(input: RapSheetInput, canvas?: HTMLCanvasElement, t?: number): HTMLCanvasElement {
  const { w: W, h: H } = RAPSHEET_CARD;
  const { c, ctx } = canvasOf(W, H, canvas);
  const { cat, summary } = input;
  background(ctx, W, H, '#2f2236', '#1d1422');

  textBlock(ctx, 'BAD CAT DAILY · RAP SHEET', W / 2, 60, W - 120, 1, 44, 28, 900, '#ffcf5c');

  // mugshot panel with the height chart behind (the portrait renders its own chart; this frames it)
  const px = 90;
  const py = 170;
  const pw = W - 180;
  const ph = 1000;
  ctx.fillStyle = '#d8d2c4';
  roundRect(ctx, px, py, pw, ph, 28);
  ctx.fill();
  ctx.save();
  roundRect(ctx, px, py, pw, ph, 28);
  ctx.clip();
  ctx.strokeStyle = 'rgba(40,30,40,0.35)';
  ctx.lineWidth = 3;
  ctx.font = FONT(700, 26);
  ctx.fillStyle = 'rgba(40,30,40,0.55)';
  ctx.textAlign = 'left';
  for (let i = 0; i <= 10; i++) {
    const y = py + 60 + i * 90;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(px + (i % 2 ? 60 : 110), y);
    ctx.stroke();
    if (i % 2 === 0) ctx.fillText(`${(10 - i) * 3} in`, px + 120, y + 9);
  }
  ctx.restore();
  if (input.portrait || input.photo) catPicture(ctx, cat, input.portrait, input.photo, px + 40, py + 40, pw - 80, ph - 80);
  else {
    ctx.save();
    roundRect(ctx, px, py, pw, ph, 28);
    ctx.clip();
    drawCatFace(ctx, cat, W / 2, py + ph * 0.55, 300);
    ctx.restore();
  }
  // name board under the chin
  const by = py + ph - 170;
  ctx.fillStyle = '#1b1020';
  roundRect(ctx, W / 2 - 300, by, 600, 130, 14);
  ctx.fill();
  textBlock(ctx, catName(cat).toUpperCase(), W / 2, by + 12, 560, 1, 64, 30, 900, '#ffffff');
  ctx.font = FONT(700, 26);
  ctx.fillStyle = '#ffcf5c';
  ctx.textAlign = 'center';
  ctx.fillText(`CASE #${formatThousands(summary.total)}`, W / 2, by + 118);

  let y = py + ph + 40;
  y = textBlock(ctx, wantedFor(summary), W / 2, y, W - 140, 3, 54, 30, 900, '#ffffff');
  y = textBlock(ctx, summary.rank, W / 2, y + 10, W - 160, 1, 50, 28, 800, '#ffcf5c');
  y = textBlock(ctx, rapSheetStats(summary), W / 2, y + 6, W - 160, 2, 36, 24, 600, 'rgba(255,255,255,0.85)');
  const mw = mostWantedLine(input.week);
  if (mw) y = textBlock(ctx, mw, W / 2, y + 6, W - 160, 2, 36, 24, 800, '#ff9fbf');

  // Club gold stamps: one per top crime, rotated, across the mugshot's top corners
  if (input.club) {
    const crimes = summary.topCrimes.slice(0, 3);
    crimes.forEach((cr, i) => {
      const a = t === undefined ? { scale: 1, alpha: 1 } : stampAnim(i, t);
      if (a.alpha <= 0) return;
      const sx = px + 170 + i * 280;
      const sy = py + 120 + (i % 2) * 70;
      ctx.save();
      ctx.globalAlpha = a.alpha;
      ctx.translate(sx, sy);
      ctx.rotate(-0.18 + i * 0.16);
      ctx.scale(a.scale, a.scale);
      ctx.strokeStyle = '#fff3c4';
      ctx.fillStyle = 'rgba(232,185,49,0.92)';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 0, 105, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowColor = 'transparent';
      ctx.font = FONT(900, 30);
      ctx.fillStyle = '#3a2540';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cr.icon || '★', 0, -34);
      ctx.fillText(formatThousands(cr.count), 0, 8);
      ctx.font = FONT(800, 20);
      ctx.fillText('GUILTY', 0, 46);
      ctx.restore();
    });
  }
  footer(ctx, W, H, `Make your cat: ${bareUrl(input.link)}`);
  return c;
}

// ---------------------------------------------------------------------------------------------
// Cat card and cameo card
// ---------------------------------------------------------------------------------------------

export function drawCatCard(input: { cat: CatSpec; portrait?: Img | null; link: string }, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const { w: W, h: H } = CAT_CARD;
  const { c, ctx } = canvasOf(W, H, canvas);
  const { cat } = input;
  background(ctx, W, H);
  textBlock(ctx, 'BAD CAT DAILY', W / 2, 50, W - 120, 1, 42, 26, 900, '#ffcf5c');
  catPicture(ctx, cat, input.portrait, null, 90, 130, W - 180, 820);
  // collar-coloured name ribbon
  const ry = 900;
  ctx.fillStyle = hex(rgb888(cat.base));
  roundRect(ctx, W / 2 - 330, ry, 660, 120, 60);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 8;
  textBlock(ctx, catName(cat), W / 2, ry + 18, 600, 1, 72, 30, 900, '#ffffff');
  ctx.restore();
  textBlock(ctx, catCardLine(cat), W / 2, ry + 140, W - 160, 1, 38, 24, 700, 'rgba(255,255,255,0.85)');
  footer(ctx, W, H, makeYourCatLine(input.link));
  return c;
}

export function drawCameoCard(input: { cat: CatSpec; portrait?: Img | null; dayLabel: string; where: CameoWhere; link: string }, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const { w: W, h: H } = CAMEO_CARD;
  const { c, ctx } = canvasOf(W, H, canvas);
  const { cat } = input;
  background(ctx, W, H, '#25344a', '#1b1020');
  textBlock(ctx, 'NOW APPEARING', W / 2, 50, W - 120, 1, 46, 26, 900, '#ffcf5c');
  // fridge door with a magnet-framed polaroid
  ctx.fillStyle = '#eef1f2';
  roundRect(ctx, 120, 130, W - 240, 820, 40);
  ctx.fill();
  ctx.save();
  ctx.translate(W / 2, 520);
  ctx.rotate(-0.05);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 18;
  ctx.fillRect(-300, -330, 600, 690);
  ctx.shadowColor = 'transparent';
  catPicture(ctx, cat, input.portrait, null, -270, -300, 540, 540);
  ctx.font = FONT(800, 46);
  ctx.fillStyle = '#2b1d2e';
  ctx.textAlign = 'center';
  ctx.fillText(catName(cat), 0, 320);
  ctx.fillStyle = '#e25b5b';
  ctx.beginPath();
  ctx.arc(0, -350, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  textBlock(ctx, cameoLine(cat, input.dayLabel, input.where), W / 2, 980, W - 140, 2, 50, 28, 800, '#ffffff');
  footer(ctx, W, H, bareUrl(input.link));
  return c;
}

// ---------------------------------------------------------------------------------------------
// Carousel slides
// ---------------------------------------------------------------------------------------------

/** Slide 1: the real cat photo, full bleed, "Rate how bad {cat} is 1–10". */
export function drawPhotoSlide(photo: Img, caption: string, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const { w: W, h: H } = CAROUSEL_SLIDE;
  const { c, ctx } = canvasOf(W, H, canvas);
  coverDraw(ctx, photo, 0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, 360);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 360);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 10;
  textBlock(ctx, caption, W / 2, 150, W - 160, 2, 70, 36, 900, '#ffffff');
  ctx.restore();
  return c;
}

/** Any card fitted into a 1080 x 1350 slide (a 1080 x 1920 mugshot is contained on the card background). */
export function drawFittedSlide(img: Img, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const { w: W, h: H } = CAROUSEL_SLIDE;
  const { c, ctx } = canvasOf(W, H, canvas);
  background(ctx, W, H);
  const s = Math.min(W / img.width, H / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return c;
}

/** Last slide: "Your cat next? {short URL}". */
export function drawNextSlide(shortUrl: string, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const { w: W, h: H } = CAROUSEL_SLIDE;
  const { c, ctx } = canvasOf(W, H, canvas);
  background(ctx, W, H, '#ff8fa3', '#3a2540');
  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 9; i++) drawPaw(ctx, ((i * 337) % (W - 200)) + 40, ((i * 523) % (H - 260)) + 60, 160 + (i % 3) * 30, '#ffffff');
  ctx.restore();
  textBlock(ctx, 'Your cat next?', W / 2, 470, W - 140, 1, 120, 60, 900, '#ffffff');
  textBlock(ctx, bareUrl(shortUrl), W / 2, 640, W - 140, 1, 64, 30, 800, '#ffcf5c');
  textBlock(ctx, 'Snap your cat. Wreck a kitchen. Free, no app.', W / 2, 760, W - 160, 2, 44, 28, 600, 'rgba(255,255,255,0.9)');
  void yourCatNextLine;
  return c;
}

// ---------------------------------------------------------------------------------------------
// Blobs
// ---------------------------------------------------------------------------------------------

export function canvasBlob(c: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      c.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/** Every image card (GDD 7.4); null when the canvas is unavailable. */
export async function renderCard(input: CardInput): Promise<Blob | null> {
  try {
    switch (input.kind) {
      case 'result':
      case 'story':
        return await renderResultCard({ ...input, format: input.kind });
      case 'rapsheet':
        return await canvasBlob(drawRapSheetCard(input));
      case 'cat':
        return await canvasBlob(drawCatCard(input));
      case 'cameo':
        return await canvasBlob(drawCameoCard(input));
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Decode a Blob into something drawable (createImageBitmap, else an <img>). */
export async function blobImage(b: Blob): Promise<Img | null> {
  try {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(b);
  } catch {
    /* fall back */
  }
  if (typeof Image === 'undefined') return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(b);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Carousel (TikTok photo mode / IG): real photo -> cat card -> freeze-frame -> mugshot -> "Your cat next?".
 * `cards` are the middle slides in order (cat card, result card, Rap Sheet); each is fitted to 1080 x 1350.
 */
export async function renderCarousel(input: { cards: Blob[]; photo?: Blob | null; shortUrl: string; catName?: string }): Promise<Blob[]> {
  const out: Blob[] = [];
  try {
    if (input.photo) {
      const img = await blobImage(input.photo);
      if (img) {
        const b = await canvasBlob(drawPhotoSlide(img, `Rate how bad ${(input.catName || '').trim() || 'my cat'} is 1–10`), 'image/jpeg', 0.9);
        if (b) out.push(b);
      }
    }
    for (const card of input.cards) {
      const img = await blobImage(card);
      if (!img) continue;
      const b = await canvasBlob(drawFittedSlide(img), 'image/jpeg', 0.9);
      if (b) out.push(b);
    }
    const last = await canvasBlob(drawNextSlide(input.shortUrl), 'image/jpeg', 0.9);
    if (last) out.push(last);
  } catch {
    /* return what was made */
  }
  return out;
}

/** "Tabby · certified menace"; a body other than the default says so ("Tabby · absolute unit"). Round 2: "normal". */
export function catCardLine(cat: Pick<CatSpec, 'pattern' | 'body'>): string {
  const pattern = PATTERN_LABEL[cat.pattern] ?? cat.pattern;
  const BODY: Record<string, string> = { chonk: 'absolute unit', slim: 'noodle', kitten: 'tiny terror' };
  const body = BODY[cat.body as string];
  return [pattern, body, 'certified menace'].filter(Boolean).join(' · ');
}
