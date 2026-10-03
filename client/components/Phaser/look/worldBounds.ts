/**
 * World bounds from Tiled map data (plan G7 "Camera").
 *
 * The hub and level maps are Tiled *infinite* maps: their tiles live in 16x16 chunks at any
 * (negative) position, so `tilemap.widthInPixels` (the layer's tile count times the tile width,
 * from 0) is not where the world is. `computeWorldBounds` reads the raw JSON (Phaser keeps it in
 * `scene.cache.tilemap.get(key).data`) and returns the pixel rectangle of every non-empty tile
 * across the tile layers, placed the way Phaser places them (ParseTileLayers: layer offset plus
 * chunk position times the tile size). Finite maps use their `data` arrays the same way.
 *
 * Pure module: no Phaser import (Jest, SSR).
 */

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TiledChunk {
  x: number;
  y: number;
  width: number;
  height: number;
  data: number[] | string;
}

interface TiledLayer {
  type?: string;
  name?: string;
  visible?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  offsetx?: number;
  offsety?: number;
  startx?: number;
  starty?: number;
  data?: number[] | string;
  chunks?: TiledChunk[];
  layers?: TiledLayer[];
}

export interface TiledMapLike {
  infinite?: boolean;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
}

export interface WorldBoundsOptions {
  /** Only these tile layers (default: every tile layer). */
  layers?: readonly string[];
}

/** Tile ids carry flip flags in the top three bits; any id > 0 is a tile. */
const isTile = (gid: number) => (gid & 0x1fffffff) > 0;

export function computeWorldBounds(map: TiledMapLike, options: WorldBoundsOptions = {}): Bounds | null {
  const tw = map.tilewidth;
  const th = map.tileheight;
  if (!(tw > 0) || !(th > 0) || !Array.isArray(map.layers)) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (px: number, py: number) => {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px + tw > maxX) maxX = px + tw;
    if (py + th > maxY) maxY = py + th;
  };

  const scanGrid = (data: number[], width: number, originX: number, originY: number) => {
    for (let i = 0; i < data.length; i += 1) {
      if (!isTile(data[i])) continue;
      include(originX + (i % width) * tw, originY + Math.floor(i / width) * th);
    }
  };

  const visit = (layer: TiledLayer, groupX: number, groupY: number) => {
    if (layer.type === "group" && Array.isArray(layer.layers)) {
      const gx = groupX + (layer.offsetx ?? 0);
      const gy = groupY + (layer.offsety ?? 0);
      layer.layers.forEach((child) => visit(child, gx, gy));
      return;
    }
    if (layer.type !== "tilelayer") return;
    if (options.layers && !options.layers.includes(layer.name ?? "")) return;
    const ox = groupX + (layer.offsetx ?? 0);
    const oy = groupY + (layer.offsety ?? 0);
    if (Array.isArray(layer.chunks)) {
      layer.chunks.forEach((chunk) => {
        if (!Array.isArray(chunk.data)) return;
        scanGrid(chunk.data, chunk.width, ox + ((layer.x ?? 0) + chunk.x) * tw, oy + ((layer.y ?? 0) + chunk.y) * th);
      });
    } else if (Array.isArray(layer.data) && layer.width) {
      scanGrid(layer.data, layer.width, ox + (layer.x ?? 0) * tw, oy + (layer.y ?? 0) * th);
    }
  };

  map.layers.forEach((layer) => visit(layer, 0, 0));
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface CameraBoundsOptions {
  /** Extra room above the top tile (sky the cat can jump into), in world px. */
  skyMargin?: number;
}

/**
 * Bounds for `camera.setBounds`: the world, grown by the sky margin, and grown to the view where
 * the world is smaller (Phaser clamps a too-small world to its left/top edge, leaving void on
 * one side): centred horizontally, and upwards vertically so the ground stays at the bottom and
 * the extra room is sky (backdrop), never below-ground void.
 */
export function cameraBounds(
  world: Bounds,
  view: { width: number; height: number },
  options: CameraBoundsOptions = {},
): Bounds {
  const sky = Math.max(0, options.skyMargin ?? 0);
  let { x, width } = world;
  let y = world.y - sky;
  let height = world.height + sky;
  if (width < view.width) {
    x -= (view.width - width) / 2;
    width = view.width;
  }
  if (height < view.height) {
    y -= view.height - height;
    height = view.height;
  }
  return { x: Math.floor(x), y: Math.floor(y), width: Math.ceil(width), height: Math.ceil(height) };
}

/** A walking surface: the world y of a tile row's top and how many open-topped tiles it has. */
export interface SurfaceRow {
  y: number;
  count: number;
}

/**
 * Every walking surface of the map, most tiles first (ties: the lower row first): tile rows
 * counted by the tiles that have empty space above them, in the given layers (default every
 * tile layer). Empty when the map has no tiles.
 */
export function surfaceRows(map: TiledMapLike, options: WorldBoundsOptions = {}): SurfaceRow[] {
  const tw = map.tilewidth;
  const th = map.tileheight;
  if (!(tw > 0) || !(th > 0) || !Array.isArray(map.layers)) return [];
  const filled = new Set<string>();
  const add = (data: number[], width: number, originX: number, originY: number) => {
    for (let i = 0; i < data.length; i += 1) {
      if (!isTile(data[i])) continue;
      filled.add(`${originX + (i % width)},${originY + Math.floor(i / width)}`);
    }
  };
  const visit = (layer: TiledLayer) => {
    if (layer.type === "group" && Array.isArray(layer.layers)) {
      layer.layers.forEach(visit);
      return;
    }
    if (layer.type !== "tilelayer") return;
    if (options.layers && !options.layers.includes(layer.name ?? "")) return;
    const lx = (layer.x ?? 0) + Math.round((layer.offsetx ?? 0) / tw);
    const ly = (layer.y ?? 0) + Math.round((layer.offsety ?? 0) / th);
    if (Array.isArray(layer.chunks)) {
      layer.chunks.forEach((chunk) => {
        if (Array.isArray(chunk.data)) add(chunk.data, chunk.width, lx + chunk.x, ly + chunk.y);
      });
    } else if (Array.isArray(layer.data) && layer.width) {
      add(layer.data, layer.width, lx, ly);
    }
  };
  map.layers.forEach(visit);
  const rows = new Map<number, number>();
  filled.forEach((cell) => {
    const [cx, cy] = cell.split(",").map(Number);
    if (filled.has(`${cx},${cy - 1}`)) return;
    rows.set(cy, (rows.get(cy) ?? 0) + 1);
  });
  return Array.from(rows, ([row, count]) => ({ y: row * th, count })).sort((a, b) => b.count - a.count || b.y - a.y);
}

/**
 * The world y of the most common walking surface (see surfaceRows), or null when the map has no
 * tiles.
 */
export function dominantSurfaceY(map: TiledMapLike, options: WorldBoundsOptions = {}): number | null {
  return surfaceRows(map, options)[0]?.y ?? null;
}

/**
 * The main floors a backdrop can stand its horizon on: surfaces with at least `share` of the
 * dominant one's tiles, top to bottom (Home has an upper floor and the ground).
 */
export function majorSurfaces(map: TiledMapLike, options: WorldBoundsOptions = {}, share = 0.25): number[] {
  const rows = surfaceRows(map, options);
  if (!rows.length) return [];
  const min = rows[0].count * share;
  return rows.filter((row) => row.count >= min).map((row) => row.y).sort((a, b) => a - b);
}

/**
 * The floor under a view centred at `centerY`: the highest major surface at or below
 * `centerY - lift` (lift lets a floor just above the centre still count), else the lowest one.
 */
export function horizonFor(surfaces: number[], centerY: number, lift = 0): number | null {
  if (!surfaces.length) return null;
  return surfaces.find((y) => y >= centerY - lift) ?? surfaces[surfaces.length - 1];
}
