/**
 * Share card layout, "the gallery print" (docs/plans/yourcat-polish.md §9.2), recomposed as a still
 * of the S3 stage (R1-05) with the meeting moved below the portrait (R2-07): the pixel portrait alone
 * in its gold frame; under it a ground line (the foot plate's horizon) where the visitor's cat (8x
 * story, 6x post) and the Pink Paw cat's cream frame (leaning -4°) stand facing each other, one pixel
 * heart above the gap between their heads; then the uppercase title and one line. Pure, so it is
 * testable without a canvas; the strings arrive ready-made in `CardText` (copy stays in copy.ts).
 *
 * Story 1080 x 1920 (safe area x 60–1020, y 220–1680: stories cover the top and bottom) and post
 * 1080 x 1350 (safe area x 60–1020, y 60–1290). Text rects span the glyph box around the baseline
 * (ascent 0.8 x size above it, descent 0.2 x size below it).
 *
 * Invariants (pinned by `__test__/yourcat-card-layout.test.ts`): every rect but the background foot
 * plate and ground fill is inside the safe area (the leaning shelter frame by its rotated bounds), the
 * avatar is an integer multiple of 96 (672 story, 576 post), the shelter art is 2:3, the logo keeps
 * the lockup's 337/600 aspect, the sprite's and the shelter frame's feet stand on the ground line,
 * and nothing of the scene (sprite cell with hat room, shelter frame, heart) overlaps the portrait.
 */

export type CardFormat = "story" | "post";

/** Every string on the card, built by `cardText()` in copy.ts. */
export interface CardText {
  /** The text lockup drawn when `/logo/logo-text.webp` fails to load. */
  wordmark: string;
  link: string;
  /** "Mochi & Zare", "Mochi" or "Ginger cat". */
  nameLine: string;
  /** Used when `nameLine` does not fit at the minimum size ("Mochi"); then the ellipsis rule. */
  nameFallback: string;
  /** The one line under the title: "Now a pixel cat in Token Tails" or "Zare · a real cat at Pink Paw". */
  subline: string;
  /** The Pink Paw cat in the scene; null draws the card solo. */
  panel: { name: string } | null;
}

export interface CardInput {
  format: CardFormat;
  text: CardText;
  /**
   * Whether the visitor's cat stands on the ground (default true). False without an avatar: the
   * sprite then sits inside the portrait box (`stand`), and a shelter frame stands alone, centred.
   */
  standing?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A centred (or left-aligned) text line: its box, baseline and font size. */
export interface TextRect extends Rect {
  baseline: number;
  size: number;
}

export interface CardLayout {
  width: number;
  height: number;
  safe: Rect;
  /** The lockup image, at its native 600:337 aspect. */
  logo: Rect;
  /** The text wordmark drawn inside `logo` when the image fails. */
  wordmark: TextRect;
  /** The pixel portrait, an integer multiple of 96 (672 story, 576 post). */
  avatar: Rect;
  /** The gold bevel (`drawFrame` at `frameScale`) around the avatar. */
  frame: Rect;
  frameScale: number;
  /** The ground line under the portrait (the foot plate's horizon): the scene stands on it. */
  ground: number;
  /** The walk-row sprite cell (48 px x `spriteScale`), feet on the ground line. */
  sprite: Rect;
  spriteScale: number;
  /** True when the sprite is drawn mirrored (facing left, towards the shelter cat). */
  spriteMirror: boolean;
  /** The sprite's visible body (a conservative box inside the cell), for the safe-area check. */
  spriteBody: Rect;
  /** The night shadow under the sprite's feet, on the ground. */
  shadow: Rect;
  /** Sprite frame 0 inside the avatar box when there is no avatar (12x story, 10x post). */
  stand: Rect;
  name: TextRect & { text: string };
  subline: TextRect;
  /**
   * The cream 2:3 frame around the shelter art, before the lean, standing on the ground left of the
   * cat; null without the panel. `panel`,
   * `panelImage` and `roundel` are drawn rotated by `panelAngle` around `panelPivot`.
   */
  panel: Rect | null;
  /** The shelter art, 2:3. */
  panelImage: Rect | null;
  /** The Pink Paw roundel on the shelter frame's bottom-right corner. */
  roundel: Rect | null;
  /** The lean, in degrees (negative: the top tips left, onto the left rail). */
  panelAngle: number;
  /** The bottom centre of the shelter frame: it stands on the ground line. */
  panelPivot: { x: number; y: number } | null;
  /** The bounding box of the leaning shelter frame (and its roundel), for the safe-area check. */
  panelBounds: Rect | null;
  /** The pixel heart above the gap between the two heads (6 x 6 cells of `heartUnit` px); null solo. */
  heart: Rect | null;
  heartUnit: number;
  /**
   * The foot plate, its horizon on `ground`, wider than the card (background: outside the safe area
   * is fine); under it `groundFill`, a night-950 fill down to the bottom edge.
   */
  foot: Rect;
  groundFill: Rect;
  link: TextRect;
}

export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
};

export const NAME_START: Record<CardFormat, number> = { story: 112, post: 96 };
export const NAME_MIN: Record<CardFormat, number> = { story: 64, post: 56 };
/** The lockup `/logo/logo-text.webp` is 600 x 337. */
export const LOGO_ASPECT = 337 / 600;
/** The foot plate `/landing/plates/hub-night-near-v1.png` is 1376 x 384. */
export const FOOT_ASPECT = 384 / 1376;
/** Its open horizon (the grass line between the ruins) is at plate y 224 of 384. */
export const FOOT_GROUND = 224 / 384;
/** The plate is drawn 1262 px wide on both formats (352 tall), centred: its ruins frame the scene. */
export const FOOT_WIDTH = 1262;
/** A sprite cell is 48 px; the walk row's feet end at cell y 36 (0-based row 35). */
export const SPRITE_CELL = 48;
export const SPRITE_FEET_Y = 36;
/**
 * The bare cat in walk row 9 frame 3 (no hat): x 12–37, head top at y 11. Used to centre the scene
 * and to place the heart; mirrored, the visible box starts at x 48 - 37 = 11.
 */
export const WALK_VISIBLE = { left: 12, right: 37, top: 11 } as const;
/** The visible body inside a cell, with room for hats: x 8–40, y 0–36. */
const BODY = { x: 8, w: 32, y: 0, h: 36 };
/** The bevel at scale 2 is 20 px (4 + 4 + 2, doubled). */
export const FRAME_SCALE = 2;
export const BEVEL_UNITS = 10;
/** The cream shelter frame's bevel on the card. */
export const PANEL_BEVEL = 8;
/** The shelter frame leans 4° to the left, like the stage's `-rotate-[4deg]`. */
export const PANEL_ANGLE = -4;
/** The pixel heart is 6 x 6 cells (PetCat's `PixelHeart`). */
export const HEART_CELLS = 6;
const NAME_MAX_WIDTH = 920;

/** Measures `text` at `size` px in the name face (canvas `measureText(...).width`). */
export type Measure = (text: string, size: number) => number;

const ASCENT = 0.8;
const DESCENT = 0.2;

function textRect(x: number, baseline: number, size: number, maxWidth: number): TextRect {
  const top = baseline - Math.ceil(size * ASCENT);
  return { x, y: top, w: maxWidth, h: Math.ceil(size * ASCENT) + Math.ceil(size * DESCENT), baseline, size };
}

function centred(width: number, baseline: number, size: number, maxWidth: number): TextRect {
  return textRect(Math.round((width - maxWidth) / 2), baseline, size, maxWidth);
}

/**
 * The name line: start size, then 4 px smaller until it fits the width, never below the minimum.
 * Still too wide: the fallback text (the cat's name alone) the same way; then an ellipsis.
 */
export function fitName(
  text: string,
  measure: Measure,
  start: number,
  min: number,
  maxWidth: number = NAME_MAX_WIDTH,
  fallback?: string,
): { text: string; size: number } {
  const shrink = (line: string) => {
    let size = start;
    while (size - 4 >= min && measure(line, size) > maxWidth) size -= 4;
    return size;
  };
  let size = shrink(text);
  if (measure(text, size) <= maxWidth) return { text, size };
  let line = text;
  if (fallback && fallback !== text) {
    line = fallback;
    size = shrink(fallback);
    if (measure(fallback, size) <= maxWidth) return { text: fallback, size };
  }
  const chars = Array.from(line);
  while (chars.length > 1 && measure(`${chars.join("").trimEnd()}…`, size) > maxWidth) chars.pop();
  return { text: `${chars.join("").trimEnd()}…`, size };
}

interface FormatSpec {
  safe: Rect;
  logoW: number;
  logoY: number;
  avatarSide: number;
  avatarY: number;
  /** The ground line: a whole sprite cell (hat room included) fits between it and the frame. */
  ground: number;
  spriteScale: number;
  standScale: number;
  nameBaseline: number;
  sublineBaseline: number;
  sublineSize: number;
  /** The shelter art (2:3) inside the cream frame. */
  art: { w: number; h: number };
  /** The gap between the shelter frame and the cat's visible body: the heart floats above it. */
  sceneGap: number;
  roundelSide: number;
  heartUnit: number;
  linkBaseline: number;
  linkSize: number;
}

function spec(format: CardFormat): FormatSpec {
  // Top to bottom: logo, 16 px, the gold frame, one sprite cell of hat room down to the ground line,
  // the title just under it. The scene is the same with and without the shelter cat: only the cream
  // frame and the heart drop, and the lone cat moves to the centre.
  if (format === "story") {
    return {
      safe: { x: 60, y: 220, w: 960, h: 1460 },
      logoW: 260,
      logoY: 228,
      avatarSide: 672,
      avatarY: 410,
      ground: 1392,
      spriteScale: 8,
      standScale: 12,
      nameBaseline: 1500,
      sublineBaseline: 1560,
      sublineSize: 40,
      art: { w: 168, h: 252 },
      sceneGap: 140,
      roundelSide: 64,
      heartUnit: 10,
      linkBaseline: 1660,
      linkSize: 44,
    };
  }
  return {
    safe: { x: 60, y: 60, w: 960, h: 1230 },
    logoW: 220,
    logoY: 64,
    avatarSide: 576,
    avatarY: 222,
    ground: 1034,
    spriteScale: 6,
    standScale: 10,
    nameBaseline: 1128,
    sublineBaseline: 1178,
    sublineSize: 36,
    art: { w: 120, h: 180 },
    sceneGap: 110,
    roundelSide: 52,
    heartUnit: 7,
    linkBaseline: 1255,
    linkSize: 40,
  };
}

/** The axis-aligned box of `rects` rotated by `degrees` around `pivot`. */
export function rotatedBounds(rects: Rect[], degrees: number, pivot: { x: number; y: number }): Rect {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rects) {
    for (const [px, py] of [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ]) {
      const dx = px - pivot.x;
      const dy = py - pivot.y;
      xs.push(pivot.x + dx * cos - dy * sin);
      ys.push(pivot.y + dx * sin + dy * cos);
    }
  }
  // Whole pixels, outward; the epsilon keeps float noise (cos 90° = 6e-17) from adding a pixel.
  const x = Math.floor(Math.min(...xs) + 1e-9);
  const y = Math.floor(Math.min(...ys) + 1e-9);
  return { x, y, w: Math.ceil(Math.max(...xs) - 1e-9) - x, h: Math.ceil(Math.max(...ys) - 1e-9) - y };
}

export function cardLayout(input: CardInput, measure: Measure): CardLayout {
  const { width, height } = CARD_SIZE[input.format];
  const { text } = input;
  const panelOn = !!text.panel;
  const standing = input.standing !== false;
  const s = spec(input.format);
  const scale = s.spriteScale;
  const ground = s.ground;

  const logoH = Math.round(s.logoW * LOGO_ASPECT);
  const logo = { x: Math.round((width - s.logoW) / 2), y: s.logoY, w: s.logoW, h: logoH };
  const wordmarkSize = Math.round(logoH * 0.42);
  const wordmark = textRect(logo.x, Math.round(logo.y + logoH / 2 + wordmarkSize * 0.35), wordmarkSize, logo.w);

  const avatar = { x: Math.round((width - s.avatarSide) / 2), y: s.avatarY, w: s.avatarSide, h: s.avatarSide };
  const bevel = BEVEL_UNITS * FRAME_SCALE;
  const frame = grow(avatar, bevel);

  // The scene, centred under the portrait: [shelter frame] gap [cat], or the cat alone, or the shelter
  // frame alone (no avatar: the sprite is in the portrait box instead).
  const outer = { w: s.art.w + PANEL_BEVEL * 2, h: s.art.h + PANEL_BEVEL * 2 };
  const visibleW = (WALK_VISIBLE.right - WALK_VISIBLE.left) * scale;
  const mirror = panelOn && standing;
  let panelX = 0;
  let visibleX = Math.round((width - visibleW) / 2);
  if (panelOn && standing) {
    panelX = Math.round((width - (outer.w + s.sceneGap + visibleW)) / 2);
    visibleX = panelX + outer.w + s.sceneGap;
  } else if (panelOn) {
    panelX = Math.round((width - outer.w) / 2);
  }

  // Feet on the ground line; mirrored, the visible body starts 11 cells into the cell.
  const cell = SPRITE_CELL * scale;
  const spriteY = ground - SPRITE_FEET_Y * scale;
  const visibleLeft = mirror ? SPRITE_CELL - WALK_VISIBLE.right : WALK_VISIBLE.left;
  const spriteX = visibleX - visibleLeft * scale;
  const sprite = { x: spriteX, y: spriteY, w: cell, h: cell };
  const spriteBody = {
    x: spriteX + BODY.x * scale,
    y: spriteY + BODY.y * scale,
    w: BODY.w * scale,
    h: BODY.h * scale,
  };
  const shadow = {
    x: spriteX + 12 * scale,
    y: ground - scale,
    w: 24 * scale,
    h: 3 * scale,
  };
  const standSide = SPRITE_CELL * s.standScale;
  const stand = {
    x: avatar.x + (avatar.w - standSide) / 2,
    y: avatar.y + (avatar.h - standSide) / 2,
    w: standSide,
    h: standSide,
  };

  // The title is uppercase, like the page's H1; fitted in capitals so the measure matches the draw.
  const name = fitName(
    text.nameLine.toUpperCase(),
    measure,
    NAME_START[input.format],
    NAME_MIN[input.format],
    NAME_MAX_WIDTH,
    text.nameFallback.toUpperCase(),
  );

  // The shelter cat's cream frame stands on the ground left of the cat and leans.
  let panel: Rect | null = null;
  let panelImage: Rect | null = null;
  let roundel: Rect | null = null;
  let panelPivot: { x: number; y: number } | null = null;
  let panelBounds: Rect | null = null;
  let heart: Rect | null = null;
  if (panelOn) {
    panel = { x: panelX, y: ground - outer.h, w: outer.w, h: outer.h };
    panelImage = grow(panel, -PANEL_BEVEL);
    const side = s.roundelSide;
    roundel = { x: panel.x + panel.w - Math.round(side * 0.7), y: panel.y + panel.h - Math.round(side * 0.7), w: side, h: side };
    panelPivot = { x: panel.x + panel.w / 2, y: ground };
    panelBounds = rotatedBounds([panel, roundel], PANEL_ANGLE, panelPivot);
    if (standing) {
      // Above the gap between the two heads, a cell over the cat's head top; never on the portrait.
      const heartSide = HEART_CELLS * s.heartUnit;
      const between = (panelBounds.x + panelBounds.w + visibleX) / 2;
      const headTop = ground - (SPRITE_FEET_Y - WALK_VISIBLE.top) * scale;
      heart = {
        x: Math.round(between - heartSide / 2),
        y: Math.max(frame.y + frame.h + s.heartUnit, headTop - heartSide + s.heartUnit),
        w: heartSide,
        h: heartSide,
      };
    }
  }

  // The foot plate's horizon is the ground line; a night fill continues it to the bottom edge.
  const footH = Math.round(FOOT_WIDTH * FOOT_ASPECT);
  const foot = { x: Math.round((width - FOOT_WIDTH) / 2), y: ground - Math.round(footH * FOOT_GROUND), w: FOOT_WIDTH, h: footH };
  const fillTop = foot.y + foot.h - 2;
  const groundFill = { x: 0, y: fillTop, w: width, h: height - fillTop };

  return {
    width,
    height,
    safe: s.safe,
    logo,
    wordmark,
    avatar,
    frame,
    frameScale: FRAME_SCALE,
    ground,
    sprite,
    spriteScale: scale,
    spriteMirror: mirror,
    spriteBody,
    shadow,
    stand,
    name: { ...centred(width, s.nameBaseline, name.size, NAME_MAX_WIDTH), text: name.text },
    subline: centred(width, s.sublineBaseline, s.sublineSize, 960),
    panel,
    panelImage,
    roundel,
    panelAngle: PANEL_ANGLE,
    panelPivot,
    panelBounds,
    heart,
    heartUnit: s.heartUnit,
    foot,
    groundFill,
    link: centred(width, s.linkBaseline, s.linkSize, 960),
  };
}

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

/** True when `inner` lies completely inside `outer`. */
export function insideRect(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
  );
}
