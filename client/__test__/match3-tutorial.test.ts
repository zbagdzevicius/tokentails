/**
 * Paw Match tutorial plate and glove geometry (plan G12 "Tutorial rewrite", G14 "Paw Match hint"):
 * the plate fits its text, stays inside the safe area (above the home indicator) and off the board
 * at 360, 390 (with iPhone insets) and landscape; the glove never covers the two glowing cells; the
 * copy is sentence case and follows the input device.
 */
import { BOARD_COLS, BOARD_ROWS, computeMatch3Layout, rectsOverlap, type Rect } from "@/components/Match3/hudLayout";
import {
  GLOVE_DEPTH,
  GLOVE_SIZE,
  PLATE_MIN_H,
  PLATE_PAD_X,
  PLATE_PAD_Y,
  TUTORIAL_COPY,
  WRONG_STROKE_MS,
  cellRect,
  gloveBox,
  gloveTrack,
  plateTextBox,
  tutorialMessage,
  tutorialPlateRect,
  type CellPos,
} from "@/components/Match3/tutorial";

const IPHONE = { top: 47, bottom: 34, left: 0, right: 0 };
const CASES: Array<{ name: string; w: number; h: number; insets?: typeof IPHONE }> = [
  { name: "360x740", w: 360, h: 740 },
  { name: "390x844", w: 390, h: 844 },
  { name: "390x844 iPhone insets", w: 390, h: 844, insets: IPHONE },
  { name: "844x390", w: 844, h: 390 },
  { name: "844x390 landscape insets", w: 844, h: 390, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
  { name: "740x360", w: 740, h: 360 },
  { name: "1440x900", w: 1440, h: 900 },
];

const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.w <= outer.x + outer.w + 0.5 &&
  inner.y + inner.h <= outer.y + outer.h + 0.5;

/** A rough text measure: a wrapped hint at 16 px, about 8 px per character. */
function fakeFit(message: string, maxWidth: number) {
  const lineChars = Math.max(1, Math.floor(maxWidth / 8));
  const lines = Math.ceil(message.length / lineChars);
  return { w: Math.min(maxWidth, message.length * 8), h: lines * 22 };
}

describe("tutorial plate layout", () => {
  it.each(CASES)("$name: the plate fits its text and stays in the safe area, off the board", ({ w, h, insets }) => {
    const layout = computeMatch3Layout(w, h, { insets });
    const region = layout.tutorial;
    const box = plateTextBox(region);
    for (const message of [TUTORIAL_COPY.intro.touch, TUTORIAL_COPY.intro.mouse, TUTORIAL_COPY.wrong]) {
      const text = fakeFit(message, box.maxWidth);
      const plate = tutorialPlateRect(region, text.w, text.h, layout.safe);
      expect(inside(plate, layout.safe)).toBe(true);
      expect(plate.x).toBeGreaterThanOrEqual(0);
      expect(plate.x + plate.w).toBeLessThanOrEqual(w);
      expect(plate.y + plate.h).toBeLessThanOrEqual(h - (insets?.bottom ?? 0));
      expect(rectsOverlap(plate, layout.board)).toBe(false);
      expect(rectsOverlap(plate, layout.closeZone)).toBe(false);
      expect(plate.h).toBeGreaterThanOrEqual(PLATE_MIN_H);
      // Sized to the text: no wider than text + padding unless the minimum applies.
      expect(plate.w).toBeLessThanOrEqual(Math.max(PLATE_MIN_H, Math.ceil(text.w) + 2 * PLATE_PAD_X));
      // The text fits inside the plate with its padding (when the region allows it).
      if (text.h + 2 * PLATE_PAD_Y <= region.h) expect(plate.h).toBeGreaterThanOrEqual(text.h + 2 * PLATE_PAD_Y);
    }
  });

  it("the text box never collapses", () => {
    expect(plateTextBox({ x: 0, y: 0, w: 10, h: 10 })).toEqual({ maxWidth: 40, maxHeight: 16 });
  });

  it("the safe rect clamps a plate pushed past the home indicator", () => {
    const safe = { x: 0, y: 47, w: 390, h: 763 };
    const plate = tutorialPlateRect({ x: 8, y: 790, w: 374, h: 80, overlay: "none" }, 200, 44, safe);
    expect(plate.y + plate.h).toBeLessThanOrEqual(safe.y + safe.h);
  });

  it("a plate over the stat cards is centred on them", () => {
    const region = { x: 0, y: 100, w: 300, h: 120, overlay: "cards" as const };
    const plate = tutorialPlateRect(region, 200, 44);
    expect(plate.y + plate.h / 2).toBeCloseTo(160, 0);
  });
});

describe("the plate never hides the clock or the score (5c review)", () => {
  // The scene hides any HUD text under the plate (tutorialHiddenHud). TIME and SCORE must never be
  // among them: the plate's whole region stays clear of both slots.
  const KEY_CASES = [
    { name: "360x740", w: 360, h: 740 },
    { name: "390x844 iPhone insets", w: 390, h: 844, insets: IPHONE },
    { name: "390x844", w: 390, h: 844 },
    { name: "844x390", w: 844, h: 390 },
    { name: "844x390 landscape insets", w: 844, h: 390, insets: { top: 0, bottom: 21, left: 47, right: 47 } },
  ];

  it.each(KEY_CASES)("$name", ({ w, h, insets }) => {
    const layout = computeMatch3Layout(w, h, { insets });
    const region = layout.tutorial;
    const box = plateTextBox(region);
    for (const message of [TUTORIAL_COPY.intro.touch, TUTORIAL_COPY.intro.mouse, TUTORIAL_COPY.wrong]) {
      const text = fakeFit(message, box.maxWidth);
      const plate = tutorialPlateRect(region, text.w, text.h, layout.safe);
      for (const key of ["timer", "score"] as const) {
        expect({ key, hidden: rectsOverlap(plate, layout.slots[key].box) }).toEqual({ key, hidden: false });
      }
    }
    expect(layout.tutorial.overlay).not.toBe("cards");
  });

  it("covers the stat cards only on short screens (under 700 px tall)", () => {
    for (const w of [320, 360, 375, 390, 414, 430]) {
      for (const h of [700, 740, 780, 844, 932]) {
        for (const insets of [undefined, IPHONE]) {
          const layout = computeMatch3Layout(w, h, { insets });
          expect({ w, h, insets: !!insets, overlay: layout.tutorial.overlay }).not.toEqual(
            expect.objectContaining({ overlay: "cards" }),
          );
        }
      }
    }
  });
});

describe("glove pointer", () => {
  const pairs = (): Array<[CellPos, CellPos]> => {
    const out: Array<[CellPos, CellPos]> = [];
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (col + 1 < BOARD_COLS) out.push([{ row, col }, { row, col: col + 1 }]);
        if (row + 1 < BOARD_ROWS) out.push([{ row, col }, { row: row + 1, col }]);
      }
    }
    return out;
  };

  it.each(CASES)("$name: never covers either glowing cell on its whole path", ({ w, h, insets }) => {
    const layout = computeMatch3Layout(w, h, { insets });
    const board = { x: layout.board.x, y: layout.board.y, tileSize: layout.tileSize, rows: BOARD_ROWS, cols: BOARD_COLS };
    for (const [from, to] of pairs()) {
      for (const [a, b] of [[from, to], [to, from]] as const) {
        const track = gloveTrack(a, b, board);
        const cells = [cellRect(a, board), cellRect(b, board)];
        for (let t = 0; t <= 1; t += 0.125) {
          const centre = { x: track.start.x + (track.end.x - track.start.x) * t, y: track.start.y + (track.end.y - track.start.y) * t };
          const glove = gloveBox(centre);
          for (const cell of cells) {
            if (rectsOverlap(glove, cell)) throw new Error(`${w}x${h} ${JSON.stringify([a, b])} at t=${t}: glove over a cell`);
          }
        }
        expect(rectsOverlap(gloveBox(track.mid), cells[0])).toBe(false);
      }
    }
  });

  it("points from below a horizontal pair and from above on the bottom row", () => {
    const board = { x: 0, y: 0, tileSize: 44, rows: 8, cols: 8 };
    expect(gloveTrack({ row: 3, col: 2 }, { row: 3, col: 3 }, board).side).toBe("below");
    expect(gloveTrack({ row: 7, col: 2 }, { row: 7, col: 3 }, board).side).toBe("above");
    expect(gloveTrack({ row: 2, col: 3 }, { row: 3, col: 3 }, board).side).toBe("right");
    expect(gloveTrack({ row: 2, col: 7 }, { row: 3, col: 7 }, board).side).toBe("left");
  });

  it("is a 32 px pointer above the plate and the HUD", () => {
    expect(GLOVE_SIZE).toBe(32);
    expect(GLOVE_DEPTH).toBe(95);
  });
});

describe("tutorial copy", () => {
  it("is sentence case (hint role, decision #86) and follows the input device", () => {
    for (const message of [TUTORIAL_COPY.intro.touch, TUTORIAL_COPY.intro.mouse, TUTORIAL_COPY.wrong]) {
      expect(message).toMatch(/^[A-Z][a-z]/);
      expect(message).not.toMatch(/[A-Z]{3,}/);
    }
    expect(tutorialMessage("touch", "intro")).toMatch(/^Swipe/);
    expect(tutorialMessage("mouse", "intro")).toMatch(/^Drag/);
    expect(tutorialMessage("touch", "wrong")).toBe("Follow the glow");
    expect(tutorialMessage("mouse", "wrong")).toBe("Follow the glow");
  });

  it("the wrong-swap stroke lasts 300 ms", () => {
    expect(WRONG_STROKE_MS).toBe(300);
  });
});
