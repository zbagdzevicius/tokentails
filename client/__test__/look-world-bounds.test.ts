import { readFileSync } from "fs";
import { join } from "path";
import {
  cameraBounds,
  computeWorldBounds,
  dominantSurfaceY,
  horizonFor,
  majorSurfaces,
  type TiledMapLike,
} from "@/components/Phaser/look/worldBounds";

// G7 "Camera": world bounds from Tiled chunk extents. The hub and level maps are infinite
// chunked maps, so `widthInPixels` (width x tile size, from 0) does not say where the world is.

const PUBLIC = join(__dirname, "..", "public");
const load = (path: string) => JSON.parse(readFileSync(join(PUBLIC, path), "utf8")) as TiledMapLike & {
  width: number;
  height: number;
};

const FIXTURES = [
  { path: "catbassadors/base.json", name: "Home", spawn: { x: 64, y: -400 } },
  { path: "catbassadors/new-shelter.json", name: "Shelter", spawn: { x: 350, y: -100 } },
  { path: "catnip-chaos/levels/level-11.json", name: "Purrsuit 1-1", spawn: { x: -950, y: -900 } },
  { path: "pixel-rescue/levels/level-1.json", name: "Cupid 1", spawn: null },
];

/** Independent oracle: every non-empty tile, placed as Phaser's ParseTileLayers places it. */
function tileExtents(map: TiledMapLike) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const layer of map.layers) {
    if (layer.type !== "tilelayer") continue;
    for (const chunk of layer.chunks ?? []) {
      (chunk.data as number[]).forEach((gid, i) => {
        if (!gid) return;
        const x = (chunk.x + (i % chunk.width)) * map.tilewidth + (layer.offsetx ?? 0);
        const y = (chunk.y + Math.floor(i / chunk.width)) * map.tileheight + (layer.offsety ?? 0);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + map.tilewidth);
        maxY = Math.max(maxY, y + map.tileheight);
      });
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

describe("computeWorldBounds on the real Tiled maps", () => {
  it.each(FIXTURES)("$name: chunk extents, not widthInPixels", ({ path, spawn }) => {
    const map = load(path);
    expect(map.infinite).toBe(true);
    const bounds = computeWorldBounds(map)!;
    expect(bounds).toEqual(tileExtents(map));
    // widthInPixels would be the 30 x 20 editor canvas at the origin.
    expect(bounds).not.toEqual({ x: 0, y: 0, width: map.width * map.tilewidth, height: map.height * map.tileheight });
    expect(bounds.width).toBeGreaterThan(map.width * map.tilewidth);
    expect(Math.abs(bounds.x % map.tilewidth)).toBe(0);
    if (spawn) {
      expect(spawn.x).toBeGreaterThanOrEqual(bounds.x);
      expect(spawn.x).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
  });

  it.each(FIXTURES)("$name: the ground line lies inside the world", ({ path }) => {
    const map = load(path);
    const bounds = computeWorldBounds(map)!;
    const ground = dominantSurfaceY(map, { layers: ["blocks"] })!;
    expect(Number.isFinite(ground)).toBe(true);
    expect(ground).toBeGreaterThanOrEqual(bounds.y);
    expect(ground).toBeLessThan(bounds.y + bounds.height);
    expect(Math.abs(ground % map.tileheight)).toBe(0);
  });

  it("Home has an upper floor and the ground: the backdrop horizon follows the floor under the view", () => {
    const map = load("catbassadors/base.json");
    const floors = majorSurfaces(map, { layers: ["blocks"] });
    expect(floors.length).toBeGreaterThanOrEqual(2);
    // The dominant surface is the upper floor; the player spawns above the ground floor below it.
    const top = dominantSurfaceY(map, { layers: ["blocks"] })!;
    const ground = floors.find((y) => y > top)!;
    expect(ground).toBeGreaterThan(top);
    // A view centred just above the ground stands its horizon on the ground, not the upper floor.
    expect(horizonFor(floors, ground - 60, 32)).toBe(ground);
    expect(horizonFor(floors, top - 60, 32)).toBe(top);
    // Below every floor: the lowest one.
    expect(horizonFor(floors, 1e6)).toBe(floors[floors.length - 1]);
    expect(horizonFor([], 0)).toBeNull();
  });

  it("reads finite maps, layer offsets and flip flags; empty maps give null", () => {
    const finite: TiledMapLike = {
      tilewidth: 32,
      tileheight: 32,
      layers: [
        { type: "tilelayer", name: "blocks", width: 4, height: 2, data: [0, 0, 0, 0, 0, 7, 0x80000003, 0] },
        { type: "objectgroup", name: "spawns" },
        { type: "group", offsetx: 64, layers: [{ type: "tilelayer", name: "deco", width: 1, height: 1, data: [5] }] },
      ],
    };
    expect(computeWorldBounds(finite)).toEqual({ x: 32, y: 0, width: 64, height: 64 });
    expect(computeWorldBounds(finite, { layers: ["blocks"] })).toEqual({ x: 32, y: 32, width: 64, height: 32 });
    expect(computeWorldBounds({ tilewidth: 32, tileheight: 32, layers: [] })).toBeNull();
    expect(dominantSurfaceY({ tilewidth: 32, tileheight: 32, layers: [] })).toBeNull();
    expect(majorSurfaces({ tilewidth: 32, tileheight: 32, layers: [] })).toEqual([]);
  });
});

describe("cameraBounds (no void at the view edges)", () => {
  const world = { x: -320, y: -640, width: 2000, height: 900 };

  it("adds sky room above and keeps the world otherwise", () => {
    expect(cameraBounds(world, { width: 480, height: 300 }, { skyMargin: 256 })).toEqual({
      x: -320,
      y: -896,
      width: 2000,
      height: 1156,
    });
  });

  it("centres a world narrower than the view and grows a short one upwards (sky, not void)", () => {
    const bounds = cameraBounds({ x: 0, y: 0, width: 300, height: 200 }, { width: 500, height: 400 });
    expect(bounds).toEqual({ x: -100, y: -200, width: 500, height: 400 });
  });
});
