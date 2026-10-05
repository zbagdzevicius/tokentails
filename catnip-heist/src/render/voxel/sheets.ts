/**
 * Spritesheet loading, frame detection and cached voxel geometry (browser side).
 *
 * - loadManifest() fetches public/assets/manifest.json.
 * - loadVoxelSheet(entry) decodes a sheet PNG to pixels once (cached per URL).
 * - getFrameGeometry(sheet, row, frame) extrudes one frame into a merged BufferGeometry, cached per
 *   (sheet, row, frame). Geometries are shared: never dispose one you got from the cache yourself;
 *   use clearVoxelCache() when leaving a scene for good.
 * - voxelizeImage(url, size) turns an arbitrary icon (coin, catnip...) into a voxel geometry at a
 *   downsampled resolution.
 *
 * Geometry units are pixels (1 voxel = 1 unit). Scale the mesh by VOXEL_WORLD_SCALE (or your own)
 * to fit the world. The origin is the sheet's anchor: horizontally the centre of the IDLE pose,
 * vertically the ground line under the IDLE pose's feet, and z = 0 is the sprite plane.
 */
import * as THREE from 'three';
import { ASSET_BASE, FRAME_PX, type AssetManifest, type SheetEntry, type SheetRow } from '../../types';
import { analyseRect, detectFrames, meshGrid, type ExtrudeOptions, type PixelSource, type VoxelMeshData } from './extrude';

export type { PixelSource, ExtrudeOptions, VoxelMeshData } from './extrude';
export { extrudeRect, detectFrames, analyseRect, meshGrid } from './extrude';

/**
 * Suggested world scale: 1 tile = 1 world unit, and a 48 px frame spans 2 tiles, which makes a
 * standing cat (about 20 px wide) roughly 0.85 tiles long.
 */
export const VOXEL_WORLD_SCALE = 1 / 24;

export interface VoxelSheet {
  /** Sheet id (breed / dog id). */
  id: string;
  name: string;
  url: string;
  frame: number;
  cols: number;
  rows: SheetRow[];
  pixels: PixelSource;
  /** Pivot inside a frame, in frame pixel coordinates (see ExtrudeOptions.anchorX/anchorY). */
  anchorX: number;
  anchorY: number;
}

// ---------------------------------------------------------------------------------------------
// Manifest and pixel loading
// ---------------------------------------------------------------------------------------------

let manifestPromise: Promise<AssetManifest> | null = null;

/** Absolute (`https:`, `data:`, `blob:`...) and root-relative paths are used as they are. */
const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/)/i;

export function assetUrl(path: string, base = ASSET_BASE): string {
  return ABSOLUTE_URL.test(path) ? path : base + path;
}

/**
 * What loadVoxelSheet needs: a manifest entry, or a sheet whose rows are not known yet (a player's
 * own cat from the client). Without `rows`, frames are detected from the pixels and the rows are
 * named from `rowNames` (in sheet order), else ROW0, ROW1, ...
 */
export type SheetSource = Omit<SheetEntry, 'rows'> & { rows?: SheetRow[]; rowNames?: readonly string[] };

export function loadManifest(base = ASSET_BASE): Promise<AssetManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(base + 'manifest.json').then((r) => {
      if (!r.ok) throw new Error(`manifest.json: HTTP ${r.status}`);
      return r.json() as Promise<AssetManifest>;
    });
    manifestPromise.catch(() => {
      manifestPromise = null;
    });
  }
  return manifestPromise;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      // decode() finishes the PNG decode off the main thread; without it the first drawImage in
      // imageToPixels decodes synchronously. Resolve anyway if decode() is missing or refuses.
      img.onload = () => {
        if (typeof img.decode === 'function') img.decode().then(() => resolve(img), () => resolve(img));
        else resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image ${url}`));
      img.src = url;
    });
    imageCache.set(url, p);
    p.catch(() => imageCache.delete(url));
  }
  return p;
}

/** Draw an image to a canvas and read RGBA pixels. Optional target size (downsampling). */
let readCtx: CanvasRenderingContext2D | null = null;

export function imageToPixels(img: CanvasImageSource & { width: number; height: number }, width?: number, height?: number, smooth = false): PixelSource {
  const w = width ?? img.width;
  const h = height ?? img.height;
  // One scratch canvas for every read-back (getImageData copies the pixels out).
  if (!readCtx) readCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const ctx = readCtx;
  if (!ctx) throw new Error('2D canvas unavailable');
  const canvas = ctx.canvas;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.imageSmoothingEnabled = smooth;
  if (smooth) ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  return { width: w, height: h, data };
}

const pixelCache = new Map<string, Promise<PixelSource>>();

export function loadPixels(url: string): Promise<PixelSource> {
  let p = pixelCache.get(url);
  if (!p) {
    p = loadImage(url).then((img) => imageToPixels(img));
    pixelCache.set(url, p);
    p.catch(() => pixelCache.delete(url));
  }
  return p;
}

const sheetCache = new Map<string, Promise<VoxelSheet>>();

function pickAnchorRow(rows: SheetRow[]): SheetRow | undefined {
  return rows.find((r) => r.name === 'IDLE' && r.frames > 0) ?? rows.find((r) => r.name === 'WALKING' && r.frames > 0) ?? rows.find((r) => r.frames > 0);
}

/**
 * Load a sheet described by a manifest entry. If the entry has no rows, frames are detected from
 * the pixels (rows are then named from `rowNames`, else ROW0, ROW1, ...).
 */
export function loadVoxelSheet(entry: SheetSource, base = ASSET_BASE, frame = FRAME_PX): Promise<VoxelSheet> {
  const url = assetUrl(entry.sheet, base);
  let p = sheetCache.get(url);
  if (!p) {
    p = loadPixels(url).then((pixels) => {
      let rows = entry.rows;
      if (!rows || rows.length === 0) {
        rows = detectRows(pixels, frame, entry.rowNames);
      }
      const a = pickAnchorRow(rows);
      const anchorX = a ? Math.round((a.bounds.minX + a.bounds.maxX + 1) / 2) : frame / 2;
      const anchorY = a ? a.bounds.maxY + 1 : frame;
      return {
        id: entry.id,
        name: entry.name,
        url,
        frame,
        cols: entry.cols ?? Math.floor(pixels.width / frame),
        rows,
        pixels,
        anchorX,
        anchorY,
      };
    });
    sheetCache.set(url, p);
    p.catch(() => sheetCache.delete(url));
  }
  return p;
}

/** Rows detected from the pixels: frame counts, opaque bounds, and names (`names[i]`, else ROWi). */
export function detectRows(pixels: PixelSource, frame = FRAME_PX, names?: readonly string[]): SheetRow[] {
  return detectFrames(pixels, frame).map((frames, i) => ({
    name: (names?.[i] ?? `ROW${i}`).toUpperCase(),
    frames,
    bounds: rowBounds(pixels, frame, i, frames),
  }));
}

function rowBounds(px: PixelSource, frame: number, row: number, frames: number) {
  let minX = frame, minY = frame, maxX = -1, maxY = -1;
  for (let c = 0; c < frames; c++) {
    for (let y = 0; y < frame; y++) {
      for (let x = 0; x < frame; x++) {
        const o = ((row * frame + y) * px.width + c * frame + x) * 4;
        if (px.data[o + 3] > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  return maxX < 0 ? { minX: 0, minY: 0, maxX: frame - 1, maxY: frame - 1 } : { minX, minY, maxX, maxY };
}

/** Row index by name (case-insensitive); -1 when missing. */
export function rowIndex(sheet: { rows: SheetRow[] }, name: string): number {
  const n = name.toUpperCase();
  return sheet.rows.findIndex((r) => r.name === n);
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

export function meshDataToGeometry(d: VoxelMeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(d.colors, 3));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1));
  g.boundingBox = new THREE.Box3(new THREE.Vector3(...d.min), new THREE.Vector3(...d.max));
  g.boundingSphere = new THREE.Sphere();
  g.boundingBox.getBoundingSphere(g.boundingSphere);
  g.userData.voxels = d.voxels;
  g.userData.triangles = d.triangles;
  return g;
}

const geomCache = new Map<string, THREE.BufferGeometry>();
const EMPTY = new THREE.BufferGeometry();

/** Default extrusion for sprite frames: depth = 2 + min(distance to transparent, 3). */
/** Lavender rim on dark silhouette edges so black cats / dogs read on the dark plum floor. */
export const SPRITE_RIM: NonNullable<ExtrudeOptions['rim']> = { color: 0x9966cc, amount: 0.55, maxLuma: 0.2 };
export const SPRITE_EXTRUDE: ExtrudeOptions = { baseDepth: 2, maxExtra: 3, rim: SPRITE_RIM };
/**
 * Low-detail preset: flat 3-voxel slab, no depth steps. About half the triangles of SPRITE_EXTRUDE
 * (e.g. bob IDLE 1512 -> 692). Use for distant / crowd figures (Cat Yard LOD).
 */
export const SPRITE_EXTRUDE_LOD: ExtrudeOptions = { baseDepth: 3, maxExtra: 0, rim: SPRITE_RIM };

/**
 * Cached voxel geometry for one frame. Out-of-range rows/frames clamp to the nearest valid frame.
 * Returns a shared empty geometry for empty rows.
 */
export function getFrameGeometry(sheet: VoxelSheet, row: number, frame: number, opts: ExtrudeOptions = SPRITE_EXTRUDE): THREE.BufferGeometry {
  const r = Math.max(0, Math.min(sheet.rows.length - 1, row | 0));
  const count = sheet.rows[r]?.frames ?? 0;
  if (count <= 0) return EMPTY;
  const f = ((frame | 0) % count + count) % count;
  const key =
    opts === SPRITE_EXTRUDE
      ? `${sheet.url}|${r}|${f}`
      : opts === SPRITE_EXTRUDE_LOD
        ? `${sheet.url}|${r}|${f}|lod`
        : `${sheet.url}|${r}|${f}|${JSON.stringify(opts)}`;
  let g = geomCache.get(key);
  if (!g) {
    const fs = sheet.frame;
    const grid = analyseRect(sheet.pixels, { x: f * fs, y: r * fs, w: fs, h: fs }, opts);
    g = meshDataToGeometry(meshGrid(grid, { ...opts, anchorX: sheet.anchorX, anchorY: sheet.anchorY }));
    g.name = key;
    geomCache.set(key, g);
  }
  return g;
}

/** Build and cache all frames of the given rows (default: all) up front, e.g. behind a loading screen. */
export function prewarmSheet(sheet: VoxelSheet, rows?: number[]): number {
  let tris = 0;
  const list = rows ?? sheet.rows.map((_, i) => i);
  for (const r of list) {
    for (let f = 0; f < (sheet.rows[r]?.frames ?? 0); f++) tris += (getFrameGeometry(sheet, r, f).userData.triangles as number) ?? 0;
  }
  return tris;
}

/** Dispose every cached geometry (call when the whole voxel world is torn down). */
export function clearVoxelCache(): void {
  for (const g of geomCache.values()) g.dispose();
  geomCache.clear();
  for (const g of iconCache.values()) g.then((x) => x.dispose()).catch(() => undefined);
  iconCache.clear();
}

export function voxelCacheSize(): number {
  return geomCache.size;
}

// ---------------------------------------------------------------------------------------------
// Icons (coin, catnip, heart, paw...)
// ---------------------------------------------------------------------------------------------

const iconCache = new Map<string, Promise<THREE.BufferGeometry>>();

export interface VoxelizeImageOptions extends ExtrudeOptions {
  /** Target resolution of the longest side in voxels. Default 16. */
  size?: number;
  /** Use smoothing when downsampling (better for painted art). Default true. */
  smooth?: boolean;
}

/**
 * Voxelize an image (URL or already-loaded pixels) at `size` voxels on its longest side.
 * The result is centred on the origin in x and y (unlike sprite frames, which stand on y = 0).
 * Default depth for icons is thinner: 1 + min(distance, 2).
 */
export function voxelizeImage(src: string | PixelSource, opts: VoxelizeImageOptions = {}): Promise<THREE.BufferGeometry> {
  const size = opts.size ?? 16;
  const key = typeof src === 'string' ? `${src}|${size}|${JSON.stringify(opts)}` : '';
  if (key) {
    const hit = iconCache.get(key);
    if (hit) return hit;
  }
  const build = async (): Promise<THREE.BufferGeometry> => {
    let px: PixelSource;
    if (typeof src === 'string') {
      const img = await loadImage(src);
      const s = size / Math.max(img.width, img.height);
      px = imageToPixels(img, Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)), opts.smooth ?? true);
    } else {
      px = src.width > size || src.height > size ? downsample(src, size) : src;
    }
    const eo: ExtrudeOptions = { baseDepth: 1, maxExtra: 2, ...opts, anchorX: px.width / 2, anchorY: px.height / 2 };
    const g = meshDataToGeometry(meshGrid(analyseRect(px, { x: 0, y: 0, w: px.width, h: px.height }, eo), eo));
    g.name = key || 'icon';
    return g;
  };
  const p = build();
  if (key) {
    iconCache.set(key, p);
    p.catch(() => iconCache.delete(key));
  }
  return p;
}

/** Box-filter downsample of raw pixels to at most `size` on the longest side (premultiplied alpha). */
export function downsample(src: PixelSource, size: number): PixelSource {
  const s = size / Math.max(src.width, src.height);
  const w = Math.max(1, Math.round(src.width * s));
  const h = Math.max(1, Math.round(src.height * s));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * src.height) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * src.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * src.width) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * src.width) / w));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const o = (yy * src.width + xx) * 4;
          const al = src.data[o + 3];
          r += src.data[o] * al;
          g += src.data[o + 1] * al;
          b += src.data[o + 2] * al;
          a += al;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      }
      out[o + 3] = a / n;
    }
  }
  return { width: w, height: h, data: out };
}

// ---------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------

let sharedLambert: THREE.MeshLambertMaterial | null = null;
let sharedToon: THREE.MeshToonMaterial | null = null;

/**
 * Shared vertex-coloured material for voxel meshes. 'lambert' (default) is cheapest; 'toon' uses a
 * 3-step ramp for a flatter look.
 */
export function getVoxelMaterial(kind: 'lambert' | 'toon' = 'lambert'): THREE.Material {
  if (kind === 'toon') {
    if (!sharedToon) {
      const ramp = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
      ramp.minFilter = THREE.NearestFilter;
      ramp.magFilter = THREE.NearestFilter;
      ramp.needsUpdate = true;
      sharedToon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: ramp });
    }
    return sharedToon;
  }
  if (!sharedLambert) sharedLambert = new THREE.MeshLambertMaterial({ vertexColors: true });
  return sharedLambert;
}
