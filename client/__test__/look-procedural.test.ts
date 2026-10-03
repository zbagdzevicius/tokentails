import { emissiveSpots, FIREFLY_COUNT, LIGHT_CAP } from "@/components/Phaser/look/ambience";
import { drawPlate, PLATE_HEIGHTS, PLATE_WIDTH, skyBands, starField } from "@/components/Phaser/look/procedural";
import { DEFAULT_EMISSIVE, lookPreset } from "@/components/Phaser/look/presets";

// G7: the procedural fallback plates are seeded (byte-identical captures) and tile horizontally;
// fireflies are 40 / 20 / 8 by tier; point lights sit on emissive tiles.

/** Records fills into a W x H grid of "painted" flags. */
function recorder(width: number, height: number) {
  const painted: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false));
  const calls: string[] = [];
  const ctx = {
    fillStyle: "" as string,
    globalAlpha: 1,
    clearRect() {},
    fillRect(x: number, y: number, w: number, h: number) {
      calls.push(`${this.fillStyle}|${this.globalAlpha}|${x},${y},${w},${h}`);
      for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy += 1) {
        for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx += 1) painted[yy][xx] = true;
      }
    },
  };
  return { ctx, painted, calls };
}

describe("procedural plates", () => {
  const preset = lookPreset("home");

  it.each(["far", "mid", "near", "fog"] as const)("%s is deterministic for a seed", (layer) => {
    const a = recorder(PLATE_WIDTH, PLATE_HEIGHTS[layer]);
    const b = recorder(PLATE_WIDTH, PLATE_HEIGHTS[layer]);
    const c = recorder(PLATE_WIDTH, PLATE_HEIGHTS[layer]);
    drawPlate(a.ctx as never, layer, preset, "seed-1");
    drawPlate(b.ctx as never, layer, preset, "seed-1");
    drawPlate(c.ctx as never, layer, preset, "seed-2");
    expect(a.calls).toEqual(b.calls);
    // The fog band is a fixed dither; the silhouettes change with the seed.
    if (layer !== "fog") expect(a.calls).not.toEqual(c.calls);
  });

  it.each(["far", "mid", "near"] as const)("%s silhouette meets itself at the strip edge (tiles)", (layer) => {
    const { ctx, painted } = recorder(PLATE_WIDTH, PLATE_HEIGHTS[layer]);
    drawPlate(ctx as never, layer, preset, "seam");
    const top = (x: number) => painted.findIndex((row) => row[x]);
    expect(Math.abs(top(0) - top(PLATE_WIDTH - 1))).toBeLessThanOrEqual(4);
  });

  it("sky bands run from the preset's top colour to its horizon colour", () => {
    const bands = skyBands(lookPreset("shelter"));
    expect(bands).toHaveLength(8);
    expect(bands[0]).toBe("#2a1f45");
    expect(bands[7]).toBe("#ee8a5c");
    expect(starField(preset, "s")).toEqual(starField(preset, "s"));
  });
});

describe("ambience budgets", () => {
  it("fireflies are 40 / 20 / 8 by tier and lights are capped", () => {
    expect(FIREFLY_COUNT).toEqual({ HIGH: 40, MID: 20, LOW: 8 });
    expect(LIGHT_CAP.LOW).toBeLessThan(LIGHT_CAP.MID);
  });

  it("finds emissive tiles (lamps and candles) up to the cap", () => {
    const tiles = [21, 5, 213, 243, 213].map((index, i) => ({
      index,
      getCenterX: () => i * 32 + 16,
      getTop: () => 64,
    }));
    const layer = { forEachTile: (fn: (tile: (typeof tiles)[number]) => void) => tiles.forEach(fn) };
    const spots = emissiveSpots([layer as never, null], DEFAULT_EMISSIVE, 3);
    expect(spots).toEqual([
      { x: 16, y: 70 },
      { x: 80, y: 70 },
      { x: 112, y: 70 },
    ]);
  });
});
