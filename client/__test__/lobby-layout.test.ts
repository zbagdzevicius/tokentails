import { lobbyLayout, lobbyMode, lobbyRem, LOGO_ASPECT } from "@/components/game/lobbyLayout";
import { LOBBY_BG_POSITION, LOBBY_BG_SIZE, lobbyStage } from "@/constants/lobbyScene";

const SIZES: [number, number][] = [
  [360, 740],
  [390, 844],
  [430, 932],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
];

/** The measured box of the default starter (Scout): rows 11..37, columns 9..41. */
const SCOUT = { head: 11, feet: 37, left: 9, right: 41 };

type Box = { x: number; y: number; r: number; b: number };
const overlaps = (a: Box, c: Box) => Math.min(a.r, c.r) > Math.max(a.x, c.x) && Math.min(a.b, c.b) > Math.max(a.y, c.y);

/** The wing boxes (two tiles each) of a layout, in viewport px. */
function wingBoxes(l: ReturnType<typeof lobbyLayout>, width: number): Box[] {
  const gap = Math.round(0.75 * l.rem);
  return [l.leftWing, l.rightWing].map((w) => {
    const wide = w.direction === "row" ? 2 * l.tile + gap : l.tile;
    const tall = w.direction === "row" ? l.tile : 2 * l.tile + gap;
    const x = w.left !== undefined ? w.left : width - (w.right ?? 0) - wide;
    return { x, y: w.top, r: x + wide, b: w.top + tall };
  });
}

/** Does a box reach into the rune circle's ellipse? */
function inEllipse(box: Box, cx: number, cy: number, rx: number, ry: number) {
  for (let i = 0; i <= 10; i++)
    for (let j = 0; j <= 10; j++) {
      const px = box.x + ((box.r - box.x) * i) / 10;
      const py = box.y + ((box.b - box.y) * j) / 10;
      if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 < 1) return true;
    }
  return false;
}

describe("lobby layout", () => {
  it("picks a mode per screen shape", () => {
    expect(lobbyMode(390, 844)).toBe("portrait");
    expect(lobbyMode(768, 1024)).toBe("wide");
    expect(lobbyMode(700, 1000)).toBe("portrait");
    expect(lobbyMode(844, 390)).toBe("short");
    expect(lobbyMode(1440, 900)).toBe("wide");
  });

  it("steps the HUD size up on large screens, like globals.scss", () => {
    expect(lobbyRem(390, 844)).toBeCloseTo(15.6, 5);
    expect(lobbyRem(1440, 900)).toBe(16);
    expect(lobbyRem(1920, 1080)).toBe(20);
    expect(lobbyRem(2560, 1440)).toBe(24);
  });

  it.each(SIZES)("%ix%i: the rune circle is exactly at the screen centre, the image covers the screen", (width, height) => {
    const s = lobbyStage(width, height);
    expect(s.cx).toBeCloseTo(width / 2, 5);
    expect(s.left).toBeLessThanOrEqual(1e-6);
    expect(s.left + s.imageWidth).toBeGreaterThanOrEqual(width - 1e-6);
    expect(s.imageHeight).toBeGreaterThanOrEqual(height - 1e-6);
    expect(LOBBY_BG_POSITION).toContain("0.5087");
    expect(LOBBY_BG_SIZE).toMatch(/^max\(/);
  });

  it.each(SIZES)("%ix%i: the cat stands on the circle; logo, plate, tiles and dock never collide", (width, height) => {
    for (const sprite of [undefined, SCOUT]) {
      const l = lobbyLayout({ width, height, pill: true, stripHeight: 90, sprite });
      const box = { head: 1, feet: 37, left: 4, right: 44, ...sprite };
      const { cx, cy, rx, ry } = l.stage;
      // Integer scale, centred on the circle, feet inside the ellipse.
      expect(Number.isInteger(l.scale)).toBe(true);
      expect(l.scale).toBeGreaterThanOrEqual(3);
      // Centred on its painted columns, not on the 48 px frame.
      expect(l.cat.left + ((box.left + box.right) / 2) * l.scale).toBeCloseTo(cx, 5);
      expect(Math.abs(l.feetY - cy)).toBeLessThanOrEqual(ry);
      // The logo sits above the plate with at least 24 px between them; on short landscape it
      // moves to the top left, beside the plate instead of over it.
      const plateTop = l.plate.bottom - l.plate.height;
      const gap = plateTop - (l.logo.top + l.logo.height);
      expect(l.logo.top).toBeGreaterThanOrEqual(0);
      expect(l.logo.height).toBeCloseTo(l.logo.width * LOGO_ASPECT, 0);
      if (l.mode === "short") {
        expect(l.logo.left + l.logo.width).toBeLessThanOrEqual(cx - l.plate.maxWidth / 2 - 11.5);
      } else {
        expect(gap).toBeGreaterThanOrEqual(23.5);
        expect(l.logo.left + l.logo.width / 2).toBeCloseTo(cx, 5);
      }
      // The plate floats a clear gap over the head; it has room for a name beside MY PETS.
      expect(l.feetY - (box.feet - box.head) * l.scale - l.plate.bottom).toBeGreaterThanOrEqual(l.mode === "short" ? 12 : 16);
      expect(l.plate.maxWidth).toBeGreaterThanOrEqual(180);
      // Tiles: on screen, clear of the cat, the plate row, the circle and the dock.
      const cat: Box = {
        x: l.cat.left + box.left * l.scale,
        r: l.cat.left + box.right * l.scale,
        y: l.feetY - (box.feet - box.head) * l.scale,
        b: l.feetY,
      };
      const plate: Box = { x: cx - l.plate.maxWidth / 2, r: cx + l.plate.maxWidth / 2, y: plateTop, b: l.plate.bottom };
      const dock: Box = { x: 0, r: width, y: l.dock.centerY - l.dock.height / 2, b: l.dock.centerY + l.dock.height / 2 };
      for (const w of wingBoxes(l, width)) {
        expect(w.x).toBeGreaterThanOrEqual(0);
        expect(w.r).toBeLessThanOrEqual(width);
        expect(overlaps(w, cat)).toBe(false);
        expect(overlaps(w, plate)).toBe(false);
        expect(overlaps(w, dock)).toBe(false);
        expect(inEllipse(w, cx, cy, rx, ry)).toBe(false);
      }
      expect(l.tile).toBeGreaterThanOrEqual(56);
      // Every tile stands on the slab, at least 6 px clear of the circle's top.
      for (const w of wingBoxes(l, width)) expect(w.b).toBeLessThanOrEqual(cy - ry - 6 + 1e-6);
      // The impact chip (where the strip is hidden) is on screen and clear of the tiles and dock.
      expect(l.chip.visible || l.strip.visible).toBe(true);
      if (l.chip.visible) {
        const chip: Box = { x: l.chip.left, r: l.chip.left + l.chip.width, y: l.chip.top, b: l.chip.top + l.chip.height };
        expect(chip.x).toBeGreaterThanOrEqual(0);
        expect(chip.r).toBeLessThanOrEqual(width);
        expect(overlaps(chip, dock)).toBe(false);
        for (const w of wingBoxes(l, width)) expect(overlaps(chip, w)).toBe(false);
        expect(inEllipse(chip, cx, cy, rx, ry)).toBe(false);
      }
      // The dock is below the circle's centre and on screen.
      expect(l.dock.centerY).toBeGreaterThan(cy);
      expect(dock.b).toBeLessThanOrEqual(height);
    }
  });

  it("keeps the dock and the corner HUD clear of the safe areas", () => {
    // iPhone landscape: home indicator 21 px, camera cutout 47 px on the left.
    const l = lobbyLayout({ width: 844, height: 390, pill: true, stripHeight: 0, safeBottom: 21, safeLeft: 47, safeRight: 47 });
    expect(l.dock.centerY + l.dock.height / 2).toBeLessThanOrEqual(390 - 21);
    for (const w of wingBoxes(l, 844)) {
      expect(w.x).toBeGreaterThanOrEqual(47);
      expect(w.r).toBeLessThanOrEqual(844 - 47);
    }
    // Notched portrait phone: the logo stays under the corner panels' and the pill's top inset.
    const p = lobbyLayout({ width: 390, height: 844, pill: true, stripHeight: 0, safeTop: 47, safeBottom: 34 });
    expect(p.logo.top).toBeGreaterThanOrEqual(47 + 44);
    expect(p.dock.centerY + p.dock.height / 2).toBeLessThanOrEqual(844 - 34);
  });

  it("grows the tiles with the HUD on large screens", () => {
    expect(lobbyLayout({ width: 1440, height: 900, pill: true, stripHeight: 80 }).tile).toBe(80);
    expect(lobbyLayout({ width: 2560, height: 1440, pill: true, stripHeight: 80 }).tile).toBe(120);
  });
});
