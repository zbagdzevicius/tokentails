/**
 * The `/yourcat` share card, drawn on a canvas in the browser (docs/plans/yourcat-v2.md §5.1–5.3).
 *
 * Why the browser: Web Share with files needs the PNG ready inside the tap's user activation, and the
 * brand faces exist only in the client. Both CDNs answer `access-control-allow-origin: *`, so every
 * remote image is loaded with `crossOrigin = "anonymous"` and a `cors=1` query (Safari must never
 * reuse a copy cached without CORS, which would taint the canvas). Pink Paw art is same-origin.
 *
 * Fonts only through `ttCanvasFont(role, size)` after `loadGameFonts()`; colours only from the design
 * tokens; the paw is drawn, not an emoji.
 */
import { loadGameFonts, ttCanvasFont } from "@/components/typography";
import { GOLD, INK, NIGHT } from "@/design/tokens";
import { cardLayout, type CardFormat, type CardInput, type CardLayout, type Rect } from "./cardLayout";
import { CARD_TEXT } from "./copy";
import { fnv1a } from "./pinkPawPick";

export interface ShareCardInput extends CardInput {
  avatarUrl: string | null;
  spriteImg: string;
  shelterImage?: string;
  /** The record id: the star field is seeded from it, so a card always renders the same. */
  seed: string;
}

/** The sprite sheet's frame size (48 px grid). */
export const SPRITE_FRAME = 48;

/** `tokentails-{slug}-{format}.png`. */
export function cardFileName(name: string, format: CardFormat): string {
  const slug =
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "cat";
  return `tokentails-${slug}-${format}.png`;
}

/** A remote image URL with the `cors=1` cache-buster; same-origin paths are left alone. */
export function corsUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}cors=1`;
}

/** A small seeded PRNG (mulberry32). */
export function seededRandom(seed: string): () => number {
  let a = fnv1a(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Loads an image for canvas drawing; null when it fails. */
export function loadCardImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = corsUrl(url);
  });
}

/** A paw print: one pad and four toes, centred on (x, y), about 100 px across at scale 1. */
function drawPaw(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, fill: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(0, 22, 34, 28, 0, 0, Math.PI * 2);
  for (const [tx, ty] of [
    [-38, -14],
    [-14, -40],
    [14, -40],
    [38, -14],
  ]) {
    ctx.moveTo(tx + 13, ty);
    ctx.ellipse(tx, ty, 13, 16, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: Rect, width: number) {
  ctx.fillStyle = GOLD[500];
  ctx.fillRect(frame.x, frame.y, frame.w, width);
  ctx.fillRect(frame.x, frame.y + frame.h - width, frame.w, width);
  ctx.fillRect(frame.x, frame.y, width, frame.h);
  ctx.fillRect(frame.x + frame.w - width, frame.y, width, frame.h);
}

/** Frame 0 of the sprite sheet, scaled with nearest-neighbour into `rect` (centred, square). */
function drawSpriteFrame(ctx: CanvasRenderingContext2D, sheet: HTMLImageElement, rect: Rect) {
  const side = Math.min(rect.w, rect.h);
  ctx.drawImage(
    sheet,
    0,
    0,
    SPRITE_FRAME,
    SPRITE_FRAME,
    rect.x + (rect.w - side) / 2,
    rect.y + (rect.h - side) / 2,
    side,
    side,
  );
}

export interface CardImages {
  avatar: HTMLImageElement | null;
  sprite: HTMLImageElement | null;
  shelter: HTMLImageElement | null;
}

/** Draws the card into `canvas` from already loaded images. */
export function drawShareCard(canvas: HTMLCanvasElement, input: ShareCardInput, images: CardImages): CardLayout {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas is not supported");
  const layout = cardLayout(input, (text, size) => {
    ctx.font = ttCanvasFont("title", size);
    return ctx.measureText(text).width;
  });
  canvas.width = layout.width;
  canvas.height = layout.height;

  const bg = ctx.createLinearGradient(0, 0, 0, layout.height);
  bg.addColorStop(0, NIGHT[900]);
  bg.addColorStop(1, NIGHT[700]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, layout.width, layout.height);

  // 40 small stars, placed by a PRNG seeded from the record id (the same card on every render).
  const random = seededRandom(input.seed || "yourcat");
  ctx.fillStyle = INK.cream;
  for (let i = 0; i < 40; i++) {
    const size = 2 + Math.floor(random() * 3);
    ctx.globalAlpha = 0.2 + random() * 0.3;
    ctx.fillRect(Math.floor(random() * layout.width), Math.floor(random() * layout.height), size, size);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const cx = layout.width / 2;

  ctx.fillStyle = INK.lilac;
  ctx.font = ttCanvasFont("hud", layout.wordmark.size);
  ctx.fillText(CARD_TEXT.wordmark, cx, layout.wordmark.baseline, layout.wordmark.w);

  // The avatar (pixel portrait), or the sprite's frame 0 at 12x when there is none yet.
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = NIGHT[800];
  ctx.fillRect(layout.avatar.x, layout.avatar.y, layout.avatar.w, layout.avatar.h);
  if (images.avatar) {
    ctx.drawImage(images.avatar, layout.avatar.x, layout.avatar.y, layout.avatar.w, layout.avatar.h);
  } else if (images.sprite) {
    const side = SPRITE_FRAME * 12;
    const inset = { x: layout.avatar.x + (layout.avatar.w - side) / 2, y: layout.avatar.y + (layout.avatar.h - side) / 2, w: side, h: side };
    drawSpriteFrame(ctx, images.sprite, inset);
  }
  drawFrame(ctx, layout.frame, 8);
  if (images.avatar && images.sprite) drawSpriteFrame(ctx, images.sprite, layout.sprite);
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = GOLD[400];
  ctx.font = ttCanvasFont("title", layout.name.size);
  ctx.fillText(layout.name.text, cx, layout.name.baseline, layout.name.w);

  ctx.fillStyle = INK.cream;
  ctx.font = ttCanvasFont("caption", layout.subline.size);
  ctx.fillText(CARD_TEXT.subline, cx, layout.subline.baseline, layout.subline.w);

  if (layout.panel && layout.panelText) {
    const panel = layout.panel;
    ctx.fillStyle = NIGHT[800];
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
    ctx.strokeStyle = GOLD[500];
    ctx.lineWidth = 4;
    ctx.strokeRect(panel.x + 2, panel.y + 2, panel.w - 4, panel.h - 4);
    if (layout.panelImage && images.shelter) {
      ctx.imageSmoothingEnabled = false;
      const img = layout.panelImage;
      ctx.drawImage(images.shelter, img.x, img.y, img.w, img.h);
      ctx.imageSmoothingEnabled = true;
    }
    ctx.textAlign = "left";
    const { meets, shelter, from } = layout.panelText;
    ctx.fillStyle = INK.lilac;
    ctx.font = ttCanvasFont("hud", meets.size);
    ctx.fillText(CARD_TEXT.meets, meets.x, meets.baseline, meets.w);
    ctx.fillStyle = GOLD[400];
    ctx.font = ttCanvasFont("title", shelter.size);
    ctx.fillText(shelter.text, shelter.x, shelter.baseline, shelter.w);
    ctx.fillStyle = INK.lilac;
    ctx.font = ttCanvasFont("hud", from.size);
    ctx.fillText(CARD_TEXT.fromPinkPaw, from.x, from.baseline, from.w);
    ctx.textAlign = "center";
  }

  // The link line and the drawn paw are the watermark.
  ctx.font = ttCanvasFont("hud", layout.link.size);
  const linkWidth = ctx.measureText(CARD_TEXT.link).width;
  const pawScale = layout.link.size / 110;
  const pawWidth = 100 * pawScale;
  const gap = layout.link.size * 0.3;
  const start = cx - (linkWidth + pawWidth + gap) / 2;
  drawPaw(ctx, start + pawWidth / 2, layout.link.baseline - layout.link.size * 0.38, pawScale, GOLD[400]);
  ctx.fillStyle = GOLD[400];
  ctx.textAlign = "left";
  ctx.fillText(CARD_TEXT.link, start + pawWidth + gap, layout.link.baseline);
  ctx.textAlign = "center";
  return layout;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned no blob"))), "image/png");
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Renders the card to a PNG. Rejects when the canvas cannot export (tainted canvas, very old
 * browser): the page then hides "Share" and "Download" and keeps "Copy link".
 */
export async function renderShareCard(input: ShareCardInput): Promise<Blob> {
  await loadGameFonts();
  const [avatar, sprite, shelter] = await Promise.all([
    loadCardImage(input.avatarUrl),
    loadCardImage(input.spriteImg),
    input.hasShelterCat ? loadCardImage(input.shelterImage) : Promise.resolve(null),
  ]);
  const canvas = document.createElement("canvas");
  drawShareCard(canvas, input, { avatar, sprite, shelter });
  return canvasToBlob(canvas);
}

/** Warms the brand faces while S2 runs, so the first card draws without waiting. */
export function warmCardFonts(): void {
  if (typeof document !== "undefined") void loadGameFonts();
}
