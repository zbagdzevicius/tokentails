import { CAT_FRAME_PX } from "@/components/onboarding/PixelCat";
import { lobbyStage, type LobbyStage } from "@/constants/lobbyScene";

/**
 * The lobby composition (pure geometry, CSS px). The cat stands on the background's own altar:
 * its feet on the rune circle, wherever the cover-fit puts it. Everything else is placed around
 * that anchor so nothing covers the cat, the circle or each other:
 *
 * - top: the corner HUD (stats left; ABOUT ME with settings and sound in a row under it, right;
 *   fixed elsewhere, see components/audio/hudPlacement.ts), the guest pill (top centre; left of the
 *   logo on short landscape) and, from md up on tall screens, the impact strip.
 * - logo: centred in the sky between that top band and the name plate. Its emblem (the narrow top
 *   60%) may rise between the corner columns as long as the wide TOKEN TAILS line clears them.
 * - centre: the name plate with MY PETS a clear gap above the cat's head; the cat on the circle
 *   (centred on its painted columns), with a contact shadow under its feet.
 * - wings: four tiles (RESCUE + SHELTER left, HOME + the daily spin right) standing on the altar
 *   slab, in columns beside the cat on portrait phones and in rows on the slab everywhere else.
 * - bottom: where the impact strip does not fit at the top (phones, short screens), a one-line
 *   impact chip under the circle (top right on short landscape); then PACKS, PLAY and EVENTS on
 *   the altar steps, like the landing's PLAY GAME row, clear of the home indicator.
 */

export type LobbyMode = "portrait" | "short" | "wide";

/** The painted part of the 48 px frame, in frame px: rows head..feet (exclusive) and columns left..right. */
export interface SpriteBox {
  head: number;
  feet: number;
  left: number;
  right: number;
}

export interface LobbyLayoutInput {
  width: number;
  height: number;
  /** The guest pill is on screen (top centre, or left of the logo on short landscape). */
  pill: boolean;
  /** The guest pill's measured width (0 or absent before it is measured). */
  pillWidth?: number;
  /** The name plate row's natural width (name label, gap, MY PETS), when measured. */
  plateWidth?: number;
  /** Measured height of the impact strip (0 before it is measured). */
  stripHeight: number;
  safeTop?: number;
  safeBottom?: number;
  safeLeft?: number;
  safeRight?: number;
  /** The sprite's painted box, measured from the image when it can be read. */
  sprite?: Partial<SpriteBox>;
}

export interface LobbyWing {
  /** CSS position of the wing box (left/right edge and top), px. */
  left?: number;
  right?: number;
  top: number;
  direction: "row" | "column";
}

export interface LobbyLayout {
  mode: LobbyMode;
  rem: number;
  stage: LobbyStage;
  /** Integer scale of the 48 px cat frame. */
  scale: number;
  /** Where the cat's feet touch the circle. */
  feetY: number;
  cat: { left: number; top: number; size: number };
  /** The soft shadow under the feet: centre and size. */
  shadow: { cx: number; cy: number; width: number; height: number };
  /** The name plate row: its bottom edge, its maximum width and its height. */
  plate: { bottom: number; maxWidth: number; height: number };
  logo: { top: number; left: number; width: number; height: number };
  strip: { visible: boolean; top: number; width: number; stacked: boolean };
  /** Side length of the four tiles (`--lobby-tile`), px. */
  tile: number;
  /** The tiles stand on the slab: their bottom edge. */
  standY: number;
  leftWing: LobbyWing;
  rightWing: LobbyWing;
  /** The PACKS / PLAY / EVENTS row, centred on the circle. */
  dock: { centerY: number; playScale: number; buttonScale: number; gap: number; height: number };
  /** The one-line impact chip, where the strip is not shown: its box (left edge, top, size). */
  chip: { visible: boolean; left: number; top: number; width: number; height: number };
}

/** Breakpoints, as in tailwind.config.ts (`md` is 667 px) and the existing short-landscape rules. */
export const MD = 667;
const SHORT_MAX_HEIGHT = 500;
const STRIP_MIN_HEIGHT = 641;

/**
 * The painted box a 48 px cat uses when it cannot be measured: starters and catalogue GIFs end on
 * row 37; the columns are a generous guess (tails reach far).
 */
export const DEFAULT_SPRITE_BOX: SpriteBox = { head: 1, feet: 37, left: 4, right: 44 };

/** The logo image's aspect (logo/logo-text.webp is 600 x 337). */
export const LOGO_ASPECT = 337 / 600;
/**
 * The logo's shape: the cat emblem fills the top 60% of its height and at most 45% of its width;
 * the TOKEN TAILS line under it is full width.
 */
const LOGO_EMBLEM_H = 0.6;
const LOGO_EMBLEM_W = 0.45;

/**
 * The gap between the top of the cat's head and the name plate: a clear caption, not a hat
 * (12 px on short landscape, where every pixel of height counts).
 */
export const plateGap = (scale: number, short = false) => Math.max(short ? 12 : 16, 2 * scale);
/** The impact chip's height with its two-line paw text (short landscape, top right). */
const CHIP_TWO_LINE_H = 52;

/** Root font size. Phones scale `rem` with the width; large screens step it up (styles/globals.scss). */
export function lobbyRem(width: number, height = 0): number {
  if (width <= 640) return width / 25;
  if (width >= 2200 && height >= 1300) return 24;
  if (width >= 1600 && height >= 1000) return 20;
  return 16;
}

export function lobbyMode(width: number, height: number): LobbyMode {
  if (height <= SHORT_MAX_HEIGHT && width > height) return "short";
  // Portrait phones stack the tiles in columns beside the cat; from a 768 px tablet up there is
  // room for rows on the slab.
  if (width < MD || (width < height && width < 768)) return "portrait";
  return "wide";
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function lobbyLayout({
  width: W,
  height: H,
  pill,
  pillWidth: pillWidthIn = 0,
  plateWidth = 0,
  stripHeight,
  safeTop = 0,
  safeBottom = 0,
  safeLeft = 0,
  safeRight = 0,
  sprite: spriteIn,
}: LobbyLayoutInput): LobbyLayout {
  const sprite = { ...DEFAULT_SPRITE_BOX, ...spriteIn };
  const mode = lobbyMode(W, H);
  const short = mode === "short";
  const phone = W < MD;
  const r = lobbyRem(W, H);
  const stage = lobbyStage(W, H);
  const { cx, cy, rx, ry } = stage;
  const circleTop = cy - ry;
  const circleBottom = cy + ry;

  // The corner HUD (GameStatsSection + hudPlacement): inset past the safe areas. Left: the stats
  // panel and PROGRESS (5rem wide). Right: ABOUT ME (5rem) with settings and sound in a row under it.
  const hudTop = Math.max(r, safeTop);
  const hudLeft = Math.max(r, safeLeft);
  const hudRight = Math.max(r, safeRight);
  const hudButton = Math.max(44, 2.75 * r);
  const leftColBottom = hudTop + 9.8 * r;
  const rightColBottom = hudTop + 5.5 * r + hudButton;
  const leftInner = hudLeft + 5 * r;
  const rightInner = hudRight + Math.max(5 * r, 2 * hudButton + 0.5 * r);
  const cornerBottom = Math.max(leftColBottom, rightColBottom);
  /** Half the width of the sky between the corner columns, around the centre line. */
  const centreHalf = Math.min(cx - leftInner, W - rightInner - cx) - 12;

  // Guest pill (Game.tsx): top centre.
  const pillH = Math.max(44, 2.75 * r);
  const pillW = pill ? pillWidthIn || (W >= MD ? 220 : 170) : 0;

  // Impact strip (md+ and taller than 640 px): a top bar between the corner columns.
  const stripVisible = !short && W >= MD && H >= STRIP_MIN_HEIGHT;
  const stripTop = pill ? hudTop + pillH + 12 : hudTop;
  const stripWidth = Math.min(W - 2 * (Math.max(leftInner, rightInner) + 16), 72 * r);
  const stripStacked = stripWidth < 60 * r;
  const stripBottom = stripTop + Math.max(stripHeight, stripStacked ? 100 : 64);

  // The top of the sky the logo sits in. On short landscape the logo moves to the top left, beside
  // the stats panel, and the plate may rise to just under the pill.
  const bandTop = stripVisible ? stripBottom + 12 : pill ? hudTop + pillH + (short ? 8 : 12) : hudTop;

  // The impact chip, where the strip is not shown: under the circle, or top right on short screens.
  const chipH = Math.max(44, 2.75 * r);
  let chipBelow = !stripVisible && !short;

  // The dock: PLAY is PixelButton lg (3rem tall, drawn 1.25x on phones and 2x from md up);
  // PACKS / EVENTS are md buttons at least 44 px tall.
  const playFull = (phone ? 3.75 : 6) * r;
  let playScale = short ? 0.6 : 1;
  const buttonH = Math.max(44, 3 * r);
  const dockFloor = H - safeBottom - (short ? 8 : 12);
  const dockCeil = circleBottom + 8;
  if (chipBelow && dockFloor - dockCeil < chipH + 10 + Math.max(playFull * 0.8, buttonH)) chipBelow = false;
  let dockH = Math.max(playFull * playScale, buttonH);
  let buttonScale = 1;
  const room = dockFloor - dockCeil - (chipBelow ? chipH + 10 : 0);
  if (room < dockH) {
    playScale = Math.max(0.45, Math.min(playScale, room / playFull));
    buttonScale = Math.max(0.8, Math.min(1, room / buttonH));
    dockH = Math.max(playFull * playScale, buttonH * buttonScale);
  }
  let dockCenterY: number;
  let chipTop = 0;
  if (chipBelow) {
    // The chip and the dock share the steps under the circle with even gaps.
    const g = Math.max(8, (dockFloor - circleBottom - chipH - dockH) / 3);
    chipTop = circleBottom + g;
    dockCenterY = Math.min(dockFloor - dockH / 2, chipTop + chipH + g + dockH / 2);
  } else {
    const dockPref = (circleBottom + 8 + dockFloor) / 2;
    dockCenterY = clamp(dockPref, dockCeil + dockH / 2, dockFloor - dockH / 2);
  }

  // Where tiles stand: on the slab, between its back edge and the circle, a little clear of the glow.
  const standY = Math.min(stage.slabTop + 0.5 * Math.max(0, circleTop - stage.slabTop), circleTop - 6);
  const tileGap = Math.round(0.75 * r);

  // The cat: the largest integer scale whose feet stay on the circle, that leaves room for a logo
  // and the plate above it, and (portrait) leaves room for the tile columns beside it.
  const feetY = cy + 0.25 * ry;
  const plateH = Math.max(44, 3 * r);
  const minLogoH = short ? 40 : Math.max(56, 0.14 * H);
  const minGap = short ? 12 : 24;
  /** Half the painted width, and the painted centre, in frame px. */
  const paintedHalf = (sprite.right - sprite.left) / 2;
  const paintedMid = (sprite.left + sprite.right) / 2;
  const catClear = phone ? 20 : 16;
  // The painted cat stays within the circle (under half of it on wide screens).
  const widthFactor = mode === "wide" ? 0.45 : 1.0;
  const kMax = W >= 2200 ? 12 : 10;
  const portraitColLeft = (tile: number) => Math.max(hudLeft, cx - rx - 12 - tile);
  let scale = 2;
  let tile = Math.round(5 * r);
  for (let k = kMax; k >= 2; k--) {
    // The wide-screen size caps never push the cat below 3x (readable pixel art).
    const capped = mode !== "wide" || k > 3;
    if (capped && 2 * paintedHalf * k > Math.min(widthFactor * 2 * rx, phone ? Infinity : 0.3 * W)) continue;
    // On wide screens the cat stays under a seventh of the screen tall: the hero, not a wall.
    if (mode === "wide" && k > 3 && (sprite.feet - sprite.head) * k > 0.14 * H) continue;
    const plateTop = feetY - (sprite.feet - sprite.head) * k - plateGap(k, short) - plateH;
    if (plateTop - bandTop < (short ? 0 : minLogoH + 2 * minGap)) continue;
    if (mode === "portrait") {
      // Columns beside the cat: the tile shrinks to 4.25rem before the cat does.
      const clearX = cx - paintedHalf * k - catClear;
      let t = Math.round(5 * r);
      while (t > 4.25 * r && portraitColLeft(t) + t > clearX) t -= 1;
      if (portraitColLeft(t) + t > clearX) continue;
      tile = t;
    }
    scale = k;
    break;
  }
  const size = CAT_FRAME_PX * scale;
  const catLeft = cx - paintedMid * scale;
  const catTop = feetY - sprite.feet * scale;
  const headTop = feetY - (sprite.feet - sprite.head) * scale;
  let plateBottom = headTop - plateGap(scale, short);
  let plateTop = plateBottom - plateH;
  const catPaintedLeft = cx - paintedHalf * scale;

  // Wings.
  let leftWing: LobbyWing;
  let rightWing: LobbyWing;
  let wingsTop: number;
  let wingInnerL: number; // the inner (altar-side) edge of the left wing, x
  if (mode === "portrait") {
    // A long name needs the plate clear of the columns: shrink the tiles (to 4.25rem) so the
    // columns fit under the plate before lifting the plate off the head.
    const fits = (t: number) => plateWidth > 0 && plateWidth <= 2 * (cx - portraitColLeft(t) - t) - 16;
    if (!fits(tile)) {
      while (tile > 4.25 * r && standY - (2 * tile + tileGap) < plateBottom + 8) tile -= 1;
    }
    const colH = 2 * tile + tileGap;
    const colLeft = portraitColLeft(tile);
    // Under the corner HUD and, when there is room, under the name plate (the plate keeps the
    // full width); the columns end on the slab, clear of the rune circle's glow.
    wingsTop = Math.max(standY - colH, cornerBottom + 12, plateBottom + 8);
    if (wingsTop + colH > standY) wingsTop = Math.max(cornerBottom + 12, standY - colH);
    // Columns beside the plate: fine when the plate fits between them. Otherwise (a long name)
    // lift the plate a little instead (up to 64 px over the head), so the name keeps the full width.
    const lift = plateBottom + 8 - wingsTop;
    if (lift > 0 && lift <= 64 && !fits(tile)) {
      plateBottom -= lift;
      plateTop -= lift;
    }
    leftWing = { left: colLeft, top: wingsTop, direction: "column" };
    const colRight = Math.max(hudRight, W - cx - rx - 12 - tile);
    rightWing = { right: colRight, top: wingsTop, direction: "column" };
    wingInnerL = colLeft + tile;
  } else {
    // Rows on the slab beside the circle; where the screen is too narrow for that, the rows move
    // in over the back of the slab (still clear of the cat) before the tiles shrink.
    const inset = short ? 16 : 24;
    const sideClear = short ? Math.max(8, safeLeft, safeRight) : Math.max(hudLeft, hudRight);
    const minLeft = sideClear + (standY - tile < leftColBottom + 8 ? 5 * r + 8 : 0);
    const need = 2 * tile + tileGap;
    const inner = clamp(minLeft + need, cx - rx - inset, Math.max(cx - rx - inset, catPaintedLeft - catClear));
    tile = Math.max(Math.round(3.5 * r), Math.min(tile, Math.floor((inner - minLeft - tileGap) / 2)));
    wingsTop = standY - tile;
    leftWing = { right: W - inner, top: wingsTop, direction: "row" };
    rightWing = { left: W - inner, top: wingsTop, direction: "row" };
    wingInnerL = inner;
  }

  // The plate row: the full width once it is clear of the wings and the corner columns.
  const besideWings = wingsTop < plateBottom + 4;
  const besideCorners = plateTop < cornerBottom + 4;
  let plateMaxWidth = mode === "portrait" ? Math.min(W - 32, 2 * rx) : Math.min(W - 32, 2 * rx + 160);
  if (besideWings) plateMaxWidth = Math.min(plateMaxWidth, 2 * (cx - wingInnerL) - 16);
  if (besideCorners) plateMaxWidth = Math.min(plateMaxWidth, 2 * centreHalf);

  // Logo. Short landscape: top left, beside the stats panel and clear of the pill and the wings.
  // Elsewhere: as large as fits (capped), centred in the sky between the top band and the plate;
  // its emblem may rise between the corner columns while its wide text line stays below them.
  let logoW: number;
  let logoTop: number;
  let logoLeft: number;
  if (short) {
    logoLeft = leftInner + 16;
    const right = pill ? cx - pillW / 2 - 16 : cx - Math.min(plateMaxWidth, 2 * rx) / 2 - 16;
    const bottom = Math.min(wingsTop, pill ? Infinity : plateTop) - 12;
    logoW = Math.max(64, Math.floor(Math.min(right - logoLeft, 0.24 * H / LOGO_ASPECT, (bottom - hudTop) / LOGO_ASPECT)));
    logoTop = hudTop;
  } else {
    const logoBottomMax = plateTop - minGap;
    const wingsCap = wingsTop < logoBottomMax ? 2 * (cx - wingInnerL) - 24 : Infinity;
    const maxW = Math.min(
      W - 32,
      wingsCap,
      phone ? 18 * r : 0.42 * W,
      (mode === "portrait" ? 0.22 * H : 0.2 * H) / LOGO_ASPECT,
    );
    /** The highest the logo's top may sit, for a logo `w` wide (Infinity: it does not fit). */
    const logoLo = (w: number) => {
      const h = w * LOGO_ASPECT;
      let lo = bandTop;
      if (LOGO_EMBLEM_W * w > 2 * centreHalf) lo = Math.max(lo, cornerBottom + 8);
      else if (w > 2 * centreHalf) lo = Math.max(lo, cornerBottom + 8 - LOGO_EMBLEM_H * h);
      return lo + h <= logoBottomMax ? lo : Infinity;
    };
    logoW = Math.floor(maxW);
    while (logoW > 96 && logoLo(logoW) === Infinity) logoW -= 2;
    const h = logoW * LOGO_ASPECT;
    const lo = Math.min(logoLo(logoW), logoBottomMax - h);
    // Equal sky above and below, within what the corners and the plate allow.
    logoTop = clamp((bandTop + plateTop - h) / 2, lo, Math.max(lo, logoBottomMax - h));
    logoLeft = cx - logoW / 2;
  }
  const logoH = logoW * LOGO_ASPECT;

  // The impact chip: under the circle, or (short landscape) top right, between the pill and the
  // corner column, where a readable chip fits.
  let chip = { visible: false, left: 0, top: 0, width: 0, height: chipH };
  if (chipBelow) {
    const cw = Math.min(W - 32, 22 * r);
    chip = { visible: true, left: cx - cw / 2, top: chipTop, width: cw, height: chipH };
  } else if (!stripVisible) {
    const left = cx + (pill ? pillW / 2 : 0) + 16;
    const right = W - rightInner - 12;
    const cw = Math.min(right - left, 17 * r);
    if (cw >= 150) chip = { visible: true, left: right - cw, top: hudTop, width: cw, height: CHIP_TWO_LINE_H };
  }
  // Short landscape: the plate stays clear of the top-left logo, and of the chip unless it is below it.
  if (short) {
    plateMaxWidth = Math.min(plateMaxWidth, 2 * (cx - (logoLeft + logoW) - 12));
    if (chip.visible && chip.top + chip.height + 6 > plateTop) plateMaxWidth = Math.min(plateMaxWidth, 2 * (chip.left - 12 - cx));
  }

  // Contact shadow under the feet.
  const paintedW = (sprite.right - sprite.left) * scale;
  const shadowW = Math.round(0.7 * paintedW);

  return {
    mode,
    rem: r,
    stage,
    scale,
    feetY,
    cat: { left: catLeft, top: catTop, size },
    shadow: { cx, cy: feetY - 1, width: shadowW, height: Math.max(6, Math.round(shadowW * 0.22)) },
    plate: { bottom: plateBottom, maxWidth: Math.round(plateMaxWidth), height: plateH },
    logo: { top: logoTop, left: logoLeft, width: logoW, height: logoH },
    strip: { visible: stripVisible, top: stripTop, width: stripWidth, stacked: stripStacked },
    tile,
    standY,
    leftWing,
    rightWing,
    dock: { centerY: dockCenterY, playScale, buttonScale, gap: phone ? 12 : Math.round(1.25 * r), height: dockH },
    chip,
  };
}
