/**
 * Pure pixel -> voxel extrusion (no three.js, no DOM), so it runs in Node tests and workers.
 *
 * Every opaque pixel becomes a column of voxels perpendicular to the sprite plane, centred on it
 * (z = 0). Its depth grows with the distance to the nearest transparent pixel, so figures look
 * rounded: depth = baseDepth + min(distance, maxExtra), with distance = 1 for edge pixels.
 *
 * Output units: 1 pixel = 1 unit. +x = sprite right, +y = up (image rows are flipped),
 * +z = towards the viewer of the sprite's front. Faces hidden by a neighbouring voxel are culled,
 * and coplanar faces of the same colour are merged (greedy rectangles for front/back caps, runs
 * for side walls), which keeps a typical 48x48 cat frame at a few hundred triangles.
 */

export interface PixelSource {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8ClampedArray | Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExtrudeOptions {
  /** Depth of a lone / edge-less pixel minus one. Default 2 (edge pixels become 3 deep). */
  baseDepth?: number;
  /** Extra depth cap for interior pixels. Default 3 (max depth 5). */
  maxExtra?: number;
  /** Alpha at or above which a pixel is solid. Default 128. */
  alphaThreshold?: number;
  /**
   * Pixel coordinate (inside the rect, may be fractional) that becomes the origin.
   * x: horizontal pivot (flip axis). y: ground line, i.e. the TOP edge of the pixel row just
   * below the feet (so the bottom-most pixel row with maxY sits on y=0 when anchorY = maxY + 1).
   * Default: centre bottom of the rect.
   */
  anchorX?: number;
  anchorY?: number;
  /** Colour multipliers per face direction (applied in linear space). */
  shade?: Partial<FaceShade>;
  /** Decode sRGB pixels to linear vertex colours (three.js ColorManagement). Default true. */
  linear?: boolean;
  /**
   * Rim light: silhouette-edge pixels darker than `maxLuma` (0..1) are blended `amount` of the way
   * towards `color` (0xRRGGBB), so dark sprites stay readable on dark floors. Default off.
   */
  rim?: { color: number; amount: number; maxLuma: number };
}

export interface FaceShade {
  front: number;
  back: number;
  side: number;
  top: number;
  bottom: number;
}

const DEFAULT_SHADE: FaceShade = { front: 1.0, back: 0.82, side: 0.72, top: 1.18, bottom: 0.55 };

export interface VoxelMeshData {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array | Uint32Array;
  /** Number of solid pixels. */
  voxels: number;
  triangles: number;
  /** Bounds of the output in output units. */
  min: [number, number, number];
  max: [number, number, number];
}

const SRGB_LUT = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();

/** Per-pixel analysis of a rect: solid mask, packed colour and depth. */
export interface PixelGrid {
  w: number;
  h: number;
  /** 0 = transparent, otherwise depth in voxels. */
  depth: Uint8Array;
  /** Packed 0xRRGGBB, valid where depth > 0. */
  color: Uint32Array;
  count: number;
}

export function analyseRect(src: PixelSource, rect: Rect, opts: ExtrudeOptions = {}): PixelGrid {
  const { w, h } = rect;
  const thr = opts.alphaThreshold ?? 128;
  const base = opts.baseDepth ?? 2;
  const maxExtra = opts.maxExtra ?? 3;
  const solid = new Uint8Array(w * h);
  const color = new Uint32Array(w * h);
  let count = 0;
  for (let y = 0; y < h; y++) {
    const sy = rect.y + y;
    if (sy < 0 || sy >= src.height) continue;
    for (let x = 0; x < w; x++) {
      const sx = rect.x + x;
      if (sx < 0 || sx >= src.width) continue;
      const o = (sy * src.width + sx) * 4;
      if (src.data[o + 3] >= thr) {
        const i = y * w + x;
        solid[i] = 1;
        color[i] = (src.data[o] << 16) | (src.data[o + 1] << 8) | src.data[o + 2];
        count++;
      }
    }
  }
  // 4-connected BFS distance to the nearest transparent pixel (out-of-rect counts as transparent).
  const dist = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid[i]) continue;
      const edge =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 || !solid[i - 1] || !solid[i + 1] || !solid[i - w] || !solid[i + w];
      if (edge) {
        dist[i] = 1;
        queue[qt++] = i;
      }
    }
  }
  while (qh < qt) {
    const i = queue[qh++];
    const d = dist[i];
    if (d >= maxExtra) continue;
    const x = i % w;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
    for (const n of nb) {
      if (n < 0 || n >= w * h || !solid[n] || dist[n]) continue;
      dist[n] = d + 1;
      queue[qt++] = n;
    }
  }
  const depth = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (solid[i]) depth[i] = base + Math.min(dist[i] || maxExtra, maxExtra);
  }
  const rim = opts.rim;
  if (rim && rim.amount > 0) {
    const rr = (rim.color >> 16) & 255, rg = (rim.color >> 8) & 255, rb = rim.color & 255;
    const k = Math.min(1, rim.amount);
    for (let i = 0; i < w * h; i++) {
      if (!solid[i] || dist[i] !== 1) continue;
      const c = color[i];
      const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      if ((0.299 * r + 0.587 * g + 0.114 * b) / 255 > rim.maxLuma) continue;
      color[i] = (Math.round(r + (rr - r) * k) << 16) | (Math.round(g + (rg - g) * k) << 8) | Math.round(b + (rb - b) * k);
    }
  }
  return { w, h, depth, color, count };
}

class MeshBuilder {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  private v = 0;

  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
    r: number, g: number, b: number,
  ): void {
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let k = 0; k < 4; k++) {
      this.nrm.push(nx, ny, nz);
      this.col.push(r, g, b);
    }
    const v = this.v;
    // a b c d are counter-clockwise when viewed from the normal side.
    this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.v += 4;
  }
}

function unpack(c: number, mul: number, linear: boolean): [number, number, number] {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  if (linear) {
    return [Math.min(1, SRGB_LUT[r] * mul), Math.min(1, SRGB_LUT[g] * mul), Math.min(1, SRGB_LUT[b] * mul)];
  }
  return [Math.min(1, (r / 255) * mul), Math.min(1, (g / 255) * mul), Math.min(1, (b / 255) * mul)];
}

/**
 * Build voxel mesh data from a grid. Positions: pixel column x spans [x - ax, x + 1 - ax];
 * pixel row y spans [ay - y - 1, ay - y] (image rows grow downwards, output y grows upwards).
 */
export function meshGrid(grid: PixelGrid, opts: ExtrudeOptions = {}): VoxelMeshData {
  const { w, h, depth, color } = grid;
  const ax = opts.anchorX ?? w / 2;
  const ay = opts.anchorY ?? h;
  const shade: FaceShade = { ...DEFAULT_SHADE, ...opts.shade };
  const linear = opts.linear ?? true;
  const mb = new MeshBuilder();
  const X = (x: number) => x - ax;
  const Y = (y: number) => ay - y; // image-space y edge -> output y
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : depth[y * w + x]);

  // ---- front (+z) and back (-z) caps: greedy rectangles over (colour, depth) ----
  const used = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = depth[i];
      if (!d || used[i]) continue;
      const c = color[i];
      let rw = 1;
      while (x + rw < w) {
        const j = i + rw;
        if (used[j] || depth[j] !== d || color[j] !== c) break;
        rw++;
      }
      let rh = 1;
      outer: while (y + rh < h) {
        for (let k = 0; k < rw; k++) {
          const j = (y + rh) * w + x + k;
          if (used[j] || depth[j] !== d || color[j] !== c) break outer;
        }
        rh++;
      }
      for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < rw; xx++) used[(y + yy) * w + x + xx] = 1;
      const x0 = X(x), x1 = X(x + rw), yTop = Y(y), yBot = Y(y + rh);
      const z = d / 2;
      const [fr, fg, fb] = unpack(c, shade.front, linear);
      mb.quad(x0, yBot, z, x1, yBot, z, x1, yTop, z, x0, yTop, z, 0, 0, 1, fr, fg, fb);
      const [br, bg, bb] = unpack(c, shade.back, linear);
      mb.quad(x1, yBot, -z, x0, yBot, -z, x0, yTop, -z, x1, yTop, -z, 0, 0, -1, br, bg, bb);
    }
  }

  // ---- side walls ----
  // For pixel A and neighbour B in a direction: if B is empty the wall spans z in [-dA/2, dA/2];
  // if B is shallower, two strips [dB/2, dA/2] and [-dA/2, -dB/2]; otherwise nothing.
  // Walls along the same boundary line with identical (colour, dA, dB) are merged into runs.

  // Vertical boundaries (normals +x / -x), iterate columns, run along y.
  for (const sx of [1, -1] as const) {
    for (let x = 0; x < w; x++) {
      let y = 0;
      while (y < h) {
        const dA = at(x, y);
        const dB = at(x + sx, y);
        if (!dA || dB >= dA) {
          y++;
          continue;
        }
        const c = color[y * w + x];
        let run = 1;
        while (y + run < h && at(x, y + run) === dA && at(x + sx, y + run) === dB && color[(y + run) * w + x] === c) run++;
        const xe = sx > 0 ? X(x + 1) : X(x);
        const yTop = Y(y), yBot = Y(y + run);
        const [r, g, b] = unpack(c, shade.side, linear);
        const strips: [number, number][] = dB === 0 ? [[-dA / 2, dA / 2]] : [[dB / 2, dA / 2], [-dA / 2, -dB / 2]];
        for (const [z0, z1] of strips) {
          if (sx > 0) mb.quad(xe, yBot, z1, xe, yBot, z0, xe, yTop, z0, xe, yTop, z1, 1, 0, 0, r, g, b);
          else mb.quad(xe, yBot, z0, xe, yBot, z1, xe, yTop, z1, xe, yTop, z0, -1, 0, 0, r, g, b);
        }
        y += run;
      }
    }
  }

  // Horizontal boundaries (normals +y up / -y down), iterate rows, run along x.
  // Up in output = previous image row (y - 1).
  for (const up of [true, false]) {
    const sy = up ? -1 : 1;
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const dA = at(x, y);
        const dB = at(x, y + sy);
        if (!dA || dB >= dA) {
          x++;
          continue;
        }
        const c = color[y * w + x];
        let run = 1;
        while (x + run < w && at(x + run, y) === dA && at(x + run, y + sy) === dB && color[y * w + x + run] === c) run++;
        const ye = up ? Y(y) : Y(y + 1);
        const x0 = X(x), x1 = X(x + run);
        const [r, g, b] = unpack(c, up ? shade.top : shade.bottom, linear);
        const strips: [number, number][] = dB === 0 ? [[-dA / 2, dA / 2]] : [[dB / 2, dA / 2], [-dA / 2, -dB / 2]];
        for (const [z0, z1] of strips) {
          if (up) mb.quad(x0, ye, z1, x1, ye, z1, x1, ye, z0, x0, ye, z0, 0, 1, 0, r, g, b);
          else mb.quad(x0, ye, z0, x1, ye, z0, x1, ye, z1, x0, ye, z1, 0, -1, 0, r, g, b);
        }
        x += run;
      }
    }
  }

  const positions = new Float32Array(mb.pos);
  const vcount = positions.length / 3;
  const indices = vcount > 65535 ? new Uint32Array(mb.idx) : new Uint16Array(mb.idx);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  if (vcount === 0) {
    min.fill(0);
    max.fill(0);
  }
  return {
    positions,
    normals: new Float32Array(mb.nrm),
    colors: new Float32Array(mb.col),
    indices,
    voxels: grid.count,
    triangles: mb.idx.length / 3,
    min,
    max,
  };
}

/** Convenience: analyse + mesh one rect of a pixel source. */
export function extrudeRect(src: PixelSource, rect: Rect, opts: ExtrudeOptions = {}): VoxelMeshData {
  return meshGrid(analyseRect(src, rect, opts), opts);
}

/** Count visible pixels in a rect (alpha > 0). */
export function countOpaque(src: PixelSource, rect: Rect): number {
  let n = 0;
  for (let y = rect.y; y < rect.y + rect.h && y < src.height; y++) {
    for (let x = rect.x; x < rect.x + rect.w && x < src.width; x++) {
      if (src.data[(y * src.width + x) * 4 + 3] > 0) n++;
    }
  }
  return n;
}

/**
 * Detect frame counts per row: the contiguous run of tiles (from column 0) with at least
 * `minPixels` visible pixels. Mirrors scripts/import-assets.mjs.
 */
export function detectFrames(src: PixelSource, frame: number, minPixels = 4): number[] {
  const cols = Math.floor(src.width / frame);
  const rows = Math.floor(src.height / frame);
  const out: number[] = [];
  for (let r = 0; r < rows; r++) {
    let n = 0;
    for (let c = 0; c < cols; c++) {
      if (countOpaque(src, { x: c * frame, y: r * frame, w: frame, h: frame }) < minPixels) break;
      n++;
    }
    out.push(n);
  }
  return out;
}
