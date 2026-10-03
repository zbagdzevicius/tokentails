import { pickZoom, ZOOM_TARGETS } from "@/components/Phaser/look/pickZoom";
import { createRng, hashString } from "@/components/Phaser/look/rng";

// F10 / G7: integer camera zoom. `zoom` is backing-store pixels per art pixel, so any integer
// keeps pixel art crisp; it is the largest one that still shows the preset's tiles.
describe("pickZoom", () => {
  const table: Array<{
    name: string;
    width: number;
    height: number;
    dpr: number;
    preset: "hub" | "platformer";
    zoom: number;
    orientation: "landscape" | "portrait";
  }> = [
    // Phones (dpr already capped at 2)
    { name: "390x844 portrait hub", width: 390, height: 844, dpr: 2, preset: "hub", zoom: 3, orientation: "portrait" },
    { name: "390x844 portrait platformer", width: 390, height: 844, dpr: 2, preset: "platformer", zoom: 2, orientation: "portrait" },
    { name: "360x740 portrait platformer", width: 360, height: 740, dpr: 2, preset: "platformer", zoom: 2, orientation: "portrait" },
    { name: "844x390 landscape hub", width: 844, height: 390, dpr: 2, preset: "hub", zoom: 3, orientation: "landscape" },
    { name: "844x390 landscape platformer", width: 844, height: 390, dpr: 2, preset: "platformer", zoom: 2, orientation: "landscape" },
    { name: "low-memory 1.5x phone", width: 360, height: 740, dpr: 1.5, preset: "platformer", zoom: 1, orientation: "portrait" },
    // Desktop
    { name: "1440x900 hub", width: 1440, height: 900, dpr: 1, preset: "hub", zoom: 3, orientation: "landscape" },
    { name: "1440x900 platformer", width: 1440, height: 900, dpr: 1, preset: "platformer", zoom: 3, orientation: "landscape" },
    { name: "1920x1080 platformer", width: 1920, height: 1080, dpr: 1, preset: "platformer", zoom: 3, orientation: "landscape" },
    { name: "2560x1440 retina hub", width: 1280, height: 720, dpr: 2, preset: "hub", zoom: 5, orientation: "landscape" },
    { name: "exact fit 896x576 platformer", width: 896, height: 576, dpr: 1, preset: "platformer", zoom: 2, orientation: "landscape" },
    // Tiny or broken input never goes below 1
    { name: "tiny 200x150", width: 200, height: 150, dpr: 1, preset: "platformer", zoom: 1, orientation: "landscape" },
    { name: "zero size", width: 0, height: 0, dpr: 0, preset: "hub", zoom: 1, orientation: "landscape" },
  ];

  it.each(table)("$name -> $zoom", ({ width, height, dpr, preset, zoom, orientation }) => {
    const result = pickZoom({ width, height, dpr, preset });
    expect(result.zoom).toBe(zoom);
    expect(Number.isInteger(result.zoom)).toBe(true);
    expect(result.orientation).toBe(orientation);
  });

  it("always shows at least the preset's tiles when the viewport can hold them", () => {
    for (const preset of ["hub", "platformer"] as const) {
      for (const [width, height, dpr] of [
        [390, 844, 2],
        [844, 390, 2],
        [1440, 900, 1],
        [1024, 768, 2],
      ]) {
        const result = pickZoom({ width, height, dpr, preset });
        const target = ZOOM_TARGETS[preset];
        const [cols, rows] =
          result.orientation === "portrait" ? [target.rows, target.cols] : [target.cols, target.rows];
        expect(result.visibleCols).toBeGreaterThanOrEqual(cols);
        expect(result.visibleRows).toBeGreaterThanOrEqual(rows);
        // One step closer would no longer fit.
        const closer = (result.zoom + 1) * 32;
        expect(
          Math.floor((width * dpr) / closer) >= cols && Math.floor((height * dpr) / closer) >= rows,
        ).toBe(false);
      }
    }
  });

  it("reports the CSS zoom and honours maxZoom", () => {
    const result = pickZoom({ width: 2560, height: 1440, dpr: 2, preset: "hub", maxZoom: 4 });
    expect(result.zoom).toBe(4);
    expect(result.cssZoom).toBe(2);
  });
});

describe("seeded rng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    seqA.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });

  it("differs by seed, accepts strings, and forks independently", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
    expect(createRng("shelter").seed).toBe(hashString("shelter"));
    const root = createRng(7);
    const forkA = root.fork("fireflies").next();
    const forkB = createRng(7).fork("fireflies").next();
    expect(forkA).toBe(forkB);
    expect(createRng(7).fork("npc").next()).not.toBe(forkA);
  });

  it("between is inclusive and pick stays in the list", () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const value = rng.between(600, 603);
      expect(value).toBeGreaterThanOrEqual(600);
      expect(value).toBeLessThanOrEqual(603);
      seen.add(value);
    }
    expect(seen.size).toBe(4);
    expect(["a", "b"]).toContain(rng.pick(["a", "b"]));
    expect(rng.pick([])).toBeUndefined();
  });
});
