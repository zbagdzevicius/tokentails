/**
 * Tiled JSON helpers (plan G7): every map the scenes load is an infinite, chunked Tiled map with
 * one sheet tileset at firstgid 1 (the Shelter adds `signs` and `logo`).
 */
import { readFileSync } from "node:fs";

/** Tiled stores flip and rotation flags in the top three bits of a gid. */
export const GID_MASK = 0x1fffffff;

/** Tiled's flip flags (top bits of a raw gid). */
export const FLIP_H = 0x80000000;
export const FLIP_V = 0x40000000;
export const FLIP_D = 0x20000000;

/** Every chunk of a layer with its origin and decoded data (finite maps: one chunk at 0, 0). */
export function layerChunks(layer) {
  const blocks = layer.chunks ?? (layer.data ? [{ x: 0, y: 0, width: layer.width, data: layer.data }] : []);
  const data = layerData(layer);
  return blocks.map((chunk, k) => ({ x: chunk.x ?? 0, y: chunk.y ?? 0, width: chunk.width ?? layer.width, data: data[k] }));
}

/**
 * Which sides of each tile face open air in the maps, in the tile's own (unflipped) frame:
 * `Map<gid, { n, top, bottom, left, right }>` over every placement in `layers`. A side is open
 * when no tile of those layers sits next to it. Diagonal (rotated) placements are skipped.
 */
export function sideExposure(maps, layers) {
  const out = new Map();
  for (const map of maps) {
    const cells = new Map();
    for (const layer of tileLayers(map)) {
      if (!layers.includes(layer.name)) continue;
      for (const chunk of layerChunks(layer)) {
        chunk.data.forEach((raw, i) => {
          const value = Number(raw) >>> 0;
          if ((value & GID_MASK) === 0) return;
          const key = `${chunk.x + (i % chunk.width)},${chunk.y + Math.floor(i / chunk.width)}`;
          const list = cells.get(key) ?? [];
          list.push(value);
          cells.set(key, list);
        });
      }
    }
    for (const [key, list] of cells) {
      const [x, y] = key.split(",").map(Number);
      const open = { top: !cells.has(`${x},${y - 1}`), bottom: !cells.has(`${x},${y + 1}`), left: !cells.has(`${x - 1},${y}`), right: !cells.has(`${x + 1},${y}`) };
      for (const value of list) {
        if (value & FLIP_D) continue;
        const gid = value & GID_MASK;
        const h = (value & FLIP_H) !== 0;
        const v = (value & FLIP_V) !== 0;
        const e = out.get(gid) ?? { n: 0, top: 0, bottom: 0, left: 0, right: 0 };
        e.n++;
        if (v ? open.bottom : open.top) e.top++;
        if (v ? open.top : open.bottom) e.bottom++;
        if (h ? open.right : open.left) e.left++;
        if (h ? open.left : open.right) e.right++;
        out.set(gid, e);
      }
    }
  }
  return out;
}

function layerData(layer) {
  const blocks = layer.chunks ?? (layer.data ? [{ data: layer.data }] : []);
  const out = [];
  for (const chunk of blocks) {
    let data = chunk.data;
    if (typeof data === "string") {
      if (layer.compression) throw new Error(`Compressed Tiled layer "${layer.name}" is not supported`);
      const buf = Buffer.from(data, "base64");
      data = [];
      for (let i = 0; i < buf.length; i += 4) data.push(buf.readUInt32LE(i));
    }
    out.push(data);
  }
  return out;
}

/** Every tile layer, recursing into groups. */
export function tileLayers(map) {
  const out = [];
  const walk = (layers) => {
    for (const layer of layers ?? []) {
      if (layer.type === "group") walk(layer.layers);
      else if (layer.type === "tilelayer") out.push(layer);
    }
  };
  walk(map.layers);
  return out;
}

/** `{ layerName: Map<gid, count> }` of the masked gids each layer uses (0 = empty is skipped). */
export function gidUsage(map) {
  const usage = {};
  for (const layer of tileLayers(map)) {
    const counts = usage[layer.name] ?? new Map();
    for (const data of layerData(layer)) {
      for (const raw of data) {
        const gid = Number(raw) & GID_MASK;
        if (gid === 0) continue;
        counts.set(gid, (counts.get(gid) ?? 0) + 1);
      }
    }
    usage[layer.name] = counts;
  }
  return usage;
}

/** Every chunk's data, in order, as a flat array of raw values (the "indices" a diff compares). */
export function allIndices(map) {
  const out = [];
  for (const layer of tileLayers(map)) {
    out.push(layer.name);
    for (const data of layerData(layer)) out.push(...data.map(Number));
  }
  return out;
}

/** The tileset whose range holds a gid, with the 0-based local tile index. */
export function resolveGid(map, gid) {
  const sets = [...(map.tilesets ?? [])].sort((a, b) => b.firstgid - a.firstgid);
  for (const set of sets) if (gid >= set.firstgid) return { tileset: set, index: gid - set.firstgid };
  return null;
}

export function readMap(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * The night variant of a map as the runtime sees it: the same JSON with each skinned tileset's
 * image swapped. Nothing else changes, which is what the "indices unchanged" diff proves.
 */
export function nightVariant(map, imageFor) {
  const copy = JSON.parse(JSON.stringify(map));
  for (const set of copy.tilesets ?? []) {
    const next = imageFor(set);
    if (next) set.image = next;
  }
  return copy;
}

/** A structural diff of two JSON values: the list of paths whose values differ. */
export function jsonDiff(a, b, path = "$", out = []) {
  if (Object.is(a, b)) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    out.push(path);
    return out;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push(path);
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) jsonDiff(a[key], b[key], Array.isArray(a) ? `${path}[${key}]` : `${path}.${key}`, out);
  return out;
}
