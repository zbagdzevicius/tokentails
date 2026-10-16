/**
 * The `/yourcat` share card, "the gallery print" (docs/plans/yourcat-polish.md §9), drawn on a
 * canvas in the browser as a still of the S3 stage (R1-05, R2-07): the portrait alone in its gold
 * frame; under it, on the foot plate's ground line, the visitor's cat facing the Pink Paw cat's
 * leaning cream frame with one pixel heart above the gap between their heads; then the uppercase
 * title with a cream glow and one line.
 *
 * Why the browser: Web Share with files needs the PNG ready inside the tap's user activation, and the
 * brand faces exist only in the client. The avatar and the sprite come from the CDNs, which answer
 * `access-control-allow-origin: *`: they load with `crossOrigin = "anonymous"` and a `cors=1` query
 * (Safari must never reuse a copy cached without CORS, which would taint the canvas). Everything else
 * (`/logo/…`, `/landing/…`, `/yourcat/…`) is same-origin.
 *
 * Fonts only through `ttCanvasFont(role, size)` after `loadGameFonts()`; colours only from the design
 * tokens (no hex literals here); the paw is drawn, not an emoji. Pixel art (avatar, sprite) is drawn
 * nearest-neighbour at integer sizes; painted art (background, plate, logo, shelter cat, roundel)
 * keeps smoothing on.
 */
import { loadGameFonts, ttCanvasFont } from "@/components/typography";
import { GOLD, INK, NIGHT, STATES } from "@/design/tokens";
import { cardLayout, SPRITE_CELL, type CardFormat, type CardLayout, type CardText, type Rect } from "./cardLayout";
import { coverCrop } from "./pixelateReveal";
import { fnv1a } from "./pinkPawPick";

/** Same-origin card art. */
export const CARD_ART = {
  background: "/landing/card-bg.webp",
  foot: "/landing/plates/hub-night-near-v1.png",
  logo: "/logo/logo-text.webp",
  roundel: "/logo/shelters/pink-paw.webp",
} as const;

/** The sprite on the card: walk row 9, frame 3 (feet down, mid-stride), mirrored to face the shelter cat. */
export const CARD_SPRITE = { row: 9, frame: 3 } as const;

/**
 * The nebula is cover-cropped from 15% of its width, not centred: the centre crop put a bright
 * vertical band of the milky way behind the portrait.
 */
export const BACKGROUND_CROP_X = 0.15;

/** The title's glow, like the page's `.glow`: cream, blur 24 px, at 0.6 alpha. */
export const NAME_GLOW = { blur: 24, alpha: 0.6 } as const;

/** PetCat's 6 x 6 `PixelHeart`, as [x, y, w, h] cells. */
export const HEART_PIXELS: ReadonlyArray<readonly [number, number, number, number]> = [
  [1, 0, 1, 1],
  [4, 0, 1, 1],
  [0, 1, 2, 2],
  [4, 1, 2, 2],
  [2, 1, 2, 1],
  [0, 2, 6, 1],
  [1, 3, 4, 1],
  [2, 4, 2, 1],
];

export interface ShareCardInput {
  format: CardFormat;
  /** The strings for this variant (with the panel when `text.panel` is set). */
  text: CardText;
  /** The solo strings, used when the shelter art fails to load (the card is then drawn solo). */
  soloText?: CardText;
  avatarUrl: string | null;
  spriteImg: string;
  /** The shelter cat's same-origin card art (2:3); needed for the panel. */
  shelterImage?: string;
  /** The record id: the stars are seeded from it, so a card always renders the same. */
  seed: string;
}

/** The sprite sheet's frame size (48 px grid). */
export const SPRITE_FRAME = SPRITE_CELL;

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

const isRemote = (url: string) => /^https?:\/\//i.test(url);

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

/**
 * Loads an image for canvas drawing; null when it fails. Remote URLs (avatar, sprite) get
 * `crossOrigin` and `corsUrl`; same-origin paths load as they are.
 */
export function loadCardImage(url: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (isRemote(url)) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = corsUrl(url);
  });
}

// The same-origin art is fetched once per page view and shared by every variant.
const artCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadArt(url: string): Promise<HTMLImageElement | null> {
  let hit = artCache.get(url);
  if (!hit) {
    hit = loadCardImage(url);
    artCache.set(url, hit);
    // A failure is not cached forever: the next card tries again.
    void hit.then((img) => {
      if (!img) artCache.delete(url);
    });
  }
  return hit;
}

/**
 * Starts loading the card art (background, foot plate, logo, roundel; about 225 KB) and the faces.
 * Called once the upload body has left (S2 `sent`), so the first card is ready soon after `done`.
 */
export function preloadCardImages(): void {
  if (typeof document === "undefined") return;
  void loadGameFonts();
  Object.values(CARD_ART).forEach((url) => void loadArt(url));
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

/**
 * The Frame bevel (polish §2.6) on a canvas, inside the outer `rect`, at `scale`.
 * Gold, from outside in: 4 px gold-400, 4 px gold-shadow, a 2 px night-950 keyline, and a 2x2 px
 * cream highlight in each of the 3 top-left outer pixels. Cream (the shelter frame): 2 px cream,
 * 2 px muted, a 1 px night keyline.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, rect: Rect, scale: number, tone: "gold" | "cream" = "gold"): void {
  const bands: Array<[string, number]> =
    tone === "gold"
      ? [
          [GOLD[400], 4],
          [GOLD.shadow, 4],
          [NIGHT[950], 2],
        ]
      : [
          [INK.cream, 2],
          [INK.muted, 2],
          [NIGHT[950], 1],
        ];
  let inset = 0;
  for (const [colour, units] of bands) {
    const w = Math.max(1, Math.round(units * scale));
    ctx.fillStyle = colour;
    const x = rect.x + inset;
    const y = rect.y + inset;
    const fw = rect.w - inset * 2;
    const fh = rect.h - inset * 2;
    ctx.fillRect(x, y, fw, w);
    ctx.fillRect(x, y + fh - w, fw, w);
    ctx.fillRect(x, y, w, fh);
    ctx.fillRect(x + fw - w, y, w, fh);
    inset += w;
  }
  if (tone === "gold") {
    const px = Math.round(2 * scale);
    ctx.fillStyle = INK.cream;
    ctx.fillRect(rect.x, rect.y, px, px);
    ctx.fillRect(rect.x + px, rect.y, px, px);
    ctx.fillRect(rect.x, rect.y + px, px, px);
  }
}

/** The total bevel width of `drawFrame` at `scale`. */
export function frameWidth(scale: number, tone: "gold" | "cream" = "gold"): number {
  const units = tone === "gold" ? [4, 4, 2] : [2, 2, 1];
  return units.reduce((sum, u) => sum + Math.max(1, Math.round(u * scale)), 0);
}

/** A cell of the sprite sheet, nearest-neighbour, into `rect` (mirrored: facing left). */
function drawSpriteCell(ctx: CanvasRenderingContext2D, sheet: HTMLImageElement, row: number, frame: number, rect: Rect, mirror = false) {
  if (!mirror) {
    ctx.drawImage(sheet, frame * SPRITE_FRAME, row * SPRITE_FRAME, SPRITE_FRAME, SPRITE_FRAME, rect.x, rect.y, rect.w, rect.h);
    return;
  }
  ctx.save();
  ctx.translate(rect.x + rect.w, rect.y);
  ctx.scale(-1, 1);
  ctx.drawImage(sheet, frame * SPRITE_FRAME, row * SPRITE_FRAME, SPRITE_FRAME, SPRITE_FRAME, 0, 0, rect.w, rect.h);
  ctx.restore();
}

/** The pixel heart in `tt-pink` with a one-cell night keyline, filling `rect` (6 x 6 cells of `unit`). */
function drawPixelHeart(ctx: CanvasRenderingContext2D, rect: Rect, unit: number) {
  ctx.fillStyle = NIGHT[950];
  ctx.globalAlpha = 0.7;
  for (const [x, y, w, h] of HEART_PIXELS) {
    ctx.fillRect(rect.x + (x - 1) * unit, rect.y + (y - 1) * unit, (w + 2) * unit, (h + 2) * unit);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = STATES.pink;
  for (const [x, y, w, h] of HEART_PIXELS) {
    ctx.fillRect(rect.x + x * unit, rect.y + y * unit, w * unit, h * unit);
  }
}

/** A gold four-armed cross star (3 px arms). */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, arm: number) {
  ctx.fillRect(x - arm, y - 1, arm * 2 + 3, 3);
  ctx.fillRect(x, y - arm - 1, 3, arm * 2 + 3);
}

/** A stepped (one pixel per step at `unit`) oval shadow filling `rect`. */
function drawPixelShadow(ctx: CanvasRenderingContext2D, rect: Rect, unit: number) {
  const rows = Math.max(1, Math.round(rect.h / unit));
  for (let i = 0; i < rows; i++) {
    const t = rows === 1 ? 0 : Math.abs(i - (rows - 1) / 2) / ((rows - 1) / 2);
    const inset = Math.round(t * 3) * unit;
    ctx.fillRect(rect.x + inset, rect.y + i * unit, rect.w - inset * 2, unit);
  }
}

/**
 * `image` covering `rect`: a centre crop, or, with `fromX`, a crop whose left edge starts at that
 * fraction of the image width (clamped so it never runs past the right edge).
 */
function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, rect: Rect, fromX?: number) {
  const sw = image.naturalWidth || image.width;
  const crop = coverCrop(sw, image.naturalHeight || image.height, rect.w / rect.h);
  const x = fromX === undefined || crop.w >= sw ? crop.x : Math.min(sw - crop.w, Math.round(sw * fromX));
  ctx.drawImage(image, x, crop.y, crop.w, crop.h, rect.x, rect.y, rect.w, rect.h);
}

/** A `#rrggbb` token as `rgba(r, g, b, alpha)`. */
export function tokenRgba(token: string, alpha: number): string {
  const n = parseInt(token.replace("#", "").slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function smooth(ctx: CanvasRenderingContext2D, on: boolean) {
  ctx.imageSmoothingEnabled = on;
  if (on) ctx.imageSmoothingQuality = "high";
}

export interface CardImages {
  avatar: HTMLImageElement | null;
  sprite: HTMLImageElement | null;
  shelter: HTMLImageElement | null;
  background?: HTMLImageElement | null;
  foot?: HTMLImageElement | null;
  logo?: HTMLImageElement | null;
  roundel?: HTMLImageElement | null;
}

/**
 * Draws the card into `canvas` from already loaded images. Without the shelter art the card is drawn
 * solo with `soloText` (the same as a null gallery).
 */
export function drawShareCard(canvas: HTMLCanvasElement, input: ShareCardInput, images: CardImages): CardLayout {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas is not supported");
  const text = input.text.panel && !images.shelter ? (input.soloText ?? { ...input.text, panel: null }) : input.text;
  // The cat stands on the ground only beside an avatar (never twice); else it sits in the portrait box.
  const standing = !!(images.avatar && images.sprite);
  const layout = cardLayout({ format: input.format, text, standing }, (line, size) => {
    ctx.font = ttCanvasFont("title", size);
    return ctx.measureText(line).width;
  });
  canvas.width = layout.width;
  canvas.height = layout.height;
  const full = { x: 0, y: 0, w: layout.width, h: layout.height };

  // 1. The nebula, then the night scrim.
  ctx.fillStyle = NIGHT[900];
  ctx.fillRect(0, 0, layout.width, layout.height);
  smooth(ctx, true);
  if (images.background) drawCover(ctx, images.background, full, BACKGROUND_CROP_X);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = NIGHT[950];
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.globalAlpha = 1;

  // 2. Four gold cross stars, seeded from the record id, in the margins beside the frame.
  const random = seededRandom(input.seed || "yourcat");
  ctx.fillStyle = GOLD[400];
  const top = layout.logo.y + layout.logo.h + 20;
  const span = Math.max(1, layout.frame.y + layout.frame.h - top - 40);
  for (let i = 0; i < 4; i++) {
    const left = i % 2 === 0;
    const marginW = layout.frame.x - layout.safe.x - 30;
    const x = left
      ? layout.safe.x + 10 + Math.floor(random() * Math.max(1, marginW))
      : layout.frame.x + layout.frame.w + 20 + Math.floor(random() * Math.max(1, marginW));
    const y = top + Math.floor((i < 2 ? random() * 0.45 : 0.5 + random() * 0.25) * span);
    ctx.globalAlpha = 0.55 + random() * 0.4;
    drawStar(ctx, x, y, 6 + Math.floor(random() * 8));
  }
  ctx.globalAlpha = 1;

  // 3. The ground: a night fill from the plate's foot to the bottom edge, then the foot plate with
  //    its horizon on the ground line.
  ctx.fillStyle = NIGHT[950];
  ctx.fillRect(layout.groundFill.x, layout.groundFill.y, layout.groundFill.w, layout.groundFill.h);
  if (images.foot) drawCover(ctx, images.foot, layout.foot);

  // 4. The lockup, or the text wordmark when it failed.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const cx = layout.width / 2;
  if (images.logo) {
    ctx.drawImage(images.logo, layout.logo.x, layout.logo.y, layout.logo.w, layout.logo.h);
  } else {
    ctx.fillStyle = INK.cream;
    ctx.font = ttCanvasFont("hud", layout.wordmark.size);
    ctx.fillText(text.wordmark, cx, layout.wordmark.baseline, layout.wordmark.w);
  }

  // 5. The bevel frame and the avatar (nearest-neighbour, integer size), or sprite frame 0.
  ctx.fillStyle = NIGHT[800];
  ctx.fillRect(layout.avatar.x, layout.avatar.y, layout.avatar.w, layout.avatar.h);
  smooth(ctx, false);
  if (images.avatar) {
    ctx.drawImage(images.avatar, layout.avatar.x, layout.avatar.y, layout.avatar.w, layout.avatar.h);
  } else if (images.sprite) {
    drawSpriteCell(ctx, images.sprite, 0, 0, layout.stand);
  }
  drawFrame(ctx, layout.frame, layout.frameScale);

  // 6. The shelter cat's cream frame, standing on the ground and leaning: a soft night shadow, the
  //    painted art (smoothing on) under a 25% night wash, the roundel.
  let meeting = false;
  if (layout.panel && layout.panelImage && layout.panelPivot && images.shelter && text.panel) {
    meeting = true;
    const art = layout.panelImage;
    ctx.save();
    ctx.translate(layout.panelPivot.x, layout.panelPivot.y);
    ctx.rotate((layout.panelAngle * Math.PI) / 180);
    ctx.translate(-layout.panelPivot.x, -layout.panelPivot.y);
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = NIGHT[950];
    const lift = Math.round(layout.panel.w / 38);
    ctx.fillRect(layout.panel.x + lift, layout.panel.y + lift, layout.panel.w, layout.panel.h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = NIGHT[900];
    ctx.fillRect(art.x, art.y, art.w, art.h);
    smooth(ctx, true);
    drawCover(ctx, images.shelter, art);
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = NIGHT[900];
    ctx.fillRect(art.x, art.y, art.w, art.h);
    ctx.globalAlpha = 1;
    drawFrame(ctx, layout.panel, 1.6, "cream");
    if (layout.roundel && images.roundel) {
      ctx.drawImage(images.roundel, layout.roundel.x, layout.roundel.y, layout.roundel.w, layout.roundel.h);
    }
    ctx.restore();
  }

  // 7. The visitor's cat on the ground, facing the shelter cat, with its shadow (only beside an
  //    avatar: never twice), and one pixel heart above the gap between their heads.
  if (standing && images.sprite) {
    smooth(ctx, false);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = NIGHT[950];
    drawPixelShadow(ctx, layout.shadow, layout.spriteScale);
    ctx.globalAlpha = 1;
    drawSpriteCell(ctx, images.sprite, CARD_SPRITE.row, CARD_SPRITE.frame, layout.sprite, layout.spriteMirror);
    if (meeting && layout.heart) drawPixelHeart(ctx, layout.heart, layout.heartUnit);
  }

  // 8. The uppercase title with a cream glow, and the one line under it.
  smooth(ctx, true);
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD[400];
  ctx.font = ttCanvasFont("title", layout.name.size);
  ctx.save();
  ctx.shadowColor = tokenRgba(INK.cream, NAME_GLOW.alpha);
  ctx.shadowBlur = NAME_GLOW.blur;
  ctx.fillText(layout.name.text, cx, layout.name.baseline, layout.name.w);
  ctx.restore();
  ctx.fillStyle = INK.cream;
  ctx.font = ttCanvasFont("caption", layout.subline.size);
  ctx.fillText(text.subline, cx, layout.subline.baseline, layout.subline.w);

  // 9. The link line and the drawn paw are the watermark.
  ctx.font = ttCanvasFont("hud", layout.link.size);
  const linkWidth = ctx.measureText(text.link).width;
  const pawScale = layout.link.size / 110;
  const pawWidth = 100 * pawScale;
  const gap = layout.link.size * 0.3;
  const start = cx - (linkWidth + pawWidth + gap) / 2;
  drawPaw(ctx, start + pawWidth / 2, layout.link.baseline - layout.link.size * 0.38, pawScale, GOLD[400]);
  ctx.fillStyle = GOLD[400];
  ctx.textAlign = "left";
  ctx.fillText(text.link, start + pawWidth + gap, layout.link.baseline);
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
  const panel = !!input.text.panel;
  const [avatar, sprite, shelter, background, foot, logo, roundel] = await Promise.all([
    loadCardImage(input.avatarUrl),
    loadCardImage(input.spriteImg),
    panel ? loadCardImage(input.shelterImage) : Promise.resolve(null),
    loadArt(CARD_ART.background),
    loadArt(CARD_ART.foot),
    loadArt(CARD_ART.logo),
    panel ? loadArt(CARD_ART.roundel) : Promise.resolve(null),
  ]);
  const canvas = document.createElement("canvas");
  drawShareCard(canvas, input, { avatar, sprite, shelter, background, foot, logo, roundel });
  return canvasToBlob(canvas);
}

/** Warms the brand faces while S2 runs, so the first card draws without waiting. */
export function warmCardFonts(): void {
  if (typeof document !== "undefined") void loadGameFonts();
}
