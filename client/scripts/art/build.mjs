#!/usr/bin/env node
/**
 * The G7 art build (plan G7 bullets 1-4; decisions #46, #49, #50, #51).
 *
 *   node scripts/art/build.mjs                 palette, night sheets, plates, posters, manifest
 *   node scripts/art/build.mjs --gates         run the gates on the files on disk (no writes)
 *   node scripts/art/build.mjs --gates --json  the same, as JSON (the art tests read it)
 *   node scripts/art/build.mjs --preview DIR   also write contact sheets and scene previews to DIR
 *
 * What it writes (versioned names, F12: old art is never overwritten):
 * - `client/art/palette.json`, `client/art/palette.gpl`: tokens + hero ramps (palette.mjs).
 * - `client/public/base/<sheet>-night-v1.png`: a night skin of every runtime sheet at the SAME tile
 *   indices. Source is the shipped, extruded runtime sheet (`base/<sheet>.png`), un-extruded, graded
 *   and snapped to the look palette, the catnip tile (gid 248) redrawn as the G8 sprig, then
 *   re-extruded to the exact runtime grid (32 x 32, margin 1, spacing 2). Four `-original.png`
 *   files (summer, camp, sei, cat-winter) are stale against their runtime sheets, which is why the
 *   runtime sheet is the source.
 * - `client/public/shelter/signs-night-v1.png`: the Shelter's sign tileset, same treatment.
 * - `client/public/landing/plates/<set>-<layer>-v1.png`: far, mid, near and fog plates per set.
 * - `client/public/look/posters/<preset>-v1.webp`: the composite, shown as the CSS poster until boot.
 * - `client/public/look/manifest.json`: everything the runtime (6e) and the reel need.
 *
 * Gates (exit 1 on failure): every plate and night sheet pixel in its look palette (hard); every
 * plate edge-SSIM >= 0.85 against its ungraded source; no plate with a straight bottom or top alpha
 * edge (the runtime's look/plateCheck.ts rule) or a tall vertical alpha wall; night sheets have the
 * source's grid and alpha mask (indices and silhouettes unchanged); every collidable tile used by
 * the maps of a sheet has a lit edge >= 3:1 on the sides that face open air in those maps, and
 * every hazard tile >= 3:1 as a whole, against the bright end (p90) of the band of every plate set
 * that sheet is shown on.
 *
 * Uploading to the CDN is a deferred manual step (cdn-sync), never done here.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contrastRatio, hexToRgb } from "./lib/color.mjs";
import { cellLuminance, COLLIDABLE_LAYERS, contrastGate, gameplayGids, horizontalEdgeRun, minCropRun, offPalette, openSides, pixelsLuminance, rimPixels, straightEdgeRun, verticalWallRun } from "./lib/gates.mjs";
import { gradeImage } from "./lib/grade.mjs";
import { bandLuminance, buildPlateSet, plateGeometry } from "./lib/plates.mjs";
import {
  alphaMaskDiff,
  blank,
  clone,
  compositeOver,
  EXTRUDE_PROFILES,
  extrude,
  extrudedSize,
  putCell,
  readRgba,
  resizeNearest,
  tileCell,
  toSharp,
  unextrude,
  writePng,
} from "./lib/raster.mjs";
import { readMap, sideExposure } from "./lib/tiled.mjs";
import {
  EXTRA_SHEETS,
  LOOK_ASSET_VERSION,
  nightSheetFile,
  PLATE_LAYERS,
  PLATE_NATIVE,
  PLATE_SETS,
  plateFile,
  RIM_OPEN_SHARE,
  posterFile,
  readLevelTables,
  scenePresets,
  SHEETS,
  sheetName,
  TILE_GRADES,
  TILE_ROLES,
} from "./looks.mjs";
import { buildPalette, lookPalette, toGpl } from "./palette.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CLIENT = resolve(HERE, "..", "..");
const PUBLIC = join(CLIENT, "public");
const ART = join(CLIENT, "art");

/**
 * The tallest vertical alpha wall a plate may have, in art px. A cut-out block leaves one as tall
 * as the cut (154 rows before the fix); the hero's own pillar edges reach 66.
 */
export const PLATE_WALL_MAX = 80;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const fileSha = (rel) => sha256(readFileSync(join(PUBLIC, rel)));

/** Which plate sets each sheet is shown on, and the maps that use it (for the contrast gate). */
export function sheetUsage(tables) {
  const usage = {};
  for (const sheet of Object.keys(SHEETS)) usage[sheet] = { sets: new Set(), maps: [] };
  const presets = scenePresets();
  for (const preset of Object.values(presets)) {
    usage[preset.sheet].sets.add(preset.plates);
    for (const m of preset.maps) usage[preset.sheet].maps.push(`catbassadors/${m.split("/").pop()}`);
  }
  for (const [level, mapValue] of Object.entries(tables.purrsuit)) {
    const sheet = sheetName(mapValue);
    usage[sheet].sets.add(`purrsuit-${sheet}`);
    usage[sheet].maps.push(`catnip-chaos/levels/level-${level}.json`);
  }
  for (const level of Object.keys(tables.cupid)) usage.valentine.maps.push(`pixel-rescue/levels/level-${level}.json`);
  return usage;
}

function sheetGrade(sheet) {
  const kind = SHEETS[sheet].grade;
  if (kind !== "family") return TILE_GRADES[kind];
  const set = PLATE_SETS[`purrsuit-${sheet}`];
  const base = TILE_GRADES.family;
  return { ...base, tint: { ...base.tint, hue: set ? set.hue : base.tint.hue } };
}

/** The palette a sheet is snapped to: its primary plate set's look palette. */
export function sheetPaletteSet(sheet) {
  if (sheet === "spring") return "hub-night";
  if (sheet === "valentine") return "cupid-night";
  return `purrsuit-${sheet}`;
}

async function sprigCell() {
  const pal = JSON.parse(readFileSync(join(ART, "catnip", "palette.json"), "utf8")).colors;
  const rows = readFileSync(join(ART, "catnip", "catnip-32.txt"), "utf8").trimEnd().split("\n");
  const cell = blank(32, 32);
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "." || !pal[ch]) return;
      const [r, g, b] = hexToRgb(pal[ch]);
      cell.data.set([r, g, b, 255], (y * 32 + x) * 4);
    });
  });
  return cell;
}

/**
 * Art groups of an authored sheet: union-find over cells, joining two neighbours when at least
 * four pixel pairs across their shared edge are both opaque.
 */
export function artGroups(img, cols, rows) {
  const parent = Array.from({ length: cols * rows }, (_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const alpha = (x, y) => img.data[(y * img.width + x) * 4 + 3] > 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (col + 1 < cols) {
        let n = 0;
        for (let y = 0; y < 32; y++) if (alpha(col * 32 + 31, row * 32 + y) && alpha(col * 32 + 32, row * 32 + y)) n++;
        if (n >= 4) parent[find(i)] = find(i + 1);
      }
      if (row + 1 < rows) {
        let n = 0;
        for (let x = 0; x < 32; x++) if (alpha(col * 32 + x, row * 32 + 31) && alpha(col * 32 + x, row * 32 + 32)) n++;
        if (n >= 4) parent[find(i)] = find(i + cols);
      }
    }
  }
  return parent.map((_, i) => find(i));
}

/** A night skin of one runtime sheet, before extrusion (authored grid), plus the extruded sheet. */
export async function nightSheet(sheet, palette, contrast = null) {
  const profile = EXTRUDE_PROFILES[SHEETS[sheet].profile];
  const runtime = await readRgba(join(PUBLIC, `base/${sheet}.png`));
  const { image: authored, cols, rows } = unextrude(runtime, profile);
  const hues = lookPalette(palette, sheetPaletteSet(sheet));
  const grade = sheetGrade(sheet);
  const hazardPixels = new Set(TILE_ROLES.hazards.map((gid) => gid - 1));
  const night = clone(authored);
  gradeImage(night, hues, (p) => {
    const x = p % night.width;
    const y = Math.floor(p / night.width);
    const index = Math.floor(y / 32) * cols + Math.floor(x / 32);
    if (hazardPixels.has(index)) return TILE_GRADES.hazard;
    return grade;
  });
  // Contrast (task 6d review, finding 2): fills stay at the night value. A collidable tile gets a
  // lit 1 px edge on the sides that face open air in the maps (top, outer left and right), graded
  // from its own night colour toward the warm lamp light; the edge's lift grows in 0.04 steps until
  // its mean is 3:1 against the band's bright end. A hazard keeps its silhouette and is lifted as
  // a whole cell instead. One step per art group (cells joined across a shared edge), so a terrain
  // block never gets mismatched edges. The gate below re-measures every tile independently.
  const lifted = [];
  if (contrast) {
    const { gids, bandLum, min, sidesOf } = contrast;
    const groups = artGroups(authored, cols, rows);
    const rimStep = new Map();
    const hazardStep = new Map();
    const rimCell = (index, step) => {
      const cell = tileCell(night, index);
      const pixels = rimPixels(cell, sidesOf(index + 1));
      const rim = clone(cell);
      gradeImage(rim, hues, () => ({ ...TILE_GRADES.rim, lift: TILE_GRADES.rim.lift + 0.04 * step }));
      for (const p of pixels) cell.data.set(rim.data.subarray(p * 4, p * 4 + 4), p * 4);
      return { cell, pixels };
    };
    for (const gid of gids.collidable) {
      const index = gid - 1;
      if (hazardPixels.has(index) || !sidesOf(gid).length) continue;
      let step = 0;
      for (; step < 12; step++) {
        const { cell, pixels } = rimCell(index, step);
        const lum = pixelsLuminance(cell, pixels);
        if (lum === null || contrastRatio(lum, bandLum) >= min) break;
      }
      rimStep.set(groups[index], Math.max(rimStep.get(groups[index]) ?? 0, step));
    }
    for (const gid of gids.hazards) {
      const index = gid - 1;
      if (cellLuminance(tileCell(night, index)) === null) continue;
      let step = 0;
      let cell = tileCell(night, index);
      while (contrastRatio(cellLuminance(cell), bandLum) < min && step < 14) {
        step++;
        cell = tileCell(authored, index);
        gradeImage(cell, hues, () => ({ ...TILE_GRADES.hazard, lift: TILE_GRADES.hazard.lift + 0.03 * step }));
      }
      if (step) hazardStep.set(groups[index], Math.max(hazardStep.get(groups[index]) ?? 0, step));
    }
    for (let index = 0; index < cols * rows; index++) {
      const gid = index + 1;
      const hStep = hazardStep.get(groups[index]);
      if (hStep && hazardPixels.has(index)) {
        const cell = tileCell(authored, index);
        gradeImage(cell, hues, () => ({ ...TILE_GRADES.hazard, lift: TILE_GRADES.hazard.lift + 0.03 * hStep }));
        putCell(night, index, cell);
        lifted.push({ gid, lift: Number((0.03 * hStep).toFixed(2)) });
        continue;
      }
      const step = rimStep.get(groups[index]);
      if (step === undefined || hazardPixels.has(index) || !sidesOf(gid).length) continue;
      putCell(night, index, rimCell(index, step).cell);
      lifted.push({ gid, rim: sidesOf(gid), lift: Number((TILE_GRADES.rim.lift + 0.04 * step).toFixed(2)) });
    }
  }
  // G8: the catnip tile is redrawn as the sprig at the same index (Purrsuit swaps it for the
  // catnip-coin sprite at runtime; any map that shows it as a tile now shows the sprig).
  const catnipIndex = TILE_ROLES.catnip - 1;
  if (catnipIndex < cols * rows && tileCell(authored, catnipIndex).data.some((v, i) => i % 4 === 3 && v > 0)) {
    putCell(night, catnipIndex, await sprigCell());
  }
  return { authored, night, extruded: extrude(night, profile), cols, rows, runtime, lifted };
}

async function nightExtra(id, palette) {
  const spec = EXTRA_SHEETS[id];
  const src = await readRgba(join(PUBLIC, spec.file));
  const night = gradeImage(clone(src), lookPalette(palette, "hub-dusk"), () => TILE_GRADES.signs);
  return { src, night };
}

function ensureDir(file) {
  mkdirSync(dirname(file), { recursive: true });
}

function rel(file) {
  return relative(PUBLIC, file).split("\\").join("/");
}

/** The cat-shaped sample used in previews: a cream block so a reviewer can judge legibility. */
function levelPreview(map, cellAt, composite, tilesWide = 40, tilesHigh = 12) {
  // Find the densest window of the `blocks` layer.
  const layers = (map.layers ?? []).filter((l) => l.type === "tilelayer");
  const grid = new Map();
  for (const layer of layers) {
    if (layer.name === "physics" || layer.name === "catnip") continue;
    for (const chunk of layer.chunks ?? []) {
      chunk.data.forEach((gid, i) => {
        if (!gid) return;
        const x = chunk.x + (i % chunk.width);
        const y = chunk.y + Math.floor(i / chunk.width);
        const key = `${x},${y}`;
        const list = grid.get(key) ?? [];
        const g = Number(gid) & 0x1fffffff;
        if (layer.name === "decorations" && TILE_ROLES.backdrop.includes(g)) return;
        list.push(g);
        grid.set(key, list);
      });
    }
  }
  // The window with the most tiles that are not plain fill (63 dirt, 3 ground) reads best.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const key of grid.keys()) {
    const [x, y] = key.split(",").map(Number);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  // Summed-area table over the bounding box, so the window search is linear in the map size.
  const gw = maxX - minX + 1;
  const gh = maxY - minY + 1;
  const sat = new Float64Array((gw + 1) * (gh + 1));
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const list = grid.get(`${minX + x},${minY + y}`);
      const v = list ? (list.some((g) => g !== 63 && g !== 3) ? 3 : 1) : 0;
      sat[(y + 1) * (gw + 1) + x + 1] = v + sat[y * (gw + 1) + x + 1] + sat[(y + 1) * (gw + 1) + x] - sat[y * (gw + 1) + x];
    }
  }
  const sum = (x, y, w, h) => {
    const x2 = Math.min(gw, x + w);
    const y2 = Math.min(gh, y + h);
    return sat[y2 * (gw + 1) + x2] - sat[y * (gw + 1) + x2] - sat[y2 * (gw + 1) + x] + sat[y * (gw + 1) + x];
  };
  let ox = minX;
  let oy = minY;
  let best = -1;
  for (let y = 0; y <= Math.max(0, gh - tilesHigh); y++) {
    for (let x = 0; x <= Math.max(0, gw - tilesWide); x++) {
      const score = sum(x, y, tilesWide, tilesHigh);
      if (score > best) {
        best = score;
        ox = minX + x;
        oy = minY + y;
      }
    }
  }
  const W = tilesWide * 32;
  const H = tilesHigh * 32;
  const bg = resizeNearest(composite, Math.round((composite.width * H) / composite.height), H);
  const out = blank(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = (y * bg.width + (x % bg.width)) * 4;
    out.data.set(bg.data.subarray(si, si + 4), (y * W + x) * 4);
  }
  for (let ty = 0; ty < tilesHigh; ty++) {
    for (let tx = 0; tx < tilesWide; tx++) {
      for (const gid of grid.get(`${ox + tx},${oy + ty}`) ?? []) {
        const cell = cellAt(gid);
        if (!cell) continue;
        const tile = blank(W, H);
        for (let y = 0; y < 32; y++) tile.data.set(cell.data.subarray(y * 128, y * 128 + 128), ((ty * 32 + y) * W + tx * 32) * 4);
        compositeOver(out, tile);
      }
    }
  }
  return out;
}

async function build({ write, previewDir, json }) {
  const tables = readLevelTables(CLIENT);
  const report = { ok: true, errors: [], sheets: {}, plates: {}, contrast: {}, written: [] };
  const fail = (msg) => {
    report.ok = false;
    report.errors.push(msg);
  };

  // 1. Palette.
  const palette = await buildPalette(CLIENT);
  const palettePath = join(ART, "palette.json");
  const paletteText = `${JSON.stringify(palette, null, 2)}\n`;
  if (write) {
    writeFileSync(palettePath, paletteText);
    writeFileSync(join(ART, "palette.gpl"), toGpl(palette));
    report.written.push("client/art/palette.json", "client/art/palette.gpl");
  } else if (!existsSync(palettePath) || readFileSync(palettePath, "utf8") !== paletteText) {
    fail("client/art/palette.json is stale: run node scripts/art/build.mjs");
  }
  for (const set of Object.keys(PLATE_SETS)) {
    const n = lookPalette(palette, set).length;
    if (n > palette.rules.maxColoursPerLook) fail(`look palette ${set} has ${n} colours (max 256)`);
  }

  // 2. Plates (geometry once, a palette pass per set).
  const geometry = await plateGeometry(CLIENT, PLATE_NATIVE);
  const plateResults = {};
  let seed = 1;
  for (const [setId, set] of Object.entries(PLATE_SETS)) {
    const hexes = lookPalette(palette, setId);
    const result = await buildPlateSet(geometry, set, hexes, palette.looks[setId].ramp, seed++);
    plateResults[setId] = result;
    const band = bandLuminance(result.composite);
    report.plates[setId] = { ssim: Object.fromEntries(Object.entries(result.ssim).map(([k, v]) => [k, Number(v.toFixed(3))])), band: Number(band.mean.toFixed(4)), bandP90: Number(band.p90.toFixed(4)) };
    for (const [layer, value] of Object.entries(result.ssim)) {
      if (value < palette.rules.plateEdgeSsimMin) fail(`plate ${setId}/${layer} edge-SSIM ${value.toFixed(3)} < ${palette.rules.plateEdgeSsimMin}`);
    }
    report.plates[setId].edges = {};
    for (const layer of PLATE_LAYERS) {
      const img = result.wrapped[layer.name];
      // The runtime rejects a plate with a straight crop (look/plateCheck.ts); a flat top edge or a
      // tall vertical alpha wall reads as the same hard-edged block (task 6d review, finding 1).
      const edges = { bottom: straightEdgeRun(img), top: straightEdgeRun(img, { from: "top" }), ledge: horizontalEdgeRun(img), wall: verticalWallRun(img) };
      report.plates[setId].edges[layer.name] = edges;
      const limit = minCropRun(img.width);
      if (edges.bottom >= limit) fail(`plate ${setId}/${layer.name}: straight bottom edge ${edges.bottom} columns (limit ${limit})`);
      if (edges.top >= limit) fail(`plate ${setId}/${layer.name}: straight top edge ${edges.top} columns (limit ${limit})`);
      if (edges.ledge >= limit) fail(`plate ${setId}/${layer.name}: straight horizontal alpha edge ${edges.ledge} columns (limit ${limit})`);
      if (edges.wall >= PLATE_WALL_MAX) fail(`plate ${setId}/${layer.name}: vertical alpha wall ${edges.wall} rows (limit ${PLATE_WALL_MAX})`);
      const off = offPalette(img, hexes);
      if (off.size) fail(`plate ${setId}/${layer.name} has ${off.size} colours outside its palette`);
      const file = join(PUBLIC, plateFile(setId, layer.name));
      if (write) {
        ensureDir(file);
        await writePng(img, file, { palette: true });
        report.written.push(`client/public/${plateFile(setId, layer.name)}`);
      } else if (existsSync(file)) {
        const disk = await readRgba(file);
        if (disk.width !== img.width || disk.height !== img.height) fail(`${plateFile(setId, layer.name)} size differs from a rebuild`);
        const diskOff = offPalette(disk, hexes);
        if (diskOff.size) fail(`${plateFile(setId, layer.name)} on disk has ${diskOff.size} colours outside its palette`);
        if (straightEdgeRun(disk) >= limit || straightEdgeRun(disk, { from: "top" }) >= limit || horizontalEdgeRun(disk) >= limit || verticalWallRun(disk) >= PLATE_WALL_MAX) fail(`${plateFile(setId, layer.name)} on disk has a straight edge or wall: rebuild`);
      } else fail(`missing ${plateFile(setId, layer.name)}`);
    }
  }

  // 3. Night sheets and the contrast gate.
  const usage = sheetUsage(tables);
  const sheetsOut = {};
  for (const sheet of Object.keys(SHEETS)) {
    const maps = usage[sheet].maps.map((m) => readMap(join(PUBLIC, m)));
    const runtimeSize = EXTRUDE_PROFILES[SHEETS[sheet].profile];
    const probe = unextrude(await readRgba(join(PUBLIC, `base/${sheet}.png`)), runtimeSize);
    const gids = gameplayGids(maps, probe.cols * probe.rows, TILE_ROLES.hazards);
    // The catnip cell is a pickup (the runtime swaps it for the coin sprite), redrawn as the sprig.
    gids.collidable.delete(TILE_ROLES.catnip);
    const exposure = sideExposure(maps, COLLIDABLE_LAYERS);
    const sidesOf = (gid) => openSides(exposure.get(gid), RIM_OPEN_SHARE);
    const brightest = Math.max(...[...usage[sheet].sets].map((setId) => bandLuminance(plateResults[setId].composite).p90));
    const result = await nightSheet(sheet, palette, { gids, bandLum: brightest, min: palette.rules.collidableContrastMin, sidesOf });
    sheetsOut[sheet] = result;
    const profile = SHEETS[sheet].profile;
    const expected = extrudedSize(result.cols, result.rows, profile);
    if (result.extruded.width !== expected.width || result.extruded.height !== expected.height) fail(`${sheet}: extruded size ${result.extruded.width}x${result.extruded.height} != ${expected.width}x${expected.height}`);
    if (result.extruded.width !== result.runtime.width || result.extruded.height !== result.runtime.height) fail(`${sheet}: night sheet grid differs from base/${sheet}.png`);
    const catnipIndex = TILE_ROLES.catnip - 1;
    const maskNight = clone(result.night);
    const maskAuthored = clone(result.authored);
    // The sprig has its own silhouette by design; every other tile keeps its mask exactly.
    if (catnipIndex < result.cols * result.rows) {
      putCell(maskNight, catnipIndex, blank(32, 32));
      putCell(maskAuthored, catnipIndex, blank(32, 32));
    }
    const maskDiff = alphaMaskDiff(maskAuthored, maskNight);
    if (maskDiff) fail(`${sheet}: ${maskDiff} pixels changed silhouette`);
    const hexes = lookPalette(palette, sheetPaletteSet(sheet));
    const off = offPalette(result.extruded, hexes);
    if (off.size) fail(`${sheet}: ${off.size} colours outside the ${sheetPaletteSet(sheet)} palette`);

    const tileCount = result.cols * result.rows;
    for (const map of maps) {
      const set = (map.tilesets ?? []).find((t) => t.firstgid === 1);
      if (set && (set.columns !== result.cols || set.tilecount !== tileCount)) fail(`${sheet}: a map's tileset is ${set.columns} cols / ${set.tilecount} tiles, the sheet ${result.cols} / ${tileCount}`);
    }
    const cellAt = (gid) => tileCell(result.night, gid - 1);
    report.contrast[sheet] = {};
    for (const setId of usage[sheet].sets) {
      const band = bandLuminance(plateResults[setId].composite).p90;
      const gate = contrastGate({ gids, cellAt, bandLum: band, min: palette.rules.collidableContrastMin, sidesOf });
      report.contrast[sheet][setId] = { worst: gate.worst, failures: gate.failures.length, interior: gate.interior, tiles: gids.collidable.size + gids.hazards.size };
      if (gate.failures.length) fail(`${sheet} on ${setId}: ${gate.failures.length} tiles under 3:1 (worst ${gate.worst}): ${gate.failures.slice(0, 8).map((f) => `${f.kind} ${f.gid} ${f.ratio}`).join(", ")}`);
    }
    report.sheets[sheet] = { cols: result.cols, rows: result.rows, profile, file: nightSheetFile(sheet), colours: hexes.length, lifted: result.lifted.length };

    const file = join(PUBLIC, nightSheetFile(sheet));
    if (write) {
      await writePng(result.extruded, file, { palette: true });
      report.written.push(`client/public/${nightSheetFile(sheet)}`);
    } else if (!existsSync(file)) fail(`missing ${nightSheetFile(sheet)}`);
  }
  for (const [id, spec] of Object.entries(EXTRA_SHEETS)) {
    const { src, night } = await nightExtra(id, palette);
    if (alphaMaskDiff(src, night)) fail(`${id}: silhouette changed`);
    if (write) {
      await writePng(night, join(PUBLIC, spec.out), { palette: true });
      report.written.push(`client/public/${spec.out}`);
    } else if (!existsSync(join(PUBLIC, spec.out))) fail(`missing ${spec.out}`);
  }

  // 4. Posters and the manifest.
  const presets = {};
  const presetDefs = scenePresets();
  const addPreset = (id, def) => {
    const poster = posterFile(id);
    presets[id] = {
      scene: def.scene,
      v0: { tileset: `base/${def.v0Sheet ?? def.sheet}.png`, background: def.v0Background ?? null },
      v1: {
        tileset: nightSheetFile(def.sheet),
        plates: def.plates,
        mood: PLATE_SETS[def.plates].mood,
        background: "#0b0820",
        poster,
        ...(def.extra ? { extraTilesets: Object.fromEntries(def.extra.map((x) => [x, EXTRA_SHEETS[x].out])) } : {}),
      },
    };
  };
  addPreset("home", presetDefs.home);
  addPreset("shelter", presetDefs.shelter);
  addPreset("cupid", presetDefs.cupid);
  const purrsuitFamilies = {};
  for (const mapValue of [...new Set(Object.values(tables.purrsuit))]) {
    const sheet = sheetName(mapValue);
    const id = `purrsuit/${sheet}`;
    purrsuitFamilies[mapValue] = id;
    addPreset(id, { scene: "CatnipChaos", sheet, plates: `purrsuit-${sheet}` });
  }
  for (const [id, preset] of Object.entries(presets)) {
    const file = join(PUBLIC, preset.v1.poster);
    if (write) {
      const comp = plateResults[preset.v1.plates].composite;
      ensureDir(file);
      await toSharp(resizeNearest(comp, comp.width * 2, comp.height * 2)).webp({ quality: 80, effort: 6 }).toFile(file);
      report.written.push(`client/public/${preset.v1.poster}`);
    } else if (!existsSync(file)) fail(`missing poster for ${id}`);
  }

  const manifestPath = join(PUBLIC, "look", "manifest.json");
  if (write) {
    const tilesets = {};
    for (const [sheet, r] of Object.entries(sheetsOut)) {
      const p = EXTRUDE_PROFILES[SHEETS[sheet].profile];
      tilesets[nightSheetFile(sheet)] = {
        source: `base/${sheet}.png`,
        profile: SHEETS[sheet].profile,
        tileWidth: p.tileWidth,
        tileHeight: p.tileHeight,
        margin: p.margin,
        spacing: p.spacing,
        columns: r.cols,
        rows: r.rows,
        tileCount: r.cols * r.rows,
        width: r.extruded.width,
        height: r.extruded.height,
        palette: sheetPaletteSet(sheet),
        sha256: fileSha(nightSheetFile(sheet)),
      };
    }
    for (const spec of Object.values(EXTRA_SHEETS)) {
      tilesets[spec.out] = { source: spec.file, profile: "plain", tileWidth: spec.tile, tileHeight: spec.tile, margin: 0, spacing: 0, palette: "hub-dusk", sha256: fileSha(spec.out) };
    }
    const plates = {};
    for (const [setId, set] of Object.entries(PLATE_SETS)) {
      plates[setId] = {
        mood: set.mood,
        nativeWidth: PLATE_NATIVE.width,
        nativeHeight: PLATE_NATIVE.height,
        layers: PLATE_LAYERS.map((layer, depth) => {
          const img = plateResults[setId].wrapped[layer.name];
          return {
            name: layer.name,
            file: plateFile(setId, layer.name),
            width: img.width,
            height: img.height,
            scrollFactor: layer.scrollFactor,
            anchor: layer.anchor,
            tileX: true,
            order: depth,
            sha256: fileSha(plateFile(setId, layer.name)),
          };
        }),
      };
    }
    const manifest = {
      schemaVersion: 1,
      lookVersion: "v1",
      versions: ["v0", "v1"],
      assetVersion: LOOK_ASSET_VERSION,
      generator: "client/scripts/art/build.mjs",
      paletteSha256: sha256(paletteText).slice(0, 16),
      rollback:
        "Set lookVersion to \"v0\" here (no rebuild: the runtime fetches this file), or use the per-device localStorage override the runtime reads (task 6e).",
      tilesets,
      plates,
      presets,
      purrsuitFamilies,
      cupidLevels: Object.keys(tables.cupid),
      backdrop: { layer: "decorations", gids: TILE_ROLES.backdrop, scenes: ["home", "shelter", "cupid"] },
      hazardGids: TILE_ROLES.hazards,
      hubMap: { id: "SPRING_NIGHT", tileset: nightSheetFile("spring"), scenes: ["home", "shelter"] },
    };
    ensureDir(manifestPath);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    report.written.push("client/public/look/manifest.json");
  } else if (!existsSync(manifestPath)) fail("missing client/public/look/manifest.json");

  // 5. Previews for founder sign-off (scratch only).
  if (previewDir) {
    mkdirSync(previewDir, { recursive: true });
    for (const [sheet, r] of Object.entries(sheetsOut)) {
      const w = Math.min(r.authored.width, 1920);
      const pair = blank(w, r.authored.height * 2 + 8);
      const crop = (img) => {
        const out = blank(w, img.height);
        for (let y = 0; y < img.height; y++) out.data.set(img.data.subarray(y * img.width * 4, y * img.width * 4 + w * 4), y * w * 4);
        return out;
      };
      const grey = blank(w, pair.height);
      grey.data.fill(0);
      for (let i = 0; i < grey.data.length; i += 4) grey.data.set([24, 20, 44, 255], i);
      compositeOver(pair, grey);
      const top = crop(r.authored);
      const bottom = crop(r.night);
      for (let y = 0; y < top.height; y++) pair.data.set(top.data.subarray(y * w * 4, (y + 1) * w * 4), y * w * 4);
      const t2 = blank(w, pair.height);
      for (let y = 0; y < bottom.height; y++) t2.data.set(bottom.data.subarray(y * w * 4, (y + 1) * w * 4), (y + top.height + 8) * w * 4);
      compositeOver(pair, t2);
      await toSharp(resizeNearest(pair, pair.width * 2, pair.height * 2)).png().toFile(join(previewDir, `sheet-${sheet}.png`));
      for (const setId of usage[sheet].sets) {
        const mapRel = usage[sheet].maps.find((m) => (setId.startsWith("hub-dusk") ? m.includes("shelter") : setId.startsWith("hub-night") ? m.includes("base.json") : true));
        if (!mapRel) continue;
        const map = readMap(join(PUBLIC, mapRel));
        const scene = levelPreview(map, (gid) => (gid >= 1 && gid <= r.cols * r.rows ? tileCell(r.night, gid - 1) : null), plateResults[setId].composite);
        const before = levelPreview(map, (gid) => (gid >= 1 && gid <= r.cols * r.rows ? tileCell(r.authored, gid - 1) : null), blank(16, 16));
        const both = blank(scene.width, scene.height * 2);
        both.data.set(before.data, 0);
        both.data.set(scene.data, scene.data.length);
        await toSharp(resizeNearest(both, both.width, both.height)).png().toFile(join(previewDir, `scene-${setId}-${sheet}.png`));
      }
    }
    for (const [setId, r] of Object.entries(plateResults)) {
      const strip = blank(r.composite.width * 5, r.composite.height);
      const layers = [r.layers.far, r.layers.mid, r.layers.near, r.layers.fog, r.composite];
      layers.forEach((img, k) => {
        const checker = blank(img.width, img.height);
        for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) checker.data.set(((x >> 3) + (y >> 3)) % 2 ? [60, 60, 70, 255] : [90, 90, 100, 255], (y * img.width + x) * 4);
        compositeOver(checker, img);
        for (let y = 0; y < img.height; y++) strip.data.set(checker.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), (y * strip.width + k * img.width) * 4);
      });
      await toSharp(strip).png().toFile(join(previewDir, `plates-${setId}.png`));
    }
  }

  if (json) process.stdout.write(`${JSON.stringify(report)}\n`);
  else {
    for (const line of report.written) console.log(`wrote ${line}`);
    for (const [set, p] of Object.entries(report.plates)) console.log(`plate ${set}: edge-SSIM ${JSON.stringify(p.ssim)} band mean ${p.band} p90 ${p.bandP90} edges ${JSON.stringify(p.edges)}`);
    for (const [sheet, c] of Object.entries(report.contrast)) console.log(`contrast ${sheet}: ${JSON.stringify(c)}`);
    for (const e of report.errors) console.error(`FAIL ${e}`);
    console.log(report.ok ? "art gates: pass" : "art gates: FAIL");
  }
  return report;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const previewAt = args.indexOf("--preview");
  const report = await build({
    write: !args.includes("--gates"),
    json: args.includes("--json"),
    previewDir: previewAt >= 0 ? resolve(args[previewAt + 1]) : null,
  });
  process.exitCode = report.ok ? 0 : 1;
}

export { build, readdirSync, rel };
