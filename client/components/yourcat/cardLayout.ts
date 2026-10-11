/**
 * Share card layout (docs/plans/yourcat-v2.md §5.2), pure so it is testable without a canvas.
 *
 * Story 1080 x 1920 (safe area x 60–1020, y 220–1680: stories cover the top and bottom) and post
 * 1080 x 1350 (safe area x 60–1020, y 60–1290). Text rects span the glyph box around the baseline
 * (ascent 0.8 x size above it, descent 0.2 x size below it).
 */
import { CARD_TEXT } from "./copy";

export type CardFormat = "story" | "post";

export interface CardInput {
  format: CardFormat;
  /** The name for the card; empty while the cat has no name (the line then reads "Ginger cat"). */
  name: string;
  familyLabel: string;
  hasShelterCat: boolean;
  shelterName?: string;
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
  wordmark: TextRect;
  avatar: Rect;
  /** The gold frame drawn around the avatar (8 px outside it). */
  frame: Rect;
  sprite: Rect;
  name: TextRect & { text: string };
  subline: TextRect;
  panel: Rect | null;
  panelImage: Rect | null;
  /** Left-aligned panel lines (MEETS, the cat's name, FROM PINK PAW); null without the panel. */
  panelText: { meets: TextRect; shelter: TextRect & { text: string }; from: TextRect } | null;
  link: TextRect;
}

export const CARD_SIZE: Record<CardFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  post: { width: 1080, height: 1350 },
};

export const NAME_START: Record<CardFormat, number> = { story: 112, post: 96 };
export const NAME_MIN: Record<CardFormat, number> = { story: 64, post: 56 };
export const FRAME_PX = 8;
const NAME_MAX_WIDTH = 920;

/** Measures `text` at `size` px in the name face (canvas `measureText(...).width`). */
export type Measure = (text: string, size: number) => number;

const ASCENT = 0.8;
const DESCENT = 0.2;

function centred(width: number, baseline: number, size: number, maxWidth: number): TextRect {
  const x = Math.round((width - maxWidth) / 2);
  const top = baseline - Math.ceil(size * ASCENT);
  return { x, y: top, w: maxWidth, h: Math.ceil(size * ASCENT) + Math.ceil(size * DESCENT), baseline, size };
}

function leftAligned(x: number, baseline: number, size: number, maxWidth: number): TextRect {
  const top = baseline - Math.ceil(size * ASCENT);
  return { x, y: top, w: maxWidth, h: Math.ceil(size * ASCENT) + Math.ceil(size * DESCENT), baseline, size };
}

/**
 * The name line: start size, then 4 px smaller until it fits the width, never below the minimum;
 * then an ellipsis.
 */
export function fitName(
  text: string,
  measure: Measure,
  start: number,
  min: number,
  maxWidth: number = NAME_MAX_WIDTH,
): { text: string; size: number } {
  let size = start;
  while (size - 4 >= min && measure(text, size) > maxWidth) size -= 4;
  if (measure(text, size) <= maxWidth) return { text, size };
  const chars = Array.from(text);
  while (chars.length > 1 && measure(`${chars.join("").trimEnd()}…`, size) > maxWidth) chars.pop();
  return { text: `${chars.join("").trimEnd()}…`, size };
}

/** The text on the name line: the name, or "{Family} cat" while there is none (never "My cat"). */
export function cardNameText(input: Pick<CardInput, "name" | "familyLabel">): string {
  const name = input.name.trim();
  return name || CARD_TEXT.unnamed(input.familyLabel);
}

export function cardLayout(input: CardInput, measure: Measure): CardLayout {
  const { width, height } = CARD_SIZE[input.format];
  const name = fitName(cardNameText(input), measure, NAME_START[input.format], NAME_MIN[input.format]);
  const panelOn = input.hasShelterCat && !!input.shelterName;
  const shelterName = input.shelterName || "";

  if (input.format === "story") {
    const avatar = { x: 160, y: 320, w: 760, h: 760 };
    const panel = panelOn ? { x: 80, y: 1310, w: 920, h: 260 } : null;
    return {
      width,
      height,
      safe: { x: 60, y: 220, w: 960, h: 1460 },
      wordmark: centred(width, 270, 40, 960),
      avatar,
      frame: grow(avatar, FRAME_PX),
      sprite: { x: 790, y: 900, w: 192, h: 192 },
      name: { ...centred(width, 1190, name.size, NAME_MAX_WIDTH), text: name.text },
      subline: centred(width, panelOn ? 1250 : 1290, 40, 960),
      panel,
      panelImage: panel ? { x: 100, y: 1330, w: 220, h: 220 } : null,
      panelText: panel
        ? {
            meets: leftAligned(350, 1395, 32, 630),
            shelter: { ...leftAligned(350, 1475, 64, 630), text: shelterName },
            from: leftAligned(350, 1530, 32, 630),
          }
        : null,
      link: centred(width, 1650, 44, 960),
    };
  }

  const avatar = { x: 240, y: 120, w: 600, h: 600 };
  const panel = panelOn ? { x: 80, y: 920, w: 920, h: 220 } : null;
  return {
    width,
    height,
    safe: { x: 60, y: 60, w: 960, h: 1230 },
    wordmark: centred(width, 90, 36, 960),
    avatar,
    frame: grow(avatar, FRAME_PX),
    sprite: { x: 760, y: 600, w: 144, h: 144 },
    name: { ...centred(width, 820, name.size, NAME_MAX_WIDTH), text: name.text },
    subline: centred(width, 878, 36, 960),
    panel,
    panelImage: panel ? { x: 100, y: 940, w: 180, h: 180 } : null,
    panelText: panel
      ? {
          meets: leftAligned(310, 985, 28, 670),
          shelter: { ...leftAligned(310, 1050, 56, 670), text: shelterName },
          from: leftAligned(310, 1100, 28, 670),
        }
      : null,
    link: centred(width, 1250, 40, 960),
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
