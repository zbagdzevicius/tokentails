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
  const n = w * h;
  const dist = new Uint8Array(n);
  const queue = new Int32Array(n);
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
  // Neighbours in the order left, right, up, down (no per-pixel array).
  while (qh < qt) {
    const i = queue[qh++];
    const d = dist[i];
    if (d >= maxExtra) continue;
    const x = i % w;
    const d1 = d + 1;
    let j = i - 1;
    if (x > 0 && solid[j] && !dist[j]) { dist[j] = d1; queue[qt++] = j; }
    j = i + 1;
    if (x < w - 1 && solid[j] && !dist[j]) { dist[j] = d1; queue[qt++] = j; }
    j = i - w;
    if (j >= 0 && solid[j] && !dist[j]) { dist[j] = d1; queue[qt++] = j; }
    j = i + w;
    if (j < n && solid[j] && !dist[j]) { dist[j] = d1; queue[qt++] = j; }
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

/**
 * Growable typed-array quad writer. Writing straight into typed arrays (instead of pushing into
 * plain arrays and copying at the end) and keeping the current colour in fields (instead of a
 * tuple per face) removes nearly all per-face allocation; the output is byte-identical.
 */
class MeshBuilder {
  pos = new Float32Array(12 * 256);
  nrm = new Float32Array(12 * 256);
  col = new Float32Array(12 * 256);
  idx = new Uint32Array(6 * 256);
  /** Quads written. */
  q = 0;
  r = 0;
  g = 0;
  b = 0;

  reset(): this {
    this.q = 0;
    return this;
  }

  private grow(): void {
    const n = this.pos.length * 2;
    const f = (a: Float32Array) => {
      const o = new Float32Array(n);
      o.set(a);
      return o;
    };
    this.pos = f(this.pos);
    this.nrm = f(this.nrm);
    this.col = f(this.col);
    const idx = new Uint32Array(this.idx.length * 2);
    idx.set(this.idx);
    this.idx = idx;
  }

  /** Set the colour of the following quads (see the original `unpack`). */
  color(c: number, mul: number, linear: boolean): void {
    const r = (c >> 16) & 255;
    const g = (c >> 8) & 255;
    const b = c & 255;
    if (linear) {
      this.r = Math.min(1, SRGB_LUT[r] * mul);
      this.g = Math.min(1, SRGB_LUT[g] * mul);
      this.b = Math.min(1, SRGB_LUT[b] * mul);
    } else {
      this.r = Math.min(1, (r / 255) * mul);
      this.g = Math.min(1, (g / 255) * mul);
      this.b = Math.min(1, (b / 255) * mul);
    }
  }

  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
  ): void {
    if ((this.q + 1) * 12 > this.pos.length) this.grow();
    const o = this.q * 12;
    const p = this.pos;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az;
    p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
    p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz;
    p[o + 9] = dx; p[o + 10] = dy; p[o + 11] = dz;
    const nm = this.nrm;
    const cl = this.col;
    const { r, g, b } = this;
    for (let k = o; k < o + 12; k += 3) {
      nm[k] = nx; nm[k + 1] = ny; nm[k + 2] = nz;
      cl[k] = r; cl[k + 1] = g; cl[k + 2] = b;
    }
    const v = this.q * 4;
    const io = this.q * 6;
    const ix = this.idx;
    // a b c d are counter-clockwise when viewed from the normal side.
    ix[io] = v; ix[io + 1] = v + 1; ix[io + 2] = v + 2;
    ix[io + 3] = v; ix[io + 4] = v + 2; ix[io + 5] = v + 3;
    this.q++;
  }

  /** Wall strips between depth dA and a shallower neighbour dB (0 = empty) on an x boundary. */
  wallX(sx: number, xe: number, yBot: number, yTop: number, dA: number, dB: number): void {
    if (dB === 0) this.stripX(sx, xe, yBot, yTop, -dA / 2, dA / 2);
    else {
      this.stripX(sx, xe, yBot, yTop, dB / 2, dA / 2);
      this.stripX(sx, xe, yBot, yTop, -dA / 2, -dB / 2);
    }
  }

  private stripX(sx: number, xe: number, yBot: number, yTop: number, z0: number, z1: number): void {
    if (sx > 0) this.quad(xe, yBot, z1, xe, yBot, z0, xe, yTop, z0, xe, yTop, z1, 1, 0, 0);
    else this.quad(xe, yBot, z0, xe, yBot, z1, xe, yTop, z1, xe, yTop, z0, -1, 0, 0);
  }

  /** Wall strips on a y boundary (up = +y normal). */
  wallY(up: boolean, ye: number, x0: number, x1: number, dA: number, dB: number): void {
    if (dB === 0) this.stripY(up, ye, x0, x1, -dA / 2, dA / 2);
    else {
      this.stripY(up, ye, x0, x1, dB / 2, dA / 2);
      this.stripY(up, ye, x0, x1, -dA / 2, -dB / 2);
    }
  }

  private stripY(up: boolean, ye: number, x0: number, x1: number, z0: number, z1: number): void {
    if (up) this.quad(x0, ye, z1, x1, ye, z1, x1, ye, z0, x0, ye, z0, 0, 1, 0);
    else this.quad(x0, ye, z0, x1, ye, z0, x1, ye, z1, x0, ye, z1, 0, -1, 0);
  }
}

const BUILDER = new MeshBuilder();

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
  // One builder is reused across calls (single-threaded; outputs are copied out with slice()).
  const mb = BUILDER.reset();
  // Output x of image column x is x - ax; output y of image row edge y is ay - y.

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
      for (let yy = 0; yy < rh; yy++) for (let j = (y + yy) * w + x, e = j + rw; j < e; j++) used[j] = 1;
      const x0 = x - ax, x1 = x + rw - ax, yTop = ay - y, yBot = ay - (y + rh);
      const z = d / 2;
      mb.color(c, shade.front, linear);
      mb.quad(x0, yBot, z, x1, yBot, z, x1, yTop, z, x0, yTop, z, 0, 0, 1);
      mb.color(c, shade.back, linear);
      mb.quad(x1, yBot, -z, x0, yBot, -z, x0, yTop, -z, x1, yTop, -z, 0, 0, -1);
    }
  }

  // ---- side walls ----
  // For pixel A and neighbour B in a direction: if B is empty the wall spans z in [-dA/2, dA/2];
  // if B is shallower, two strips [dB/2, dA/2] and [-dA/2, -dB/2]; otherwise nothing.
  // Walls along the same boundary line with identical (colour, dA, dB) are merged into runs.

  // Vertical boundaries (normals +x / -x), iterate columns, run along y.
  for (let pass = 0; pass < 2; pass++) {
    const sx = pass === 0 ? 1 : -1;
    for (let x = 0; x < w; x++) {
      const nx = x + sx;
      const nIn = nx >= 0 && nx < w;
      let y = 0;
      while (y < h) {
        const i = y * w + x;
        const dA = depth[i];
        const dB = nIn ? depth[i + sx] : 0;
        if (!dA || dB >= dA) {
          y++;
          continue;
        }
        const c = color[i];
        let run = 1;
        for (let j = i + w; y + run < h; j += w) {
          if (depth[j] !== dA || (nIn ? depth[j + sx] : 0) !== dB || color[j] !== c) break;
          run++;
        }
        const xe = sx > 0 ? x + 1 - ax : x - ax;
        mb.color(c, shade.side, linear);
        mb.wallX(sx, xe, ay - (y + run), ay - y, dA, dB);
        y += run;
      }
    }
  }

  // Horizontal boundaries (normals +y up / -y down), iterate rows, run along x.
  // Up in output = previous image row (y - 1).
  for (let pass = 0; pass < 2; pass++) {
    const up = pass === 0;
    const sy = up ? -1 : 1;
    const mul = up ? shade.top : shade.bottom;
    for (let y = 0; y < h; y++) {
      const ny = y + sy;
      const nIn = ny >= 0 && ny < h;
      const off = sy * w;
      const row = y * w;
      let x = 0;
      while (x < w) {
        const i = row + x;
        const dA = depth[i];
        const dB = nIn ? depth[i + off] : 0;
        if (!dA || dB >= dA) {
          x++;
          continue;
        }
        const c = color[i];
        let run = 1;
        for (let j = i + 1; x + run < w; j++) {
          if (depth[j] !== dA || (nIn ? depth[j + off] : 0) !== dB || color[j] !== c) break;
          run++;
        }
        const ye = up ? ay - y : ay - (y + 1);
        mb.color(c, mul, linear);
        mb.wallY(up, ye, x - ax, x + run - ax, dA, dB);
        x += run;
      }
    }
  }

  const quads = mb.q;
  const positions = mb.pos.slice(0, quads * 12);
  const vcount = quads * 4;
  const idx = mb.idx.subarray(0, quads * 6);
  const indices = vcount > 65535 ? idx.slice() : new Uint16Array(idx);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const min: [number, number, number] = vcount === 0 ? [0, 0, 0] : [x0, y0, z0];
  const max: [number, number, number] = vcount === 0 ? [0, 0, 0] : [x1, y1, z1];
  return {
    positions,
    normals: mb.nrm.slice(0, quads * 12),
    colors: mb.col.slice(0, quads * 12),
    indices,
    voxels: grid.count,
    triangles: quads * 2,
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
