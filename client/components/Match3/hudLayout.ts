/**
 * Paw Match HUD geometry (plan G12 "Call-site migration", F10 `layoutHud()`).
 *
 * Pure numbers, no Phaser: the scene asks for a layout once per build (create, a late font, a
 * resize) and places its cards and texts from it. Every text gets a slot box, and `ttFit` keeps the
 * text inside that box, so a late or wider face can shrink or drop segments but never spill into
 * a neighbour. The slots are disjoint by construction; `client/__test__/match3-layout.test.ts`
 * checks that at every supported viewport.
 *
 * Slot heights are glyph boxes: a slot holds the cap height of its starting size (Bebas and
 * Passion One caps are about 0.7 em), not Phaser's full line box with stroke.
 *
 * Units are CSS pixels (the F10 camera maps them onto the dpr backing store), which is what
 * `px(n)` means here: the Text resolution, not the coordinates, carries the device pixel ratio.
 */
import type { TypeRole } from "@/components/typography/roles";

export const BOARD_ROWS = 8;
export const BOARD_COLS = 8;

export type HudMode = "smallLandscape" | "wide" | "standard";

export type HudKey =
  | "title"
  | "streak"
  | "timer"
  | "score"
  | "best"
  | "target"
  | "moves"
  | "objective"
  | "stars"
  | "combo"
  | "mission"
  | "burst"
  | "fever"
  | "reward";

/** Keys whose slot sits over the board on purpose (the combo burst flashes on top of it). */
export const HUD_OVERLAY_KEYS: ReadonlyArray<HudKey> = ["burst"];

export interface Rect {
  /** Left, top, width, height. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudSlot {
  key: HudKey;
  role: TypeRole;
  /** Starting size in CSS px (the role minimum still applies). */
  size: number;
  /** The anchor the text is placed at, with its origin. */
  x: number;
  y: number;
  originX: 0 | 0.5 | 1;
  originY: 0.5;
  /** The box the text must fit into. */
  box: Rect;
  /** Wrap long copy inside the box instead of a single line. */
  wrap?: boolean;
}

/** A framed card (`createUiCard`), centre-based like the scene's rectangles. */
export interface Card {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * What the tutorial panel covers on purpose: nothing; the bottom stack (combo, mission, reward and
 * fever, which are hidden or read zero before the first move); the four stat cards; or the empty
 * part of a side panel.
 */
export type TutorialOverlay = "none" | "stack" | "cards" | "panel";

export interface Match3Layout {
  mode: HudMode;
  compact: boolean;
  viewWidth: number;
  viewHeight: number;
  tileSize: number;
  tileIconSize: number;
  markerOffset: number;
  board: Rect;
  title?: { plate: Card; pawOffset: number };
  cards: Card[];
  /** Striped stat rows inside the side panels (centre-based). */
  rows: Array<Card & { alt: boolean }>;
  /** The objective icon: 16, 24 or 32 CSS px, each drawn from the catnip master of that size. */
  objectiveIcon: { x: number; y: number; size: 16 | 24 | 32; originX: 0 | 0.5 };
  /**
   * The first-move tutorial panel (top-left rect). It sits in free space under the bottom stack
   * when there is room; otherwise `overlay` says what it covers on purpose: the stat cards (they
   * all read zero before the first move) or the left side panel. Never the board or the stack.
   */
  tutorial: Rect & { overlay: TutorialOverlay };
  progress: { x: number; y: number; w: number; h: number; glowH: number };
  slots: Record<HudKey, HudSlot>;
  /** The view minus the safe-area insets: every slot, card and the board sit inside it. */
  safe: Rect;
  /**
   * The strip the DOM close button (Match3.tsx, CloseButton `viewport`) covers at the top right,
   * from the header reserve and the top inset. Nothing the scene draws for the HUD goes into it.
   */
  closeZone: Rect;
}

/** Safe-area insets in CSS px (the `env(safe-area-inset-*)` values). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Match3LayoutOptions {
  insets?: Partial<Insets>;
  /**
   * CSS px the header keeps free on its right for the X, the right inset included (the
   * `--tt-header-reserve-right` contract of Match3.tsx). Default CLOSE_BUTTON_RESERVE.
   */
  headerReserveRight?: number;
}

/** The X's distance from the top of the view when there is no top inset (CloseButton: 0.5rem). */
export const CLOSE_BUTTON_INSET = 8;
/** The reserve is the inset, the button and a gap: 8 + 44 + 4 (56), 8 + 64 + 4 at `lg` (76). */
const CLOSE_BUTTON_GAP = 4;

/** The close button's strip in layout coordinates of the inner (safe) rect. */
function closeZoneFor(innerW: number, insets: Insets, headerReserveRight: number): Rect {
  const reserve = Math.max(0, headerReserveRight - insets.right);
  const button = Math.max(0, reserve - CLOSE_BUTTON_INSET - CLOSE_BUTTON_GAP);
  const top = Math.max(CLOSE_BUTTON_INSET, insets.top) - insets.top;
  return { x: innerW - reserve, y: 0, w: reserve, h: top + button + CLOSE_BUTTON_GAP };
}

function slot(
  key: HudKey,
  role: TypeRole,
  size: number,
  x: number,
  y: number,
  w: number,
  h: number,
  originX: 0 | 0.5 | 1 = 0.5,
  wrap = false,
): HudSlot {
  const left = originX === 0 ? x : originX === 1 ? x - w : x - w / 2;
  return { key, role, size, x, y, originX, originY: 0.5, box: { x: left, y: y - h / 2, w, h }, wrap };
}

/** Bottom stack under the board: combo, mission, fever, reward, top to bottom. */
function bottomStack(
  centerX: number,
  startY: number,
  width: number,
  sizes: { combo: number; mission: number; fever: number; reward: number },
) {
  const gap = 4;
  const heights = {
    combo: sizes.combo + 6,
    mission: sizes.mission + 5,
    fever: sizes.fever + 6,
    reward: sizes.reward + 6,
  };
  let y = startY;
  const at = (h: number) => {
    const centre = y + h / 2;
    y += h + gap;
    return centre;
  };
  const comboY = at(heights.combo);
  const missionY = at(heights.mission);
  const feverY = at(heights.fever);
  const rewardY = at(heights.reward);
  return {
    bottom: y - gap - startY,
    combo: slot("combo", "hud", sizes.combo, centerX, comboY, width, heights.combo),
    mission: slot("mission", "label", sizes.mission, centerX, missionY, width, heights.mission),
    fever: slot("fever", "hud", sizes.fever, centerX, feverY, width, heights.fever),
    reward: slot("reward", "hud", sizes.reward, centerX, rewardY, width, heights.reward),
  };
}

/** The frame around the board reaches this far outside it (createBoardFrame's outer rectangle). */
export const BOARD_FRAME_MARGIN = 22;

/** The most spare height a portrait board leaves above itself (the rest goes below the stack). */
export const BOARD_SLACK_ABOVE = 16;

/** Height kept for the tutorial panel (two lines of the hint role plus padding). */
export const TUTORIAL_PANEL_H = 64;

/** The tutorial rect under the bottom stack when it fits the view, else null. */
function tutorialBelow(centerX: number, stackBottom: number, width: number, viewHeight: number) {
  const y = stackBottom + 8;
  if (y + TUTORIAL_PANEL_H > viewHeight - 6) return null;
  return { x: centerX - width / 2, y, w: width, h: TUTORIAL_PANEL_H, overlay: "none" as const };
}

/** The most height the panel takes over the bottom stack (three hint lines plus padding). */
const TUTORIAL_STACK_MAX_H = 96;

/**
 * The tutorial rect over the bottom stack, from its top to the view's bottom, when that fits the
 * panel. The stack's lines are empty before the first move (combo and mission are hidden while the
 * tutorial shows, reward reads zero), so the plate sits right under the board, next to the glove,
 * and the stat cards (the clock that waits) stay readable.
 */
function tutorialOverStack(centerX: number, stackTop: number, width: number, viewHeight: number) {
  const room = viewHeight - 6 - stackTop;
  if (room < TUTORIAL_PANEL_H) return null;
  return { x: centerX - width / 2, y: stackTop, w: width, h: Math.min(room, TUTORIAL_STACK_MAX_H), overlay: "stack" as const };
}

/** Room kept free beside the title plate for the DOM close button on phones (44 px + gutter). */
export const CLOSE_BUTTON_RESERVE = 56;

function boardFor(
  width: number,
  height: number,
  safeTop: number,
  safeBottom: number,
  sideReserve: number,
  tileCap: number,
  tileFloor: number,
  fillWidth: boolean,
  hardWidth = Infinity,
) {
  const maxBoardByWidth = fillWidth ? width * 0.92 : width - sideReserve;
  const hardTile = Math.floor((hardWidth - 8) / BOARD_COLS);
  const maxTileByWidth = Math.floor(maxBoardByWidth / BOARD_COLS);
  const maxTileByHeight = Math.floor((height - safeTop - safeBottom) / BOARD_ROWS);
  const tileSize = Math.min(hardTile, Math.max(tileFloor, Math.min(tileCap, maxTileByWidth, maxTileByHeight)));
  const boardWidth = tileSize * BOARD_COLS;
  const boardHeight = tileSize * BOARD_ROWS;
  const x = Math.floor((width - boardWidth) / 2);
  // Portrait: spare height goes below the board (at most BOARD_SLACK_ABOVE above), so the stat
  // cards, the objective row and the board read as one block, and the room under the bottom stack
  // holds the tutorial panel. Side-panel layouts centre the board.
  const slack = Math.max(0, height - boardHeight - safeTop - safeBottom);
  const y = safeTop + (fillWidth ? Math.min(BOARD_SLACK_ABOVE, Math.floor(slack * 0.35)) : Math.floor(slack * 0.5));
  return { tileSize, board: { x, y, w: boardWidth, h: boardHeight } };
}

/**
 * The layout for a view of `viewWidth` x `viewHeight` CSS px. With insets the HUD is laid out in
 * the safe rect and moved into place, so nothing sits under a notch or the home indicator; the
 * header keeps `headerReserveRight` free at the top right for the X (plan G14 "Close and modal").
 */
export function computeMatch3Layout(
  viewWidth: number,
  viewHeight: number,
  options: Match3LayoutOptions = {},
): Match3Layout {
  const insets: Insets = {
    top: clampInset(options.insets?.top),
    right: clampInset(options.insets?.right),
    bottom: clampInset(options.insets?.bottom),
    left: clampInset(options.insets?.left),
  };
  const width = Math.max(1, viewWidth - insets.left - insets.right);
  const height = Math.max(1, viewHeight - insets.top - insets.bottom);
  const reserveOption = options.headerReserveRight;
  const headerReserveRight =
    typeof reserveOption === "number" && Number.isFinite(reserveOption) && reserveOption >= 0
      ? reserveOption
      : CLOSE_BUTTON_RESERVE + insets.right;
  const close = closeZoneFor(width, insets, headerReserveRight);
  const smallLandscape = width > height && width <= 960 && height <= 450;
  const wide = !smallLandscape && width >= 1220 && height >= 760;
  const compact = !wide && (width < 980 || height < 760);
  const centerX = width / 2;

  const inner = smallLandscape
    ? smallLandscapeLayout(width, height, centerX, close)
    : wide
      ? wideLayout(width, height, centerX)
      : standardLayout(width, height, centerX, compact, close);
  return place(inner, insets, viewWidth, viewHeight, close);
}

function clampInset(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Moves a layout made for the safe rect into view coordinates. */
function place(layout: Match3Layout, insets: Insets, viewWidth: number, viewHeight: number, close: Rect): Match3Layout {
  const dx = insets.left;
  const dy = insets.top;
  const rect = <T extends { x: number; y: number }>(r: T): T => ({ ...r, x: r.x + dx, y: r.y + dy });
  const slots = Object.fromEntries(
    Object.entries(layout.slots).map(([key, s]) => [key, { ...s, x: s.x + dx, y: s.y + dy, box: rect(s.box) }]),
  ) as Record<HudKey, HudSlot>;
  return {
    ...layout,
    viewWidth,
    viewHeight,
    board: rect(layout.board),
    title: layout.title && { ...layout.title, plate: rect(layout.title.plate) },
    cards: layout.cards.map(rect),
    rows: layout.rows.map(rect),
    objectiveIcon: rect(layout.objectiveIcon),
    tutorial: rect(layout.tutorial),
    progress: rect(layout.progress),
    slots,
    safe: { x: dx, y: dy, w: layout.viewWidth, h: layout.viewHeight },
    closeZone: rect(close),
  };
}

function finish(
  base: Omit<Match3Layout, "tileIconSize" | "markerOffset" | "safe" | "closeZone">,
): Match3Layout {
  return {
    ...base,
    tileIconSize: Math.floor(base.tileSize * 0.72),
    markerOffset: Math.floor(base.tileSize * 0.22),
    // Placeholders: `place()` sets both in view coordinates.
    safe: { x: 0, y: 0, w: base.viewWidth, h: base.viewHeight },
    closeZone: { x: base.viewWidth, y: 0, w: 0, h: 0 },
  };
}

type StandardVariant = "normal" | "compact" | "tight";

const STANDARD_METRICS: Record<StandardVariant, {
  plateH: number; plateW: number; titleSize: number; streakH: number; streakSize: number;
  cardH: number; cardInset: number; cardW: number; cardGap: number; rowGap: number; statSize: number; bestSize: number;
  iconSize: 16 | 24 | 32;
  objectiveH: number; objectiveSize: number; starsSize: number; progressH: number; progressGap: number;
  burstSize: number; top: number; gap: number;
  bottom: { combo: number; mission: number; fever: number; reward: number };
}> = {
  normal: {
    plateH: 52, plateW: 410, titleSize: 31, streakH: 18, streakSize: 13, cardH: 56, cardInset: 10, iconSize: 24, cardW: 168, cardGap: 14,
    rowGap: 10, statSize: 21, bestSize: 14, objectiveH: 24, objectiveSize: 15, starsSize: 20, progressH: 16,
    progressGap: 22, burstSize: 34, top: 10, gap: 6,
    bottom: { combo: 24, mission: 14, fever: 24, reward: 22 },
  },
  compact: {
    plateH: 46, plateW: 350, titleSize: 23, streakH: 17, streakSize: 12, cardH: 50, cardInset: 9, iconSize: 24, cardW: 148, cardGap: 10,
    rowGap: 5, statSize: 18, bestSize: 12, objectiveH: 22, objectiveSize: 14, starsSize: 18, progressH: 16,
    progressGap: 18, burstSize: 28, top: 10, gap: 4,
    bottom: { combo: 20, mission: 13, fever: 21, reward: 20 },
  },
  // Short screens (iPhone SE, small laptops): a slimmer stack, fever shares the reward row.
  tight: {
    plateH: 38, plateW: 320, titleSize: 19, streakH: 15, streakSize: 12, cardH: 46, cardInset: 8, iconSize: 16, cardW: 140, cardGap: 8,
    rowGap: 6, statSize: 16, bestSize: 12, objectiveH: 20, objectiveSize: 13, starsSize: 16, progressH: 12,
    progressGap: 14, burstSize: 26, top: 6, gap: 4,
    bottom: { combo: 18, mission: 12, fever: 16, reward: 16 },
  },
};

/** The smallest tile the portrait board accepts, capped so eight tiles always fit the width. */
function tileFloorFor(width: number) {
  return Math.min(44, Math.floor((width - 8) / BOARD_COLS));
}

function standardLayout(width: number, height: number, centerX: number, compact: boolean, close: Rect): Match3Layout {
  const order: StandardVariant[] = compact ? ["compact", "tight"] : ["normal", "compact", "tight"];
  for (const variant of order) {
    const layout = standardVariant(width, height, centerX, variant, close);
    const fits = layout.board.y + layout.board.h + layout.bottomExtent <= height;
    if (fits) return layout.result;
    if (variant === "tight") {
      // Last resort (a 320 px phone under a status bar): smaller tiles rather than a HUD that
      // runs past the bottom edge.
      return standardVariant(width, height, centerX, variant, close, TIGHT_LAST_RESORT_TILE).result;
    }
  }
  throw new Error("unreachable");
}

/** The smallest portrait tile, used only when the tight stack does not fit otherwise. */
const TIGHT_LAST_RESORT_TILE = 34;

function standardVariant(
  width: number,
  height: number,
  centerX: number,
  variant: StandardVariant,
  close: Rect,
  floorOverride?: number,
) {
  const m = STANDARD_METRICS[variant];
  const tight = variant === "tight";
  // Top stack: title plate, streak line, two rows of stat cards, objective row, progress bar.
  // The DOM close button (44 px, 64 at lg, top right) sits beside the centred plate, never on it:
  // the plate keeps the reserve free on both sides. Below the plate, the streak line and the cards
  // start under the button's strip.
  const plateW = Math.min(m.plateW, width - 24, width - 2 * close.w);
  const titleY = m.top + m.plateH / 2;
  const streakTop = Math.max(titleY + m.plateH / 2 + 3, close.h + 2);
  const streakY = streakTop + m.streakH / 2;
  const cardW = Math.min(m.cardW, Math.floor((width - 24 - m.cardGap) / 2));
  const rowTopY = streakY + m.streakH / 2 + m.gap + m.cardH / 2;
  const rowBottomY = rowTopY + m.cardH + m.rowGap;
  const cardsBottom = rowBottomY + m.cardH / 2;
  const objectiveOffset = m.objectiveH / 2 + 4 + m.progressH / 2 + 2;
  const minObjectiveY = cardsBottom + m.gap + 4 + m.objectiveH / 2;
  const safeTop = minObjectiveY + objectiveOffset + m.progressGap;

  const probe = tight ? tightBottomStack(centerX, 0, 100, m.bottom) : bottomStack(centerX, 0, 100, m.bottom);
  const bottomExtent = BOARD_FRAME_MARGIN + 4 + probe.bottom + 6;
  const tileFloor = floorOverride ?? (tight ? Math.min(40, tileFloorFor(width)) : tileFloorFor(width));
  const { tileSize, board } = boardFor(width, height, safeTop, bottomExtent, 0, 92, tileFloor, true, width);
  const boardBottom = board.y + board.h;
  // The progress bar and objective row sit on the board frame (the board may be centred lower).
  const progressY = board.y - m.progressGap;
  const objectiveY = progressY - objectiveOffset;
  const stackWidth = Math.min(width - 16, board.w + 2 * BOARD_FRAME_MARGIN);
  const stackTop = boardBottom + BOARD_FRAME_MARGIN + 4;
  const stack = tight
    ? tightBottomStack(centerX, stackTop, stackWidth, m.bottom)
    : bottomStack(centerX, stackTop, stackWidth, m.bottom);

  const leftX = centerX - cardW / 2 - m.cardGap / 2;
  const rightX = centerX + cardW / 2 + m.cardGap / 2;
  const inner = cardW - 20;
  const iconSize = m.iconSize;
  const objectiveLeft = board.x + 6;
  const objectiveTextX = objectiveLeft + iconSize + 6;
  const starsW = Math.floor(board.w * 0.38);
  const objectiveW = board.x + board.w - starsW - 8 - objectiveTextX;
  // Score over best inside one card: both lines stay inside the card's innermost frame (createUiCard
  // draws it 10 px in), with a gap between them, so neither presses on a border.
  const bestH = m.bestSize + 2;
  const lineGap = 3;
  const scoreH = m.cardH - 2 * m.cardInset - bestH - lineGap;
  const cardTop = rowTopY - m.cardH / 2;

  const slots: Record<HudKey, HudSlot> = {
    title: slot("title", "hud", m.titleSize, centerX, titleY, plateW - 84, m.plateH - 12),
    streak: slot("streak", "label", m.streakSize, centerX, streakY, Math.min(width - 16, plateW), m.streakH),
    timer: slot("timer", "hud", m.statSize, leftX, rowTopY, inner, m.cardH - 14),
    score: slot("score", "hud", m.statSize, rightX, cardTop + m.cardInset + scoreH / 2, inner, scoreH),
    best: slot("best", "label", m.bestSize, rightX, cardTop + m.cardH - m.cardInset - bestH / 2, inner, bestH),
    target: slot("target", "hud", m.statSize, leftX, rowBottomY, inner, m.cardH - 14),
    moves: slot("moves", "hud", m.statSize, rightX, rowBottomY, inner, m.cardH - 14),
    objective: slot("objective", "label", m.objectiveSize, objectiveTextX, objectiveY, objectiveW, m.objectiveH, 0),
    stars: slot("stars", "hud", m.starsSize, board.x + board.w - 4, objectiveY, starsW, m.objectiveH, 1),
    burst: slot("burst", "burst", m.burstSize, centerX, board.y + board.h / 2 - 4, board.w - 16, m.burstSize + 18),
    combo: stack.combo,
    mission: stack.mission,
    fever: stack.fever,
    reward: stack.reward,
  };

  const result = finish({
    mode: "standard",
    compact: variant !== "normal",
    viewWidth: width,
    viewHeight: height,
    tileSize,
    board,
    title: { plate: { x: centerX, y: titleY, w: plateW, h: m.plateH }, pawOffset: plateW / 2 - 26 },
    cards: [
      { x: leftX, y: rowTopY, w: cardW, h: m.cardH },
      { x: rightX, y: rowTopY, w: cardW, h: m.cardH },
      { x: leftX, y: rowBottomY, w: cardW, h: m.cardH },
      { x: rightX, y: rowBottomY, w: cardW, h: m.cardH },
    ],
    rows: [],
    objectiveIcon: { x: objectiveLeft, y: objectiveY, size: iconSize, originX: 0 },
    progress: { x: centerX, y: progressY, w: board.w + 28, h: m.progressH, glowH: Math.round(m.progressH * 0.56) },
    tutorial:
      tutorialBelow(centerX, stackTop + stack.bottom, Math.min(width - 16, 560), height) ??
      tutorialOverStack(centerX, stackTop, Math.min(width - 16, 560), height) ?? {
        // No room under the board at all (short phones): cover the four stat cards, which read
        // zero before the first move.
        x: centerX - (2 * cardW + m.cardGap) / 2,
        y: rowTopY - m.cardH / 2,
        w: 2 * cardW + m.cardGap,
        h: rowBottomY - rowTopY + m.cardH,
        overlay: "cards",
      },
    slots,
  });
  return { result, board, bottomExtent };
}

/** The tight bottom stack: combo, mission, then reward and fever side by side. */
function tightBottomStack(
  centerX: number,
  startY: number,
  width: number,
  sizes: { combo: number; mission: number; fever: number; reward: number },
) {
  const gap = 3;
  const comboH = sizes.combo + 4;
  const missionH = sizes.mission + 4;
  const lastH = Math.max(sizes.reward, sizes.fever) + 4;
  const comboY = startY + comboH / 2;
  const missionY = comboY + comboH / 2 + gap + missionH / 2;
  const lastY = missionY + missionH / 2 + gap + lastH / 2;
  const half = width / 2 - 4;
  return {
    bottom: lastY + lastH / 2 - startY,
    combo: slot("combo", "hud", sizes.combo, centerX, comboY, width, comboH),
    mission: slot("mission", "label", sizes.mission, centerX, missionY, width, missionH),
    reward: slot("reward", "hud", sizes.reward, centerX - 4, lastY, half, lastH, 1),
    fever: slot("fever", "hud", sizes.fever, centerX + 4, lastY, half, lastH, 0),
  };
}

function wideLayout(width: number, height: number, centerX: number): Match3Layout {
  const plateH = 52;
  const plateW = 470;
  const titleY = 44;
  const streakH = 18;
  const streakY = titleY + plateH / 2 + 4 + streakH / 2;
  const safeTop = 132;
  const sizes = { combo: 24, mission: 14, fever: 24, reward: 22 };
  const probe = bottomStack(centerX, 0, 100, sizes);
  const safeBottom = BOARD_FRAME_MARGIN + 4 + probe.bottom + 8;
  const sideReserve = Math.min(420, width * 0.34);
  const { tileSize, board } = boardFor(width, height, safeTop, safeBottom, sideReserve, 82, 44, false);
  const boardBottom = board.y + board.h;
  const stack = bottomStack(centerX, boardBottom + BOARD_FRAME_MARGIN + 4, board.w + 2 * BOARD_FRAME_MARGIN, sizes);

  const panelW = Math.min(236, Math.max(182, Math.floor((width - board.w) / 2) - 30));
  const panelH = Math.max(250, board.h - 56);
  const leftPanelX = board.x - panelW / 2 - 28;
  const rightPanelX = board.x + board.w + panelW / 2 + 28;
  const panelCenterY = board.y + board.h / 2;
  const statTop = panelCenterY - panelH / 2 + 52;
  const rowW = panelW - 26;
  const rowH = 52;
  const inner = rowW - 14;
  const leftRows = [statTop, statTop + 74, statTop + 148];
  const rightRows = [statTop, statTop + 78, statTop + 148];
  const iconSize = 32 as const;
  const objectiveIconX = rightPanelX - rowW / 2 + 8;
  const objectiveTextX = objectiveIconX + iconSize + 6;

  const slots: Record<HudKey, HudSlot> = {
    title: slot("title", "hud", 31, centerX, titleY, plateW - 84, plateH - 12),
    streak: slot("streak", "label", 13, centerX, streakY, plateW, streakH),
    timer: slot("timer", "hud", 32, leftPanelX, leftRows[0], inner, rowH - 12),
    score: slot("score", "hud", 32, leftPanelX, leftRows[1] - 10, inner, 30),
    best: slot("best", "label", 18, leftPanelX, leftRows[1] + 15, inner, 18),
    moves: slot("moves", "hud", 30, leftPanelX, leftRows[2], inner, rowH - 12),
    target: slot("target", "hud", 30, rightPanelX, rightRows[0], inner, rowH - 12),
    objective: slot("objective", "label", 16, objectiveTextX, rightRows[1], rightPanelX + rowW / 2 - 6 - objectiveTextX, rowH - 14, 0),
    stars: slot("stars", "hud", 28, rightPanelX, rightRows[2], inner, rowH - 12),
    burst: slot("burst", "burst", 34, centerX, board.y + board.h / 2 - 4, board.w - 16, 56),
    combo: stack.combo,
    mission: stack.mission,
    fever: stack.fever,
    reward: stack.reward,
  };

  return finish({
    mode: "wide",
    compact: false,
    viewWidth: width,
    viewHeight: height,
    tileSize,
    board,
    title: { plate: { x: centerX, y: titleY, w: plateW, h: plateH }, pawOffset: plateW / 2 - 26 },
    cards: [
      { x: leftPanelX, y: panelCenterY, w: panelW, h: panelH },
      { x: rightPanelX, y: panelCenterY, w: panelW, h: panelH },
    ],
    rows: [
      ...leftRows.map((y, i) => ({ x: leftPanelX, y, w: rowW, h: rowH, alt: i % 2 === 1 })),
      ...rightRows.map((y, i) => ({ x: rightPanelX, y, w: rowW, h: rowH, alt: i % 2 === 1 })),
    ],
    objectiveIcon: { x: objectiveIconX, y: rightRows[1], size: iconSize, originX: 0 },
    progress: { x: centerX, y: board.y - 22, w: board.w + 28, h: 16, glowH: 9 },
    tutorial: tutorialBelow(centerX, boardBottom + BOARD_FRAME_MARGIN + 4 + stack.bottom, Math.min(560, board.w + 2 * BOARD_FRAME_MARGIN), height) ?? {
      // The empty lower part of the left panel, under its stat rows.
      x: leftPanelX - panelW / 2 + 8,
      y: leftRows[2] + rowH / 2 + 10,
      w: panelW - 16,
      h: panelCenterY + panelH / 2 - 12 - (leftRows[2] + rowH / 2 + 10),
      overlay: "panel",
    },
    slots,
  });
}

/**
 * The small-landscape plate (5c review): beside the board, in the left panel between BEST and the
 * reward line, over the combo line (hidden while the tutorial shows). TIME, SCORE and BEST stay
 * readable, so the "the clock waits" copy sits under a clock the player can see.
 */
function smallLandscapeTutorial(slots: Record<HudKey, HudSlot>, leftPanelX: number, panelW: number) {
  const top = slots.best.box.y + slots.best.box.h + 3;
  const bottom = slots.reward.box.y - 3;
  return {
    x: leftPanelX - panelW / 2 + 4,
    y: top,
    w: panelW - 8,
    h: Math.max(TUTORIAL_PANEL_H, bottom - top),
    overlay: "panel" as const,
  };
}

function smallLandscapeLayout(width: number, height: number, centerX: number, close: Rect): Match3Layout {
  // Side panels sit outside the board frame, so the frame never runs under a stat row.
  const sideReserve = Math.min(2 * (132 + 12 + BOARD_FRAME_MARGIN), width * 0.5);
  const { tileSize, board } = boardFor(width, height, 28, 20, sideReserve, 52, 30, false);
  const sideSlot = Math.floor((width - board.w) / 2) - BOARD_FRAME_MARGIN;
  const panelW = Math.min(220, sideSlot - 12);
  const sideInset = Math.max(6, Math.floor((sideSlot - panelW) / 2));
  const leftPanelX = board.x - BOARD_FRAME_MARGIN - sideInset - panelW / 2;
  const rightPanelX = board.x + board.w + BOARD_FRAME_MARGIN + sideInset + panelW / 2;
  // Both panels start under the X when the right one reaches into its strip (844x390: the X sits
  // at y 8 to 52 over the right stack). The bottom stays where it was, so the panels get shorter.
  const centredH = Math.max(170, board.h - 20);
  const centredTop = board.y + board.h / 2 - centredH / 2;
  const reachesX = rightPanelX + panelW / 2 > close.x;
  const panelTop = reachesX ? Math.max(centredTop, close.h + 4) : centredTop;
  const panelH = centredTop + centredH - panelTop;
  const panelCenterY = panelTop + panelH / 2;
  const rowW = panelW - 16;
  const rowH = 34;
  const rowOne = panelTop + Math.max(44, Math.floor(panelH * 0.2));
  const rowTwo = rowOne + Math.max(42, Math.floor(panelH * 0.14));
  const rowThree = rowTwo + Math.max(36, Math.floor(panelH * 0.12));
  const rowFour = rowThree + Math.max(36, Math.floor(panelH * 0.1));
  const headerY = panelTop + Math.max(16, Math.floor(panelH * 0.08));
  const footerBottomY = panelTop + panelH - Math.max(18, Math.floor(panelH * 0.07));
  const footerTopY = footerBottomY - 32;
  const inner = rowW - 8;
  const iconSize = 16 as const;
  const objectiveIconX = rightPanelX - rowW / 2 + 6;
  const objectiveTextX = objectiveIconX + iconSize + 4;

  const slots: Record<HudKey, HudSlot> = {
    // No title plate in small landscape: the slot is parked (unused) in the left panel header.
    title: slot("title", "hud", 18, leftPanelX, headerY, 0, 0),
    streak: slot("streak", "label", 12, leftPanelX, headerY, inner, 16),
    timer: slot("timer", "hud", 20, leftPanelX, rowOne, inner, rowH - 6),
    score: slot("score", "hud", 20, leftPanelX, rowTwo, inner, rowH - 6),
    best: slot("best", "label", 14, leftPanelX, rowThree, inner, rowH - 10),
    target: slot("target", "hud", 19, rightPanelX, rowOne, inner, rowH - 6),
    moves: slot("moves", "hud", 19, rightPanelX, rowTwo, inner, rowH - 6),
    objective: slot("objective", "label", 12, objectiveTextX, rowThree, rightPanelX + rowW / 2 - 4 - objectiveTextX, rowH - 8, 0),
    stars: slot("stars", "hud", 14, rightPanelX, rowFour, inner, rowH - 8),
    burst: slot("burst", "burst", 22, centerX, board.y + board.h / 2 - 4, board.w - 12, 34),
    combo: slot("combo", "hud", 13, leftPanelX, footerTopY, inner, 28, 0.5, true),
    mission: slot("mission", "label", 12, rightPanelX, footerTopY, inner, 28, 0.5, true),
    fever: slot("fever", "hud", 13, rightPanelX, footerBottomY, inner, 18),
    reward: slot("reward", "hud", 13, leftPanelX, footerBottomY, inner, 18),
  };

  return finish({
    mode: "smallLandscape",
    compact: true,
    viewWidth: width,
    viewHeight: height,
    tileSize,
    board,
    cards: [
      { x: leftPanelX, y: panelCenterY, w: panelW, h: panelH },
      { x: rightPanelX, y: panelCenterY, w: panelW, h: panelH },
    ],
    rows: [
      ...[rowOne, rowTwo, rowThree].map((y, i) => ({ x: leftPanelX, y, w: rowW, h: rowH, alt: i % 2 === 1 })),
      ...[rowOne, rowTwo, rowThree, rowFour].map((y, i) => ({ x: rightPanelX, y, w: rowW, h: rowH, alt: i % 2 === 1 })),
    ],
    objectiveIcon: { x: objectiveIconX, y: rowThree, size: iconSize, originX: 0 },
    progress: { x: centerX, y: board.y - 10, w: board.w + 16, h: 12, glowH: 7 },
    tutorial: smallLandscapeTutorial(slots, leftPanelX, panelW),
    slots,
  });
}

/** True when two rectangles share any area (touching edges do not count). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The centre-based cards (and the title plate) as top-left rects. */
export function cardRects(layout: Match3Layout): Array<{ name: string; rect: Rect }> {
  const out: Array<{ name: string; rect: Rect }> = [];
  const add = (name: string, c: Card) => out.push({ name, rect: { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h } });
  if (layout.title) add("title plate", layout.title.plate);
  layout.cards.forEach((c, i) => add(`card ${i}`, c));
  return out;
}

/**
 * Slot pairs that overlap, slots outside the safe rect or over the board (except overlays), and
 * anything of the header (slots, cards, the title plate) under the close button's strip.
 */
export function layoutProblems(layout: Match3Layout, keys: ReadonlyArray<HudKey> = Object.keys(layout.slots) as HudKey[]): string[] {
  const problems: string[] = [];
  const active = keys
    .filter((key) => !(layout.mode === "smallLandscape" && key === "title"))
    .map((key) => layout.slots[key]);
  const eps = 0.01;
  const safe = layout.safe;
  for (const s of active) {
    const b = s.box;
    if (b.x < safe.x - eps || b.y < safe.y - eps || b.x + b.w > safe.x + safe.w + eps || b.y + b.h > safe.y + safe.h + eps) {
      problems.push(`${s.key} is outside the ${layout.viewWidth}x${layout.viewHeight} view's safe area`);
    }
    if (!HUD_OVERLAY_KEYS.includes(s.key) && rectsOverlap(b, layout.board)) problems.push(`${s.key} overlaps the board`);
    if (rectsOverlap(b, layout.closeZone)) problems.push(`${s.key} is under the close button`);
  }
  for (const { name, rect } of cardRects(layout)) {
    if (rectsOverlap(rect, layout.closeZone)) problems.push(`${name} is under the close button`);
  }
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (HUD_OVERLAY_KEYS.includes(a.key) || HUD_OVERLAY_KEYS.includes(b.key)) continue;
      if (rectsOverlap(a.box, b.box)) problems.push(`${a.key} overlaps ${b.key}`);
    }
  }
  return problems;
}
