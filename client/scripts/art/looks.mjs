/**
 * The look catalogue (plan G7; decisions #46, #49, #50): one place that says which runtime sheet
 * gets which night skin, which plate set each scene uses and how each palette pass is graded.
 * `build.mjs` renders it, `client/__test__/art-*.test.ts` checks it, and the generated
 * `public/look/manifest.json` is what the runtime (task 6e) reads.
 *
 * Grades are in OKLab: `l` scales lightness, `lift` adds to it, `chroma` scales chroma, and
 * `tint` pulls (a, b) toward the hue `hue` (degrees) by `amount`. Every graded pixel is then
 * snapped to the look's palette (core tokens + hero ramps + the look's own ramp), so no colour
 * outside `client/art/palette.json` ships.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const LOOK_ASSET_VERSION = "v1";

/** Tile size and extrude profile of every runtime sheet (32 x 32, margin 1, spacing 2). */
export const SHEETS = {
  spring: { profile: "standard-32", grade: "hub" },
  valentine: { profile: "standard-32", grade: "cupid" },
  construct: { profile: "standard-32", grade: "family" },
  summer: { profile: "standard-32", grade: "family" },
  candy: { profile: "standard-32", grade: "family" },
  camp: { profile: "standard-32", grade: "family" },
  summit: { profile: "standard-32", grade: "family" },
  stocks: { profile: "standard-32", grade: "family" },
  sei: { profile: "standard-32", grade: "family" },
  daemons: { profile: "standard-32", grade: "family" },
  "cat-winter": { profile: "standard-32", grade: "family" },
  // ENDLESS: 210 columns x 11 rows, its own profile name and size check.
  combined: { profile: "combined-32", grade: "family" },
};

/** The Shelter's extra tilesets (`signs` at firstgid 481); the logo is brand art and is not regraded. */
export const EXTRA_SHEETS = {
  "shelter-signs": { file: "shelter/signs.png", tile: 32, out: "shelter/signs-night-v1.png" },
};

/** Tile indices (Tiled gids, firstgid 1) the scenes treat specially. Mirrors the scene constants. */
export const TILE_ROLES = {
  // CatnipChaos.ts and PixelRescueScene.ts SPIKE_TILES: the hazards that stay tiles.
  hazards: [253, 254, 283, 284],
  // CatnipChaos.ts initializeCatnipCoins(): gid 248 is the catnip pickup; G8 redraws it as the sprig.
  catnip: 248,
  // The water fill the hub and Cupid maps paint over the whole view in `decorations` (gid 104,
  // about 1,900 tiles per map). Some Purrsuit maps use the same tile as real water in `blocks`,
  // so the skin keeps it a normal tile; under v1 the runtime hides it in `decorations` only
  // (manifest `backdrop`) so the parallax plates show through.
  backdrop: [104],
};

/**
 * Tile grades. Fills sit at a night value (lower lightness, a cool shift), darker than the day
 * sheets, as the landing hero is dark stone with warm lit accents. Readability against the plate
 * comes from `rim`: a lit 1 px edge on the sides of a collidable tile that face open air in the
 * maps (top and outer sides), in a warm highlight from the palette (task 6d review, finding 2).
 * `hazard` keeps spikes bright and warm so their silhouette reads against the night plates;
 * `signs` keeps the Shelter's sign text legible. The alpha mask of every tile is never changed.
 */
export const TILE_GRADES = {
  hub: { l: 0.74, lift: 0, chroma: 0.85, tint: { hue: 275, amount: 0.26, chroma: 0.05 } },
  cupid: { l: 0.76, lift: 0, chroma: 0.85, tint: { hue: 340, amount: 0.22, chroma: 0.06 } },
  family: { l: 0.74, lift: 0, chroma: 0.85, tint: { hue: 275, amount: 0.22, chroma: 0.05 } },
  hazard: { l: 1.0, lift: 0.06, chroma: 1.0, tint: { hue: 45, amount: 0.25, chroma: 0.12 } },
  signs: { l: 0.95, lift: 0.03, chroma: 0.9, tint: { hue: 275, amount: 0.22, chroma: 0.05 } },
  // The lit edge: the fill colour lifted (`lift` grows in steps until the edge passes 3:1) and
  // pulled toward the hero's warm lamp light.
  rim: { l: 1.0, lift: 0.2, chroma: 1.0, tint: { hue: 70, amount: 0.4, chroma: 0.09 } },
};

/** A side counts as open (gets the lit edge) when it faces open air in more than half of its placements. */
export const RIM_OPEN_SHARE = 0.5;

/**
 * Plate sets: one per scene mood (Home moonlit night, Shelter dusk: decision #49) and one per
 * Purrsuit family including ENDLESS (decision #50). `hue` is the set's own ramp and tint.
 */
export const PLATE_SETS = {
  "hub-night": { hue: 265, mood: "moonlit-night", sky: { l: 0.62, warm: 0.25 }, ground: { l: 0.5 }, tint: 0.35 },
  "hub-dusk": { hue: 330, mood: "dusk", sky: { l: 0.82, warm: 1.0 }, ground: { l: 0.56 }, tint: 0.12 },
  "cupid-night": { hue: 350, mood: "rose-night", sky: { l: 0.66, warm: 0.5 }, ground: { l: 0.5 }, tint: 0.3 },
  "purrsuit-construct": { hue: 60, mood: "amber-night", sky: { l: 0.64, warm: 0.6 }, ground: { l: 0.5 }, tint: 0.3 },
  "purrsuit-spring": { hue: 165, mood: "moonlit-meadow", sky: { l: 0.64, warm: 0.35 }, ground: { l: 0.5 }, tint: 0.3 },
  "purrsuit-summer": { hue: 200, mood: "warm-teal-night", sky: { l: 0.66, warm: 0.7 }, ground: { l: 0.5 }, tint: 0.28 },
  "purrsuit-candy": { hue: 330, mood: "lilac-night", sky: { l: 0.66, warm: 0.5 }, ground: { l: 0.5 }, tint: 0.32 },
  "purrsuit-camp": { hue: 140, mood: "forest-night", sky: { l: 0.62, warm: 0.45 }, ground: { l: 0.48 }, tint: 0.3 },
  "purrsuit-summit": { hue: 240, mood: "icy-night", sky: { l: 0.66, warm: 0.2 }, ground: { l: 0.5 }, tint: 0.35 },
  "purrsuit-stocks": { hue: 150, mood: "emerald-night", sky: { l: 0.62, warm: 0.3 }, ground: { l: 0.48 }, tint: 0.32 },
  "purrsuit-sei": { hue: 20, mood: "ember-night", sky: { l: 0.64, warm: 0.8 }, ground: { l: 0.5 }, tint: 0.3 },
  "purrsuit-daemons": { hue: 310, mood: "violet-night", sky: { l: 0.6, warm: 0.4 }, ground: { l: 0.46 }, tint: 0.35 },
  "purrsuit-cat-winter": { hue: 230, mood: "snow-night", sky: { l: 0.68, warm: 0.15 }, ground: { l: 0.52 }, tint: 0.35 },
  "purrsuit-combined": { hue: 285, mood: "endless-night", sky: { l: 0.64, warm: 0.45 }, ground: { l: 0.5 }, tint: 0.3 },
};

/** Parallax layers, back to front. Scroll factors are suggestions the runtime may tune per tier. */
export const PLATE_LAYERS = [
  { name: "far", scrollFactor: 0.06, anchor: "top" },
  { name: "mid", scrollFactor: 0.18, anchor: "bottom" },
  { name: "near", scrollFactor: 0.38, anchor: "bottom" },
  { name: "fog", scrollFactor: 0.55, anchor: "bottom" },
];

/** Plates are a quarter of the 2752 x 1536 hero: the hero's art-pixel grid (about 4 px per art pixel). */
export const PLATE_NATIVE = { width: 688, height: 384, heroScale: 4 };

/**
 * Scene presets. `v0` is today's look (rollback, decision #51), `v1` the night look. Purrsuit
 * presets are generated from `map.ts` so a new chapter cannot miss its family.
 */
export function scenePresets() {
  return {
    home: { scene: "BaseScene", maps: ["catbassadors/base.json"], sheet: "spring", plates: "hub-night" },
    shelter: { scene: "ShelterScene", maps: ["catbassadors/new-shelter.json"], sheet: "spring", plates: "hub-dusk", extra: ["shelter-signs"] },
    cupid: { scene: "PixelRescueScene", maps: [], sheet: "valentine", plates: "cupid-night" },
  };
}

/**
 * Reads `components/Phaser/map.ts` (the runtime truth) for the Map enum and the Purrsuit and
 * Cupid level tables, without importing it (it pulls in app code).
 */
export function readLevelTables(clientDir) {
  const src = readFileSync(join(clientDir, "components", "Phaser", "map.ts"), "utf8");
  const enumBody = /export enum Map \{([\s\S]*?)\}/.exec(src)?.[1] ?? "";
  const mapEnum = {};
  for (const m of enumBody.matchAll(/(\w+)\s*=\s*"([^"]+)"/g)) mapEnum[m[1]] = m[2];
  const table = (name) => {
    const body = new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\};`).exec(src)?.[1] ?? "";
    const out = {};
    for (const m of body.matchAll(/"(\w+)":\s*Map\.(\w+)/g)) out[m[1]] = mapEnum[m[2]];
    return out;
  };
  const core = /export const CoreMap = Map\.(\w+)/.exec(src)?.[1];
  return {
    mapEnum,
    coreMap: core ? mapEnum[core] : undefined,
    purrsuit: table("CatnipChaosLevelMap"),
    cupid: table("PixelRescueLevelMap"),
  };
}

/** `base/construct.png` -> `construct`. */
export function sheetName(mapValue) {
  return /^base\/(.+)\.png$/.exec(mapValue)?.[1];
}

export const nightSheetFile = (sheet) => `base/${sheet}-night-${LOOK_ASSET_VERSION}.png`;
export const plateFile = (set, layer) => `landing/plates/${set}-${layer}-${LOOK_ASSET_VERSION}.png`;
export const posterFile = (presetId) => `look/posters/${presetId.replace(/\//g, "-")}-${LOOK_ASSET_VERSION}.webp`;
