/**
 * Paw Match HUD layout (plan G12, F10 `layoutHud()`): every HUD text has its own slot box, the
 * boxes never overlap each other or the board, and they stay inside the view, at every viewport the
 * game supports (the F1 four plus tablets and short phones).
 */
import {
  BOARD_FRAME_MARGIN,
  BOARD_SLACK_ABOVE,
  computeMatch3Layout,
  layoutProblems,
  rectsOverlap,
  type HudKey,
} from "@/components/Match3/hudLayout";
import { TYPE_ROLES } from "@/components/typography/roles";

const VIEWPORTS: Array<[number, number]> = [
  [390, 844],
  [360, 740],
  [375, 667],
  [320, 640],
  [414, 896],
  [844, 390],
  [740, 360],
  [932, 430],
  [768, 1024],
  [1024, 768],
  [1024, 700],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
];

describe("computeMatch3Layout", () => {
  it.each(VIEWPORTS)("%ix%i: no HUD slot overlaps another, the board, or the view edge", (w, h) => {
    const layout = computeMatch3Layout(w, h);
    expect(layoutProblems(layout)).toEqual([]);
  });

  it.each(VIEWPORTS)("%ix%i: tiles stay touch-sized and the board stays in view", (w, h) => {
    const layout = computeMatch3Layout(w, h);
    // 44 px tiles where the screen allows; short phones (the tight stack) go down to 40, and never
    // wider than eight tiles fit.
    const floor = layout.mode === "smallLandscape" ? 30 : Math.min(h < 700 ? 40 : 44, Math.floor((w - 8) / 8));
    expect(layout.tileSize).toBeGreaterThanOrEqual(floor);
    expect(layout.board.x).toBeGreaterThanOrEqual(0);
    expect(layout.board.x + layout.board.w).toBeLessThanOrEqual(w);
    expect(layout.board.y).toBeGreaterThanOrEqual(0);
  });

  it.each(VIEWPORTS)("%ix%i: slot sizes respect the role minimums and fit their boxes", (w, h) => {
    const layout = computeMatch3Layout(w, h);
    for (const [key, slot] of Object.entries(layout.slots)) {
      if (layout.mode === "smallLandscape" && key === "title") continue;
      expect(slot.size).toBeGreaterThanOrEqual(TYPE_ROLES[slot.role].minPx);
      // The cap height (about 0.72 em for the display faces) of the starting size fits the box.
      expect(slot.size * 0.72).toBeLessThanOrEqual(slot.box.h);
    }
  });

  it("portrait phones stack the streak line between the title plate and the stat cards", () => {
    const layout = computeMatch3Layout(390, 844);
    expect(layout.mode).toBe("standard");
    const plate = layout.title!.plate;
    const streak = layout.slots.streak.box;
    expect(streak.y).toBeGreaterThanOrEqual(plate.y + plate.h / 2);
    for (const card of layout.cards) {
      const rect = { x: card.x - card.w / 2, y: card.y - card.h / 2, w: card.w, h: card.h };
      expect(rectsOverlap(rect, streak)).toBe(false);
    }
  });

  it("the stat cards never overlap each other or the board frame", () => {
    for (const [w, h] of VIEWPORTS) {
      const layout = computeMatch3Layout(w, h);
      const rects = layout.cards.map((c) => ({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h }));
      const frame = {
        x: layout.board.x - BOARD_FRAME_MARGIN,
        y: layout.board.y - BOARD_FRAME_MARGIN,
        w: layout.board.w + 2 * BOARD_FRAME_MARGIN,
        h: layout.board.h + 2 * BOARD_FRAME_MARGIN,
      };
      rects.forEach((a, i) => {
        if (rectsOverlap(a, frame)) throw new Error(`${w}x${h}: card ${i} overlaps the board frame`);
        rects.slice(i + 1).forEach((b) => expect(rectsOverlap(a, b)).toBe(false));
      });
    }
  });

  const frameOf = (layout: ReturnType<typeof computeMatch3Layout>) => ({
    x: layout.board.x - BOARD_FRAME_MARGIN,
    y: layout.board.y - BOARD_FRAME_MARGIN,
    w: layout.board.w + 2 * BOARD_FRAME_MARGIN,
    h: layout.board.h + 2 * BOARD_FRAME_MARGIN,
  });
  const cardRect = (c: { x: number; y: number; w: number; h: number }) => ({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h });

  it.each(VIEWPORTS)("%ix%i: the tutorial panel stays in view and off the board frame and the bottom stack", (w, h) => {
    const layout = computeMatch3Layout(w, h);
    const t = layout.tutorial;
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.y).toBeGreaterThanOrEqual(0);
    expect(t.x + t.w).toBeLessThanOrEqual(w);
    expect(t.y + t.h).toBeLessThanOrEqual(h);
    expect(t.h).toBeGreaterThanOrEqual(48);
    // A narrow panel wraps the hint to three lines: keep room for them.
    if (t.w < 300) expect(t.h).toBeGreaterThanOrEqual(90);
    expect(rectsOverlap(t, frameOf(layout))).toBe(false);
    // Covered on purpose only: the bottom stack's lines (overlay "stack"), the stat cards
    // (overlay "cards") or a side panel's free part, over the combo and mission lines (hidden while
    // the tutorial shows). A side panel plate never covers TIME or SCORE (5c review).
    const allowed: HudKey[] =
      t.overlay === "stack"
        ? ["combo", "mission", "reward", "fever"]
        : t.overlay === "cards"
        ? ["timer", "score", "best", "target", "moves"]
        : t.overlay === "panel"
          ? ["combo", "mission", "moves", "target", "streak", "title"]
          : [];
    for (const slot of Object.values(layout.slots)) {
      if (slot.key === "burst" || allowed.includes(slot.key)) continue;
      if (layout.mode === "smallLandscape" && slot.key === "title") continue;
      if (rectsOverlap(t, slot.box)) throw new Error(`${w}x${h}: tutorial (${t.overlay}) overlaps ${slot.key}`);
    }
    if (t.overlay === "none" || t.overlay === "stack") {
      for (const card of layout.cards) expect(rectsOverlap(t, cardRect(card))).toBe(false);
    }
  });

  it("tall phones keep the tutorial panel clear of everything", () => {
    for (const [w, h] of [[390, 844], [414, 896]] as const) {
      expect(computeMatch3Layout(w, h).tutorial.overlay).toBe("none");
    }
  });

  it("an iPhone with notch and home indicator keeps the stat cards readable under the tutorial", () => {
    // 390x844 with 47 px top and 34 px bottom insets: no room under the stack, so the plate takes
    // the stack's place under the board instead of covering the clock.
    const layout = computeMatch3Layout(390, 844, { insets: { top: 47, bottom: 34 } });
    expect(layout.tutorial.overlay).toBe("stack");
    const t = layout.tutorial;
    expect(t.y + t.h).toBeLessThanOrEqual(layout.safe.y + layout.safe.h);
    expect(t.y).toBeGreaterThanOrEqual(layout.board.y + layout.board.h + BOARD_FRAME_MARGIN);
  });

  it.each(VIEWPORTS)("%ix%i: score and best sit inside the card's inner frame with a gap", (w, h) => {
    const layout = computeMatch3Layout(w, h);
    if (layout.mode !== "standard") return;
    const card = cardRect(layout.cards[1]);
    const score = layout.slots.score.box;
    const best = layout.slots.best.box;
    expect(score.y).toBeGreaterThanOrEqual(card.y + 8);
    expect(best.y + best.h).toBeLessThanOrEqual(card.y + card.h - 8);
    expect(best.y - (score.y + score.h)).toBeGreaterThanOrEqual(2);
  });

  it.each(VIEWPORTS)("%ix%i: portrait boards leave no empty band above them", (w, h) => {
    const layout = computeMatch3Layout(w, h);
    if (layout.mode !== "standard") return;
    // The stat cards end, then the objective row and progress bar, then the board frame.
    const cardsBottom = Math.max(...layout.cards.map((c) => c.y + c.h / 2));
    const objectiveTop = Math.min(layout.slots.objective.box.y, layout.slots.stars.box.y);
    expect(objectiveTop - cardsBottom).toBeLessThanOrEqual(10 + 4 + BOARD_SLACK_ABOVE);
  });

  it.each(VIEWPORTS)("%ix%i: the objective icon is a whole catnip master size", (w, h) => {
    const layout = computeMatch3Layout(w, h);
    expect([16, 24, 32]).toContain(layout.objectiveIcon.size);
    // Phones get at least 24 px where the stack is not tight.
    if (layout.mode === "standard" && w <= 430 && h >= 740) expect(layout.objectiveIcon.size).toBeGreaterThanOrEqual(24);
  });

  it("layoutProblems reports a deliberate overlap", () => {
    const layout = computeMatch3Layout(390, 844);
    const broken = {
      ...layout,
      slots: { ...layout.slots, mission: { ...layout.slots.mission, box: layout.slots.combo.box } },
    };
    expect(layoutProblems(broken, ["combo", "mission"] as HudKey[])).toEqual(["combo overlaps mission"]);
  });
});
