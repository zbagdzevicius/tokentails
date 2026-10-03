/**
 * The G7 art pipeline (plan G7; decisions #46, #49, #50): palette, night tile skins at the same
 * indices, parallax plates, the look manifest, art sources out of `public/`.
 *
 * Fast checks read the generated files directly. The full gates (palette staleness, edge-SSIM,
 * the 3:1 contrast gate from the Tiled layers) run once through `scripts/art/build.mjs --gates`,
 * which regenerates everything in memory without writing.
 */
import { execFileSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import sharp from "sharp";
import { minCropRun, straightCropRun } from "../components/Phaser/look/plateCheck";
import { TT_COLORS } from "../design/tokens";

const CLIENT = path.resolve(__dirname, "..");
const PUBLIC = path.join(CLIENT, "public");

interface TilesetEntry {
  source: string;
  profile: string;
  tileWidth: number;
  tileHeight: number;
  margin: number;
  spacing: number;
  columns: number;
  rows: number;
  tileCount: number;
  palette: string;
  sha256: string;
}
interface PlateLayerEntry {
  name: string;
  file: string;
  width: number;
  height: number;
  scrollFactor: number;
  tileX: boolean;
  sha256: string;
}
interface PlateSetEntry {
  nativeWidth: number;
  nativeHeight: number;
  layers: PlateLayerEntry[];
}
interface PresetEntry {
  scene: string;
  v0: { tileset: string };
  v1: { tileset: string; plates: string; mood: string; background: string; poster: string };
}
interface LookManifestFile {
  schemaVersion: number;
  lookVersion: string;
  versions: string[];
  hubMap: unknown;
  backdrop: unknown;
  tilesets: Record<string, TilesetEntry>;
  plates: Record<string, PlateSetEntry>;
  presets: Record<string, PresetEntry>;
  purrsuitFamilies: Record<string, string>;
}
interface GateReport {
  ok: boolean;
  errors: string[];
  plates: Record<string, { ssim: Record<string, number>; edges: Record<string, { bottom: number; top: number; ledge: number; wall: number }> }>;
  contrast: Record<string, Record<string, { worst: number; failures: number; interior: number; tiles: number }>>;
}
const manifest: LookManifestFile = JSON.parse(readFileSync(path.join(PUBLIC, "look", "manifest.json"), "utf8"));
const palette = JSON.parse(readFileSync(path.join(CLIENT, "art", "palette.json"), "utf8"));

type Rgba = { width: number; height: number; data: Buffer };
async function rgba(rel: string): Promise<Rgba> {
  const { data, info } = await sharp(path.join(PUBLIC, rel)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

function lookPalette(setId: string): Set<string> {
  const all: string[] = [
    ...Object.values(palette.tokens as Record<string, string>),
    ...palette.neutral,
    ...Object.values(palette.hero as Record<string, string[]>).flat(),
    ...Object.values((palette.bridges ?? {}) as Record<string, string[]>).flat(),
    ...palette.sprig,
    ...(palette.looks[setId]?.ramp ?? []),
    ...(palette.looks[setId]?.sky ?? []),
  ];
  return new Set(all.map((h) => h.toLowerCase()));
}

const hex = (d: Buffer, i: number) => `#${[d[i], d[i + 1], d[i + 2]].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

function offPalette(img: Rgba, allowed: Set<string>): string[] {
  const off = new Set<string>();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const h = hex(img.data, i);
    if (!allowed.has(h)) off.add(h);
  }
  return Array.from(off);
}

/** Opaque mask of the authored tile `index` inside an extruded (margin 1, spacing 2) sheet. */
function tileMask(img: Rgba, index: number, cols: number): boolean[] {
  const x0 = 1 + (index % cols) * 34;
  const y0 = 1 + Math.floor(index / cols) * 34;
  const out: boolean[] = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) out.push(img.data[((y0 + y) * img.width + x0 + x) * 4 + 3] > 0);
  return out;
}

const tilesetEntries = Object.entries(manifest.tilesets).filter(([, t]) => t.profile !== "plain");

describe("palette (client/art/palette.json)", () => {
  it("contains every design token, generated from client/design/tokens.ts", () => {
    for (const [name, value] of Object.entries(TT_COLORS)) expect(palette.tokens[name]).toBe(value.toLowerCase());
  });

  it("is valid hex, with hero ramps, bridges, the sprig and one palette pass per plate set", () => {
    const all = [
      ...Object.values(palette.tokens as Record<string, string>),
      ...palette.neutral,
      ...Object.values(palette.hero as Record<string, string[]>).flat(),
      ...Object.values(palette.bridges as Record<string, string[]>).flat(),
      ...palette.sprig,
    ];
    for (const h of all) expect(h).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(palette.hero).length).toBeGreaterThanOrEqual(4);
    for (const setId of Object.keys(manifest.plates)) {
      expect(palette.looks[setId].ramp).toHaveLength(12);
      expect(palette.looks[setId].sky.length).toBeGreaterThan(8);
      expect(lookPalette(setId).size).toBeLessThanOrEqual(256);
    }
  });

  it("ships a GIMP palette with the same colours", () => {
    const gpl = readFileSync(path.join(CLIENT, "art", "palette.gpl"), "utf8");
    expect(gpl.startsWith("GIMP Palette\n")).toBe(true);
    expect(gpl).toContain("tt-night-900");
    expect(gpl).toContain("look-hub-night-sky-0");
  });
});

describe("look manifest (public/look/manifest.json)", () => {
  it("has the schema the runtime reads", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(["v0", "v1"]).toContain(manifest.lookVersion);
    expect(manifest.versions).toEqual(["v0", "v1"]);
    expect(manifest.hubMap).toEqual({ id: "SPRING_NIGHT", tileset: "base/spring-night-v1.png", scenes: ["home", "shelter"] });
    expect(manifest.backdrop).toEqual({ layer: "decorations", gids: [104], scenes: ["home", "shelter", "cupid"] });
    for (const [id, preset] of Object.entries(manifest.presets)) {
      expect(typeof preset.scene).toBe("string");
      expect(preset.v0.tileset).toMatch(/^base\/[a-z-]+\.png$/);
      expect(manifest.tilesets[preset.v1.tileset]).toBeDefined();
      expect(manifest.plates[preset.v1.plates]).toBeDefined();
      expect(preset.v1.background).toBe("#0b0820");
      expect(existsSync(path.join(PUBLIC, preset.v1.poster))).toBe(true);
      expect(preset.v1.poster).toMatch(/-v1\.webp$/);
      expect(id).toMatch(/^(home|shelter|cupid|purrsuit\/[a-z-]+)$/);
    }
  });

  it("applies decisions #49 and #50: Home moonlit, Shelter dusk, every Purrsuit family incl. ENDLESS", () => {
    expect(manifest.presets.home.v1.mood).toBe("moonlit-night");
    expect(manifest.presets.shelter.v1.mood).toBe("dusk");
    expect(manifest.presets.home.v1.tileset).toBe(manifest.presets.shelter.v1.tileset);
    const mapTs = readFileSync(path.join(CLIENT, "components", "Phaser", "map.ts"), "utf8");
    const enumBody = /export enum Map \{([\s\S]*?)\}/.exec(mapTs)![1];
    const values = Object.fromEntries(Array.from(enumBody.matchAll(/(\w+)\s*=\s*"([^"]+)"/g)).map((m) => [m[1], m[2]]));
    const table = /export const CatnipChaosLevelMap[^=]*=\s*\{([\s\S]*?)\};/.exec(mapTs)![1];
    const used = new Set(Array.from(table.matchAll(/Map\.(\w+)/g)).map((m) => values[m[1]]));
    expect(used.has("base/combined.png")).toBe(true);
    for (const mapValue of Array.from(used)) {
      const id = manifest.purrsuitFamilies[mapValue];
      expect(id).toBeDefined();
      expect(manifest.presets[id].scene).toBe("CatnipChaos");
    }
  });

  it("uses only versioned, existing files whose hashes match", async () => {
    const { createHash } = await import("crypto");
    const files: [string, string][] = [];
    for (const [file, t] of Object.entries(manifest.tilesets)) files.push([file, t.sha256]);
    for (const set of Object.values(manifest.plates)) for (const l of set.layers) files.push([l.file, l.sha256]);
    for (const [file, sha] of files) {
      expect(file).toMatch(/-v1\.png$/);
      const bytes = readFileSync(path.join(PUBLIC, file));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha);
    }
  });
});

describe("night tile skins: same indices, same grid, same silhouettes, in palette", () => {
  it.each(tilesetEntries)("%s", async (file, t) => {
    const night = await rgba(file);
    const source = await rgba(t.source);
    // The exact runtime grid: 32 x 32 tiles, margin 1, spacing 2 (ENDLESS: 210 x 11).
    expect([night.width, night.height]).toEqual([source.width, source.height]);
    expect(night.width).toBe(2 * t.margin + t.columns * t.tileWidth + (t.columns - 1) * t.spacing);
    expect(night.height).toBe(2 * t.margin + t.rows * t.tileHeight + (t.rows - 1) * t.spacing);
    if (t.source === "base/combined.png") expect([t.columns, t.rows, t.profile]).toEqual([210, 11, "combined-32"]);
    // Every tile keeps its silhouette (hazards included); only the catnip tile (gid 248) is redrawn.
    for (let index = 0; index < t.tileCount; index++) {
      if (index === 247) continue;
      expect(tileMask(night, index, t.columns)).toEqual(tileMask(source, index, t.columns));
    }
    expect(offPalette(night, lookPalette(t.palette))).toEqual([]);
  });

  it("extrusion borders repeat the tile's own edge pixels (no bleeding at runtime)", async () => {
    const night = await rgba("base/spring-night-v1.png");
    const cols = 30;
    for (const index of [0, 2, 62, 252, 479]) {
      const x0 = 1 + (index % cols) * 34;
      const y0 = 1 + Math.floor(index / cols) * 34;
      for (let k = 0; k < 32; k++) {
        const at = (x: number, y: number) => night.data.subarray((y * night.width + x) * 4, (y * night.width + x) * 4 + 4);
        expect(at(x0 - 1, y0 + k)).toEqual(at(x0, y0 + k));
        expect(at(x0 + 32, y0 + k)).toEqual(at(x0 + 31, y0 + k));
        expect(at(x0 + k, y0 - 1)).toEqual(at(x0 + k, y0));
        expect(at(x0 + k, y0 + 32)).toEqual(at(x0 + k, y0 + 31));
      }
    }
  });

  it("redraws the catnip tile as the G8 sprig", async () => {
    const night = await rgba("base/spring-night-v1.png");
    const sprig = new Set(Object.values(JSON.parse(readFileSync(path.join(CLIENT, "art", "catnip", "palette.json"), "utf8")).colors as Record<string, string>));
    const x0 = 1 + (247 % 30) * 34;
    const y0 = 1 + Math.floor(247 / 30) * 34;
    let opaque = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const i = ((y0 + y) * night.width + x0 + x) * 4;
      if (!night.data[i + 3]) continue;
      opaque++;
      expect(sprig.has(hex(night.data, i))).toBe(true);
    }
    expect(opaque).toBeGreaterThan(200);
  });
});

describe("Tiled maps: the night variant changes no index", () => {
  const mapTs = readFileSync(path.join(CLIENT, "components", "Phaser", "map.ts"), "utf8");
  const enumValues = Object.fromEntries(
    Array.from(/export enum Map \{([\s\S]*?)\}/.exec(mapTs)![1].matchAll(/(\w+)\s*=\s*"([^"]+)"/g)).map((m) => [m[1], m[2]]),
  );
  const purrsuitTable: Record<string, string> = Object.fromEntries(
    Array.from(/export const CatnipChaosLevelMap[^=]*=\s*\{([\s\S]*?)\};/.exec(mapTs)![1].matchAll(/"(\w+)":\s*Map\.(\w+)/g)).map((m) => [m[1], enumValues[m[2]]]),
  );
  const levels = [
    ...readdirSync(path.join(PUBLIC, "catnip-chaos", "levels")).filter((f) => /^level-\d+\.json$/.test(f)).map((f) => `catnip-chaos/levels/${f}`),
    ...readdirSync(path.join(PUBLIC, "pixel-rescue", "levels")).filter((f) => /^level-\d+\.json$/.test(f)).map((f) => `pixel-rescue/levels/${f}`),
    "catbassadors/base.json",
    "catbassadors/new-shelter.json",
  ];

  function diffPaths(a: unknown, b: unknown, at = "$", out: string[] = []): string[] {
    if (Object.is(a, b)) return out;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
      out.push(at);
      return out;
    }
    const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
    for (const k of Array.from(keys)) diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`, out);
    return out;
  }

  it.each(levels)("%s", (rel) => {
    const map = JSON.parse(readFileSync(path.join(PUBLIC, rel), "utf8"));
    const night = JSON.parse(JSON.stringify(map));
    const tileset = night.tilesets.find((t: { firstgid: number }) => t.firstgid === 1);
    // What the runtime does under v1: the same map, the sheet image swapped to the scene's skin.
    const preset = rel.startsWith("catnip-chaos/")
      ? manifest.purrsuitFamilies[purrsuitTable[/level-(\d+)\.json$/.exec(rel)![1]]]
      : rel.startsWith("pixel-rescue/")
        ? "cupid"
        : rel.endsWith("base.json")
          ? "home"
          : "shelter";
    expect(preset).toBeDefined();
    const file = manifest.presets[preset].v1.tileset;
    const skin = manifest.tilesets[file];
    tileset.image = file;
    expect(diffPaths(map, night)).toEqual([`$.tilesets.${night.tilesets.indexOf(tileset)}.image`]);
    expect(tileset.columns).toBe(skin.columns);
    expect(tileset.tilecount).toBe(skin.tileCount);
  });
});

describe("parallax plates", () => {
  const sets = Object.entries(manifest.plates);
  it.each(sets)("%s: far, mid, near, fog at native resolution, seamless and in palette", async (setId, set) => {
    expect(set.layers.map((l) => l.name)).toEqual(["far", "mid", "near", "fog"]);
    for (const layer of set.layers) {
      const img = await rgba(layer.file);
      expect([img.width, img.height]).toEqual([set.nativeWidth * 2, set.nativeHeight]);
      expect(layer.tileX).toBe(true);
      // Mirror-wrapped: column x equals column (width - 1 - x), so the wrap seam is invisible.
      for (const y of [0, Math.floor(img.height / 2), img.height - 1]) {
        const left = img.data.subarray(y * img.width * 4, y * img.width * 4 + 4);
        const right = img.data.subarray(((y + 1) * img.width - 1) * 4, (y + 1) * img.width * 4);
        expect(Buffer.compare(Buffer.from(left), Buffer.from(right))).toBe(0);
      }
      expect(offPalette(img, lookPalette(setId))).toEqual([]);
    }
    const factors = set.layers.map((l) => l.scrollFactor);
    expect(factors).toEqual([...factors].sort((a, b) => a - b));
  });
});

describe("plate alpha edges (6d review, finding 1)", () => {
  const layers = Object.values(manifest.plates).flatMap((set) => set.layers);

  /** The longest vertical alpha wall (one side opaque, the other clear) over consecutive rows. */
  function wallRun(img: Rgba): number {
    const opaque = (x: number, y: number) => img.data[(y * img.width + x) * 4 + 3] > 8;
    let best = 0;
    for (let x = 0; x + 1 < img.width; x++) {
      let run = 0;
      for (let y = 0; y < img.height; y++) {
        run = opaque(x, y) !== opaque(x + 1, y) ? run + 1 : 0;
        best = Math.max(best, run);
      }
    }
    return best;
  }

  it.each(layers.map((l) => [l.file]))("%s passes the runtime crop check and has no cut-out walls", async (file) => {
    const img = await rgba(file);
    // The exact check 6e's backdrop runs before drawing a plate (look/plateCheck.ts).
    expect(straightCropRun(img.data, img.width, img.height, 4, 3)).toBeLessThan(minCropRun(img.width));
    // A cut-out block left 154-row walls; the hero's own pillar edges reach 66.
    expect(wallRun(img)).toBeLessThan(80);
  });

  it("near plates are refilled where the altar was: no clear column reaches the bottom", async () => {
    for (const layer of layers.filter((l) => l.name === "near")) {
      const img = await rgba(layer.file);
      const y = img.height - 1;
      for (let x = 0; x < img.width; x++) expect(img.data[(y * img.width + x) * 4 + 3]).toBe(255);
    }
  });
});

describe("night skins are darker than the day sheets (6d review, finding 2)", () => {
  it.each(tilesetEntries)("%s: mean fill lightness is below the source's", async (file, t) => {
    const night = await rgba(file);
    const day = await rgba(t.source);
    const lum = (img: Rgba) => {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < img.data.length; i += 4) {
        if (img.data[i + 3] < 128) continue;
        sum += 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
        n++;
      }
      return sum / n;
    };
    expect(lum(night)).toBeLessThan(lum(day));
  });
});

describe("art sources are out of public/", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(path.relative(PUBLIC, full).split(path.sep).join("/"));
    }
    return out;
  }
  // Sources outside this task's folders, reported in docs/plans/alignment-log/6d.md for their owners.
  const KNOWN_ELSEWHERE = [
    "catbassadors/catbassadors.tmx",
    "story/spiked-wall.aseprite",
    "pixel-rescue/levels/pixel-rescue.tiled-project",
    "pixel-rescue/levels/pixel-rescue.tiled-session",
    "purrquest/levels/untitled.tiled-project",
    "purrquest/levels/untitled.tiled-session",
  ];

  it("ships no art source in public/base, and no new one anywhere else", () => {
    const files = walk(PUBLIC);
    expect(files.filter((f) => f.startsWith("base/") && /\.(aseprite|ase)$/i.test(f))).toEqual([]);
    expect(files.filter((f) => f.startsWith("base/") && /\.(tmx|tsx|tiled-session|tiled-project)$/i.test(f))).toEqual([]);
    const sources = files.filter((f) => /\.(aseprite|ase|tmx|tiled-session|tiled-project)$/i.test(f));
    expect(sources.filter((f) => !KNOWN_ELSEWHERE.includes(f))).toEqual([]);
  });

  it("keeps the moved sources in client/art/src and nothing loads them at runtime", () => {
    for (const f of ["Sprite-0001.aseprite", "bird.aseprite", "tilemaps.aseprite", "base.tmx"]) expect(existsSync(path.join(CLIENT, "art", "src", f))).toBe(true);
    const grep = (() => {
      try {
        return execFileSync("git", ["grep", "-l", "-E", "\\.aseprite|base\\.tmx", "--", "components", "pages", "constants", "lib", "utils"], { cwd: CLIENT, encoding: "utf8" });
      } catch {
        return "";
      }
    })();
    expect(grep.trim()).toBe("");
  });

  it("deletes the Windows-path scripts a.js and b.js (replaced by scripts/art/tile-legend.mjs)", () => {
    expect(existsSync(path.join(CLIENT, "scripts", "a.js"))).toBe(false);
    expect(existsSync(path.join(CLIENT, "scripts", "b.js"))).toBe(false);
  });
});

describe("build gates (scripts/art/build.mjs --gates)", () => {
  it("palette fresh, plates in palette with edge-SSIM >= 0.85 and no straight alpha edge, lit edges and hazards >= 3:1", () => {
    let out: string;
    try {
      out = execFileSync(process.execPath, ["scripts/art/build.mjs", "--gates", "--json"], { cwd: CLIENT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    } catch (error) {
      out = String((error as { stdout?: string }).stdout ?? "");
    }
    const report: GateReport = JSON.parse(out.trim().split("\n").pop()!);
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    for (const p of Object.values(report.plates)) {
      for (const v of Object.values(p.ssim)) expect(v).toBeGreaterThanOrEqual(0.85);
      for (const e of Object.values(p.edges)) {
        expect(e.bottom).toBeLessThan(28);
        expect(e.top).toBeLessThan(28);
        expect(e.ledge).toBeLessThan(28);
        expect(e.wall).toBeLessThan(80);
      }
    }
    for (const bySet of Object.values(report.contrast)) {
      for (const c of Object.values(bySet)) {
        expect(c.failures).toBe(0);
        expect(c.worst).toBeGreaterThanOrEqual(3);
      }
    }
    expect(Object.keys(report.contrast)).toEqual(expect.arrayContaining(["spring", "valentine", "combined"]));
  }, 240_000);
});
