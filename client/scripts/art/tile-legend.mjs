#!/usr/bin/env node
/**
 * Tiled map legend and edit tool (plan G7). Replaces `scripts/a.js` (replace tile ids in every
 * chunk) and `scripts/b.js` (count catnip tiles per chunk), which hard-coded a contributor's
 * Windows paths. Paths are arguments here, resolved from the current directory on any OS.
 *
 *   node scripts/art/tile-legend.mjs legend  <map.json> [--json]
 *       every layer's gids with counts, tileset and 0-based local index
 *   node scripts/art/tile-legend.mjs count   <map.json> --gid 248 [--layer catnip] [--json]
 *       how often a gid appears, per layer and per chunk (b.js: `--gid 248 --layer catnip`)
 *   node scripts/art/tile-legend.mjs replace <map.json> --from 1058,1059 --to 159 [--layer blocks]
 *       [--out <file>] [--write]
 *       replace gids (flip flags kept) in every chunk (a.js). A dry run unless --write or --out;
 *       --write overwrites the input, --out writes a copy. Only the changed numbers are rewritten,
 *       so a Tiled-formatted file keeps its layout. `--to 0` clears the cells.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GID_MASK, layerChunks, resolveGid, tileLayers } from "./lib/tiled.mjs";

/**
 * The layer's chunks with decoded gid arrays (lib/tiled.mjs decodes uncompressed base64 layers,
 * task 6d review finding 10). `commit()` writes a changed array back, re-encoding base64 data.
 */
function chunksOf(layer) {
  const sources = layer.chunks ?? (layer.data !== undefined ? [layer] : []);
  return layerChunks(layer).map((chunk, k) => {
    const source = sources[k];
    return {
      ...chunk,
      commit() {
        if (typeof source.data === "string") {
          const buf = Buffer.alloc(chunk.data.length * 4);
          chunk.data.forEach((v, i) => buf.writeUInt32LE(Number(v) >>> 0, i * 4));
          source.data = buf.toString("base64");
        } else source.data = chunk.data;
      },
    };
  });
}

export function legend(map) {
  const out = {};
  for (const layer of tileLayers(map)) {
    const counts = new Map();
    for (const chunk of chunksOf(layer)) for (const raw of chunk.data) {
      const gid = Number(raw) & GID_MASK;
      if (gid) counts.set(gid, (counts.get(gid) ?? 0) + 1);
    }
    out[layer.name] = [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([gid, count]) => {
        const hit = resolveGid(map, gid);
        return { gid, count, tileset: hit?.tileset.name ?? null, index: hit?.index ?? null };
      });
  }
  return out;
}

export function count(map, gid, layerName) {
  const result = { gid, total: 0, layers: {} };
  for (const layer of tileLayers(map)) {
    if (layerName && layer.name !== layerName) continue;
    const perChunk = [];
    let total = 0;
    for (const chunk of chunksOf(layer)) {
      const n = chunk.data.filter((raw) => (Number(raw) & GID_MASK) === gid).length;
      if (n) perChunk.push({ x: chunk.x, y: chunk.y, count: n });
      total += n;
    }
    result.layers[layer.name] = { total, chunks: perChunk };
    result.total += total;
  }
  return result;
}

/** Replaces in place; returns the number of tiles changed. Flip and rotation bits are kept. */
export function replace(map, fromGids, toGid, layerName) {
  const from = new Set(fromGids);
  let changed = 0;
  for (const layer of tileLayers(map)) {
    if (layerName && layer.name !== layerName) continue;
    for (const chunk of chunksOf(layer)) {
      let touched = false;
      for (let i = 0; i < chunk.data.length; i++) {
        const raw = Number(chunk.data[i]);
        if (!from.has(raw & GID_MASK)) continue;
        // `--to 0` clears the cell: flip bits on an empty cell would leave a non-zero raw value.
        chunk.data[i] = toGid === 0 ? 0 : ((raw & ~GID_MASK) >>> 0) + toGid;
        changed++;
        touched = true;
      }
      if (touched) chunk.commit();
    }
  }
  return changed;
}

/**
 * The map's JSON text with only the tile data arrays rewritten, so a Tiled-formatted file (one row
 * of a chunk per line) keeps its layout and the diff shows only the changed cells. Each `"data":`
 * value is matched to the map's chunks in document order; every number of an array is replaced in
 * place. Throws when the result does not parse back to `map` (an unexpected layout), so a write
 * never reformats or corrupts a level.
 */
export function serialisePreserving(text, map) {
  const values = [];
  for (const layer of tileLayers(map)) {
    if (layer.chunks) for (const chunk of layer.chunks) values.push(chunk.data);
    else if (layer.data !== undefined) values.push(layer.data);
  }
  let k = 0;
  const out = text.replace(/"data"\s*:\s*(\[[^\]]*\]|"[^"]*")/g, (whole, value) => {
    const next = values[k++];
    if (next === undefined) throw new Error("more data arrays in the file than tile layers in the map");
    if (typeof next === "string") return whole.slice(0, whole.length - value.length) + JSON.stringify(next);
    let n = 0;
    const array = value.replace(/-?\d+/g, () => String(next[n++]));
    if (n !== next.length) throw new Error(`a data array has ${n} numbers in the file, ${next.length} in the map`);
    return whole.slice(0, whole.length - value.length) + array;
  });
  if (k !== values.length) throw new Error(`${values.length} tile data arrays in the map, ${k} in the file`);
  if (JSON.stringify(JSON.parse(out)) !== JSON.stringify(map)) throw new Error("the rewritten file does not match the map");
  return out;
}

function arg(args, name) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

function main(argv) {
  const [command, file, ...rest] = argv;
  if (!command || !file || !["legend", "count", "replace"].includes(command)) {
    console.error("usage: tile-legend.mjs legend|count|replace <map.json> [options] (see the header)");
    return 2;
  }
  const path = resolve(process.cwd(), file);
  const text = readFileSync(path, "utf8");
  const map = JSON.parse(text);
  const json = rest.includes("--json");
  const layer = arg(rest, "--layer");
  if (command === "legend") {
    const out = legend(map);
    if (json) console.log(JSON.stringify(out));
    else for (const [name, rows] of Object.entries(out)) {
      console.log(`${name}: ${rows.length} distinct tiles`);
      for (const r of rows) console.log(`  gid ${r.gid}  x${r.count}  ${r.tileset ?? "?"}#${r.index ?? "?"}`);
    }
    return 0;
  }
  if (command === "count") {
    const gid = Number(arg(rest, "--gid"));
    if (!Number.isInteger(gid) || gid <= 0) throw new Error("--gid <positive integer> is required");
    const out = count(map, gid, layer);
    if (json) console.log(JSON.stringify(out));
    else {
      for (const [name, l] of Object.entries(out.layers)) {
        console.log(`${name}: ${l.total}`);
        for (const c of l.chunks) console.log(`  chunk (${c.x}, ${c.y}): ${c.count}`);
      }
      console.log(`total gid ${gid}: ${out.total}`);
    }
    return 0;
  }
  const fromGids = String(arg(rest, "--from") ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);
  const toGid = Number(arg(rest, "--to"));
  if (!fromGids.length || !Number.isInteger(toGid) || toGid < 0) throw new Error("--from <gid,gid,...> and --to <gid> are required");
  const changed = replace(map, fromGids, toGid, layer);
  const outFile = arg(rest, "--out");
  const target = outFile ? resolve(process.cwd(), outFile) : rest.includes("--write") ? path : null;
  if (target && changed) writeFileSync(target, serialisePreserving(text, map));
  console.log(`${changed} tiles replaced${target ? (changed ? `, written to ${target}` : ", nothing written") : " (dry run: pass --write or --out)"}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
