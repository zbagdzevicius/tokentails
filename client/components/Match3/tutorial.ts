/**
 * Paw Match first-move tutorial (plan G12 "Tutorial rewrite", G14 "Paw Match hint", G10).
 *
 * Pure numbers and copy, no Phaser: the scene asks for the plate rect, the copy and the glove's
 * track, and draws them. Jest checks the geometry at the F1 viewports
 * (`client/__test__/match3-tutorial.test.ts`).
 *
 * - The plate is a `hint` role panel (Nunito 800, sentence case, decision #86) sized to its text
 *   and kept inside the layout's tutorial region, which sits under the bottom stack, beside the
 *   board (wide), at the top of the left panel (small landscape) or over the stat cards (short
 *   phones), and always above the safe-area bottom.
 * - One message at a time: while the plate shows, the combo and mission lines are hidden.
 * - The glove points at the shared edge of the two glowing cells from outside them, so it never
 *   hides either one.
 */
import type { Rect, TutorialOverlay } from "./hudLayout";

export type InputKind = "touch" | "mouse";

/** What the plate says. Sentence case at the source (the `hint` role would lower SHOUTED copy). */
export const TUTORIAL_COPY = {
  intro: {
    touch: "Swipe one glowing tile onto the other. The clock waits for you.",
    mouse: "Drag one glowing tile onto the other. The clock waits for you.",
  },
  /** After a swap that is not the glowing pair (written into the plate with a red stroke). */
  wrong: "Follow the glow",
} as const;

export function tutorialMessage(kind: InputKind, state: "intro" | "wrong"): string {
  return state === "wrong" ? TUTORIAL_COPY.wrong : TUTORIAL_COPY.intro[kind];
}

/** How long the plate's text keeps the red stroke after a wrong swap. */
export const WRONG_STROKE_MS = 300;

/** Inner padding of the plate around its text, in CSS px. */
export const PLATE_PAD_X = 14;
export const PLATE_PAD_Y = 9;
/** The plate is never shorter than this (one 16 px line plus padding). */
export const PLATE_MIN_H = 40;

/** The largest text box the plate can hold in `region`. */
export function plateTextBox(region: Rect): { maxWidth: number; maxHeight: number } {
  return {
    maxWidth: Math.max(40, Math.floor(region.w - 2 * PLATE_PAD_X)),
    maxHeight: Math.max(16, Math.floor(region.h - 2 * PLATE_PAD_Y)),
  };
}

/**
 * The plate rect for a fitted text of `textW` x `textH`, inside `region`. Sized to the text plus
 * padding; centred horizontally; at the top of the region, or centred in it when it covers the
 * stat cards. `bounds` (the safe rect) clamps it once more, so a rounding error can never put it
 * under the home indicator.
 */
export function tutorialPlateRect(
  region: Rect & { overlay?: TutorialOverlay },
  textW: number,
  textH: number,
  bounds?: Rect,
): Rect {
  const w = Math.min(region.w, Math.max(PLATE_MIN_H, Math.ceil(textW) + 2 * PLATE_PAD_X));
  const h = Math.min(region.h, Math.max(PLATE_MIN_H, Math.ceil(textH) + 2 * PLATE_PAD_Y));
  const x = region.x + (region.w - w) / 2;
  const y = region.overlay === "cards" ? region.y + (region.h - h) / 2 : region.y;
  const rect = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  if (!bounds) return rect;
  rect.x = Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.w - rect.w));
  rect.y = Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.h - rect.h));
  return rect;
}

// ---- Glove pointer (G14) ----------------------------------------------------------------------

export interface CellPos {
  row: number;
  col: number;
}

export interface BoardGeometry {
  x: number;
  y: number;
  tileSize: number;
  rows: number;
  cols: number;
}

/** The glove texture is 32x32 CSS px; its fingertip pixel, from the top-left, pointing up. */
export const GLOVE_SIZE = 32;
export const GLOVE_TIP = { x: 12, y: 0 } as const;
/** Trailing ghosts: delay behind the glove (ms) and alpha. */
export const GLOVE_GHOSTS = [
  { lagMs: 70, alpha: 0.38 },
  { lagMs: 140, alpha: 0.18 },
] as const;
/** The glove and its ghosts draw above the board, the plate and the HUD (plan G14). */
export const GLOVE_DEPTH = 95;

export type GloveSide = "below" | "above" | "right" | "left";

export interface GloveTrack {
  side: GloveSide;
  /** Rotation in degrees (0 = finger up). */
  angle: number;
  /** Glove centre at the first cell, at the second cell, and halfway (the reduced-motion pose). */
  start: { x: number; y: number };
  end: { x: number; y: number };
  mid: { x: number; y: number };
}

const ANGLE: Record<GloveSide, number> = { below: 0, left: 90, above: 180, right: 270 };

/** Rotates the fingertip offset (from the glove centre) by a multiple of 90 degrees. */
function tipOffset(angle: number): { x: number; y: number } {
  const fx = GLOVE_TIP.x - GLOVE_SIZE / 2;
  const fy = GLOVE_TIP.y - GLOVE_SIZE / 2;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  return { x: fx * cos - fy * sin, y: fx * sin + fy * cos };
}

/**
 * Where the glove travels for the swap `from` -> `to`. A horizontal pair is pointed at from below
 * (from above on the bottom row), a vertical pair from the right (from the left in the last
 * column), so the glove's whole 32 px box stays outside both cells on its whole path.
 */
export function gloveTrack(from: CellPos, to: CellPos, board: BoardGeometry): GloveTrack {
  const horizontal = from.row === to.row;
  const side: GloveSide = horizontal
    ? Math.min(from.row, to.row) >= board.rows - 1 ? "above" : "below"
    : Math.min(from.col, to.col) >= board.cols - 1 ? "left" : "right";
  const angle = ANGLE[side];
  const tip = tipOffset(angle);
  const gap = 1;
  // The fingertip touches the outer edge of each cell, on the chosen side, at the edge's middle.
  const edgePoint = (cell: CellPos) => {
    const left = board.x + cell.col * board.tileSize;
    const top = board.y + cell.row * board.tileSize;
    const cx = left + board.tileSize / 2;
    const cy = top + board.tileSize / 2;
    if (side === "below") return { x: cx, y: top + board.tileSize + gap };
    if (side === "above") return { x: cx, y: top - gap };
    if (side === "right") return { x: left + board.tileSize + gap, y: cy };
    return { x: left - gap, y: cy };
  };
  const centreFor = (point: { x: number; y: number }) => ({ x: point.x - tip.x, y: point.y - tip.y });
  const start = centreFor(edgePoint(from));
  const end = centreFor(edgePoint(to));
  return { side, angle, start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}

/** The glove's box around a centre (rotations by 90 degrees keep the square). */
export function gloveBox(centre: { x: number; y: number }): Rect {
  return { x: centre.x - GLOVE_SIZE / 2, y: centre.y - GLOVE_SIZE / 2, w: GLOVE_SIZE, h: GLOVE_SIZE };
}

export function cellRect(cell: CellPos, board: BoardGeometry): Rect {
  return { x: board.x + cell.col * board.tileSize, y: board.y + cell.row * board.tileSize, w: board.tileSize, h: board.tileSize };
}

/** The input kind to start with: touch on coarse, hover-less pointers, else mouse. */
export function initialInputKind(): InputKind {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "mouse";
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches ? "touch" : "mouse";
  } catch {
    return "mouse";
  }
}

/** `prefers-reduced-motion: reduce`, read when asked. False where matchMedia is missing. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
